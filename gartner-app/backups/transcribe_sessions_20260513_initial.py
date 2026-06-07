#!/usr/bin/env python3
"""
Transcribes session video files using Google Speech-to-Text API.

For each {session_id}_stream.mp4 in session_details/:
  - Skips if {session_id}_transcription.txt already exists
  - Extracts ALL audio in one ffmpeg pass → full.flac
  - Splits full.flac into 50-second chunks with stream-copy (fast, no re-encode)
  - Sends each chunk to Google STT synchronous REST API
  - Writes combined transcript to {session_id}_transcription.txt
"""

import os
import re
import json
import base64
import subprocess
import tempfile
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

GOOGLE_STT_API_KEY = os.getenv("GOOGLE_STT_API_KEY")
if not GOOGLE_STT_API_KEY:
    raise RuntimeError("GOOGLE_STT_API_KEY not found in .env")

SESSION_DIR = Path(__file__).parent / "session_details"
SAMPLE_RATE = 16000
CHUNK_SECONDS = 45  # Conservative limit — sync API rejects anything over 60s
LANGUAGE_CODE = "en-US"


# ---------------------------------------------------------------------------
# Audio helpers
# ---------------------------------------------------------------------------

def get_duration(path: Path) -> float:
    """Return duration in seconds using ffprobe."""
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
    print(f"  Extracting audio from {video_path.name} …", flush=True)
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", str(video_path),
            "-vn",               # drop video stream
            "-ac", "1",          # mono
            "-ar", str(SAMPLE_RATE),
            "-f", "flac",
            str(out_flac),
        ],
        capture_output=True, check=True,
    )
    print(f"  Audio extracted → {out_flac.name}")


def split_audio(full_flac: Path, chunk_dir: Path) -> list[Path]:
    """
    Split a FLAC file into explicit CHUNK_SECONDS-length pieces using
    per-chunk -ss/-t extraction. Seeking in audio-only files is fast and
    produces exact-duration segments (unlike the segment muxer).
    Returns sorted list of chunk paths.
    """
    total = get_duration(full_flac)
    starts = []
    t = 0.0
    while t < total:
        starts.append(t)
        t += CHUNK_SECONDS

    chunk_paths = []
    for i, start in enumerate(starts):
        duration = min(CHUNK_SECONDS, total - start)
        out = chunk_dir / f"chunk_{i:04d}.flac"
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
        chunk_paths.append(out)

    return chunk_paths


# ---------------------------------------------------------------------------
# Google STT
# ---------------------------------------------------------------------------

def transcribe_chunk(flac_path: Path) -> str:
    """Send a single FLAC chunk to Google STT and return the transcript text."""
    audio_b64 = base64.b64encode(flac_path.read_bytes()).decode("utf-8")

    payload = {
        "config": {
            "encoding": "FLAC",
            "sampleRateHertz": SAMPLE_RATE,
            "languageCode": LANGUAGE_CODE,
            "enableAutomaticPunctuation": True,
        },
        "audio": {"content": audio_b64},
    }

    url = f"https://speech.googleapis.com/v1/speech:recognize?key={GOOGLE_STT_API_KEY}"
    response = requests.post(url, json=payload, timeout=120)

    if response.status_code != 200:
        raise RuntimeError(
            f"Google STT API error {response.status_code}: {response.text}"
        )

    texts = []
    for result in response.json().get("results", []):
        alternatives = result.get("alternatives", [])
        if alternatives:
            texts.append(alternatives[0].get("transcript", ""))
    return " ".join(texts)


# ---------------------------------------------------------------------------
# Per-session transcription
# ---------------------------------------------------------------------------

def transcribe_video(video_path: Path) -> str:
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp = Path(tmp_dir)
        full_flac = tmp / "full.flac"

        # Step 1: single ffmpeg pass to extract all audio
        extract_full_audio(video_path, full_flac)

        duration = get_duration(full_flac)
        print(f"  Audio duration: {duration:.1f}s", flush=True)

        # Step 2: split into chunks via stream-copy (nearly instant)
        chunks = split_audio(full_flac, tmp)
        print(f"  Split into {len(chunks)} chunk(s)")

        # Step 3: transcribe each chunk
        transcript_parts = []
        for i, chunk_path in enumerate(chunks, 1):
            print(f"  Chunk {i}/{len(chunks)}: {chunk_path.name} …", end="", flush=True)
            text = transcribe_chunk(chunk_path)
            transcript_parts.append(text)
            print(f" ✓ ({len(text)} chars)")

        return "\n".join(transcript_parts)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    video_files = sorted(SESSION_DIR.glob("*_stream.mp4"))

    if not video_files:
        print(f"No *_stream.mp4 files found in {SESSION_DIR}")
        return

    print(f"Found {len(video_files)} video file(s)\n")

    for video_path in video_files:
        match = re.match(r"^(.+)_stream\.mp4$", video_path.name)
        if not match:
            print(f"Skipping (unexpected filename): {video_path.name}")
            continue

        session_id = match.group(1)
        transcription_path = SESSION_DIR / f"{session_id}_transcription.txt"

        if transcription_path.exists():
            print(f"[{session_id}] Transcription already exists — skipping")
            continue

        print(f"[{session_id}] Transcribing {video_path.name} …")
        try:
            transcript = transcribe_video(video_path)
            transcription_path.write_text(transcript, encoding="utf-8")
            print(f"[{session_id}] Saved → {transcription_path.name}\n")
        except Exception as exc:
            print(f"[{session_id}] ERROR: {exc}\n")


if __name__ == "__main__":
    main()
