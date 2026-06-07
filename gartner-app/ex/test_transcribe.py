#!/usr/bin/env python3
"""
Quick test: extracts the first 45s chunk from the first video,
calls Google STT, and prints the raw API response so we can
verify the timestamp fields are present and correctly formatted.
"""

import json
import base64
import subprocess
import tempfile
import requests
from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv()

GOOGLE_STT_API_KEY = os.getenv("GOOGLE_STT_API_KEY")
SESSION_DIR = Path(__file__).parent / "session_details"
SAMPLE_RATE = 16000

video_path = sorted(SESSION_DIR.glob("*_stream.mp4"))[0]
print(f"Testing with: {video_path.name}\n")

with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    chunk_flac = tmp / "test_chunk.flac"

    print("Extracting first 45s …")
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-ss", "0",
            "-t", "45",
            "-i", str(video_path),
            "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE),
            str(chunk_flac),
        ],
        capture_output=True, check=True,
    )
    print(f"Chunk size: {chunk_flac.stat().st_size / 1024:.1f} KB\n")

    audio_b64 = base64.b64encode(chunk_flac.read_bytes()).decode("utf-8")
    payload = {
        "config": {
            "encoding": "FLAC",
            "sampleRateHertz": SAMPLE_RATE,
            "languageCode": "en-US",
            "enableAutomaticPunctuation": True,
            "enableWordTimeOffsets": True,
        },
        "audio": {"content": audio_b64},
    }

    print("Calling STT API …")
    response = requests.post(
        f"https://speech.googleapis.com/v1/speech:recognize?key={GOOGLE_STT_API_KEY}",
        json=payload, timeout=120,
    )
    print(f"Status: {response.status_code}\n")
    print("=== RAW RESPONSE ===")
    print(json.dumps(response.json(), indent=2))
