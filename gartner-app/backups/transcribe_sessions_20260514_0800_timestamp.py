#!/usr/bin/env python3
"""
Transcribes session video files using Google Speech-to-Text API.

For each {session_id}_stream.mp4 in session_details/:
  - Skips if {session_id}_transcription.txt already exists
  - Extracts ALL audio in one ffmpeg pass → full.flac
  - Processes chunks in parallel (extract + API call) using a thread pool
  - Saves each chunk result immediately to {session_id}_chunks/chunk_NNNN.txt
    — resumable on interrupt, no duplicate API calls
  - Combines chunks into {session_id}_transcription.txt and cleans up

Usage:
    python3 transcribe_sessions.py
"""

import os
import re
import json
import base64
import subprocess
import tempfile
import threading
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv()

GOOGLE_STT_API_KEY = os.getenv("GOOGLE_STT_API_KEY")
if not GOOGLE_STT_API_KEY:
    raise RuntimeError("GOOGLE_STT_API_KEY not found in .env")

SESSION_DIR = Path(__file__).parent / "session_details"
SAMPLE_RATE = 16000
CHUNK_SECONDS = 45      # Conservative — sync API rejects anything over 60s
LANGUAGE_CODE = "en-US"
MAX_WORKERS = 8         # Parallel API calls per session


# ---------------------------------------------------------------------------
# Audio helpers
# ---------------------------------------------------------------------------

def get_duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "json",
            str(path),
        ],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def extract_full_audio(video_path: Path, out_flac: Path) -> None:
    """Extract entire audio track as mono 16 kHz FLAC (one ffmpeg pass)."""
    with tqdm(desc=f"  Extracting audio", unit="", leave=False, bar_format="{desc} {elapsed}"):
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(video_path),
                "-vn",
                "-ac", "1",
                "-ar", str(SAMPLE_RATE),
                "-f", "flac",
                str(out_flac),
            ],
            capture_output=True, check=True,
        )


def extract_chunk(full_flac: Path, start: float, duration: float, out: Path) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-ss", f"{start:.3f}",
            "-t", f"{duration:.3f}",
            "-i", str(full_flac),
            "-ac", "1",
            "-ar", str(SAMPLE_RATE),
            str(out),
        ],
        capture_output=True, check=True,
    )


def compute_chunk_starts(total_duration: float) -> list[float]:
    starts, t = [], 0.0
    while t < total_duration:
        starts.append(t)
        t += CHUNK_SECONDS
    return starts


# ---------------------------------------------------------------------------
# Google STT
# ---------------------------------------------------------------------------

def parse_duration_seconds(duration_str: str) -> float:
    return float(duration_str.rstrip("s"))


def format_timestamp(total_seconds: float) -> str:
    total_seconds = int(total_seconds)
    h = total_seconds // 3600
    m = (total_seconds % 3600) // 60
    s = total_seconds % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


def call_stt_api(flac_path: Path, chunk_start: float) -> str:
    """
    Call Google STT and return lines formatted as:
        [HH:MM:SS] transcript text
    Timestamps are absolute (chunk_start offset applied).
    """
    audio_b64 = base64.b64encode(flac_path.read_bytes()).decode("utf-8")
    payload = {
        "config": {
            "encoding": "FLAC",
            "sampleRateHertz": SAMPLE_RATE,
            "languageCode": LANGUAGE_CODE,
            "enableAutomaticPunctuation": True,
            "enableWordTimeOffsets": True,
        },
        "audio": {"content": audio_b64},
    }
    url = f"https://speech.googleapis.com/v1/speech:recognize?key={GOOGLE_STT_API_KEY}"
    response = requests.post(url, json=payload, timeout=120)
    if response.status_code != 200:
        raise RuntimeError(
            f"Google STT API error {response.status_code}: {response.text}"
        )

    lines = []
    for result in response.json().get("results", []):
        alts = result.get("alternatives", [])
        if not alts:
            continue
        alt = alts[0]
        text = alt.get("transcript", "").strip()
        if not text:
            continue
        words = alt.get("words", [])
        if words:
            word_start = parse_duration_seconds(words[0].get("startTime", "0s"))
            abs_time = chunk_start + word_start
        else:
            abs_time = chunk_start
        lines.append(f"[{format_timestamp(abs_time)}] {text}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Worker — one chunk: extract → call API → persist
# ---------------------------------------------------------------------------

def process_chunk(
    idx: int,
    start: float,
    total_duration: float,
    full_flac: Path,
    tmp: Path,
    chunk_dir: Path,
    progress: tqdm,
) -> tuple[int, str]:
    """
    Returns (idx, status).
    Writes chunk_NNNN.txt on success; raises on error.
    """
    chunk_txt = chunk_dir / f"chunk_{idx:04d}.txt"

    if chunk_txt.exists():
        progress.update(1)
        return idx, "cached"

    duration = min(CHUNK_SECONDS, total_duration - start)
    chunk_flac = tmp / f"chunk_{idx:04d}.flac"

    extract_chunk(full_flac, start, duration, chunk_flac)
    text = call_stt_api(chunk_flac, chunk_start=start)
    chunk_txt.write_text(text, encoding="utf-8")

    progress.update(1)
    return idx, "done"


# ---------------------------------------------------------------------------
# Per-session transcription (parallel + resumable)
# ---------------------------------------------------------------------------

def transcribe_video(video_path: Path, session_id: str, outer_bar: tqdm) -> str:
    chunk_dir = SESSION_DIR / f"{session_id}_chunks"
    chunk_dir.mkdir(exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp = Path(tmp_dir)
        full_flac = tmp / "full.flac"

        outer_bar.set_postfix_str("extracting audio")
        extract_full_audio(video_path, full_flac)

        total_duration = get_duration(full_flac)
        starts = compute_chunk_starts(total_duration)
        total_chunks = len(starts)
        cached = sum(1 for i in range(total_chunks) if (chunk_dir / f"chunk_{i:04d}.txt").exists())

        with tqdm(
            total=total_chunks,
            initial=cached,
            desc=f"  Chunks",
            unit="chunk",
            leave=False,
            bar_format="{desc}: {n}/{total} [{bar:30}] {percentage:3.0f}% | {elapsed}<{remaining}",
        ) as chunk_bar:
            outer_bar.set_postfix_str(f"{total_chunks} chunks ({cached} cached)")

            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
                futures = {
                    pool.submit(
                        process_chunk,
                        i, start, total_duration,
                        full_flac, tmp, chunk_dir, chunk_bar,
                    ): i
                    for i, start in enumerate(starts)
                }
                for future in as_completed(futures):
                    future.result()  # re-raises any worker exception immediately

    parts = [(chunk_dir / f"chunk_{i:04d}.txt").read_text(encoding="utf-8")
             for i in range(total_chunks)]
    transcript = "\n".join(parts)

    for f in chunk_dir.glob("chunk_*.txt"):
        f.unlink()
    chunk_dir.rmdir()

    return transcript


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    video_files = sorted(SESSION_DIR.glob("*_stream.mp4"))

    if not video_files:
        print(f"No *_stream.mp4 files found in {SESSION_DIR}")
        return

    # Filter out already-done sessions upfront
    pending = []
    for video_path in video_files:
        match = re.match(r"^(.+)_stream\.mp4$", video_path.name)
        if not match:
            continue
        session_id = match.group(1)
        if not (SESSION_DIR / f"{session_id}_transcription.txt").exists():
            pending.append((video_path, session_id))

    skipped = len(video_files) - len(pending)
    print(f"Found {len(video_files)} video(s): {len(pending)} to transcribe, {skipped} already done\n")

    with tqdm(
        total=len(pending),
        desc="Sessions",
        unit="session",
        bar_format="{desc}: {n}/{total} [{bar:30}] {percentage:3.0f}% | {elapsed}<{remaining} | {postfix}",
    ) as session_bar:
        for video_path, session_id in pending:
            session_bar.set_description(f"Session {session_id}")
            transcription_path = SESSION_DIR / f"{session_id}_transcription.txt"

            try:
                transcript = transcribe_video(video_path, session_id, session_bar)
                transcription_path.write_text(transcript, encoding="utf-8")
                session_bar.set_postfix_str("saved")
            except Exception as exc:
                session_bar.set_postfix_str(f"ERROR: {exc}")
                tqdm.write(f"\n[{session_id}] ERROR: {exc}")
                tqdm.write(f"  Progress saved in {SESSION_DIR / (session_id + '_chunks')}/ — re-run to resume")

            session_bar.update(1)


if __name__ == "__main__":
    main()
