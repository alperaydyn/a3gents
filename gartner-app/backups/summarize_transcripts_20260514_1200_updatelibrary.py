#!/usr/bin/env python3
"""
Transcript summarizer for Gartner session transcriptions.

Usage:
  python summarize_transcripts.py                        # batch run all files (skip existing)
  python summarize_transcripts.py --all                  # batch run all files (skip existing)
  python summarize_transcripts.py --all --overwrite      # batch run, overwrite existing summaries
  python summarize_transcripts.py --file 4458194         # single session_id (skip if exists)
  python summarize_transcripts.py --file 4458194 --overwrite  # single, force overwrite
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SESSION_DIR = Path(__file__).parent / "session_details"
LIBRARY_FILE = Path(__file__).parent / "entity_library.json"
ENTITY_INDEX_FILE = Path(__file__).parent / "entity_index.json"

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
MODEL = "openai/gpt-4o-mini"   # closest valid OpenRouter model to the requested name
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# ---------------------------------------------------------------------------
# OpenRouter helper
# ---------------------------------------------------------------------------

def call_llm(system_prompt: str, user_prompt: str) -> str:
    """Call OpenRouter and return the assistant message text."""
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
    }
    resp = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=120)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


# ---------------------------------------------------------------------------
# Library / index helpers
# ---------------------------------------------------------------------------

def load_json(path: Path, default):
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return default


def save_json(path: Path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def update_library(library: dict, new_entities: list[dict]) -> dict:
    """
    Add any missing entities to the library.
    library format: { "term": "definition or empty string", ... }
    """
    for entry in new_entities:
        term = list(entry.keys())[0].lower().strip()
        if term not in library:
            library[term] = ""   # definition can be enriched later
    return library


def update_index(index: dict, session_id: str, entities: list[dict]) -> dict:
    """
    index format:
    {
      "term": { "session_id": count, ... },
      ...
    }
    """
    for entry in entities:
        term = list(entry.keys())[0].lower().strip()
        count = list(entry.values())[0]
        if term not in index:
            index[term] = {}
        index[term][session_id] = count
    return index


# ---------------------------------------------------------------------------
# Transcript parsing
# ---------------------------------------------------------------------------

def read_transcript(path: Path) -> str:
    with open(path, encoding="utf-8") as f:
        return f.read()


def get_transcription_files() -> list[Path]:
    return sorted(SESSION_DIR.glob("*_transcription.txt"))


def session_id_from_path(path: Path) -> str:
    return path.stem.replace("_transcription", "")


# ---------------------------------------------------------------------------
# LLM analysis
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are an expert Data & Analytics analyst.
Your task is to analyse conference session transcripts and extract structured information.
Always respond with valid JSON only — no prose, no markdown fences.
Be concise and precise."""


def analyse_transcript(text: str, library: dict) -> dict:
    """
    Returns a dict matching the required JSON schema.
    """
    library_terms = ", ".join(list(library.keys())[:200]) if library else "none yet"

    prompt = f"""Analyse the following conference session transcript and respond with a single JSON object
that exactly matches this schema (no extra keys):

{{
  "summary": "<max 3 sentence summary of the session>",
  "sections": [
    {{
      "order": 1,
      "topic": "<section topic>",
      "key_points": ["<point 1>", "<point 2>"],
      "start_time": "HH:MM:SS",
      "end_time": "HH:MM:SS"
    }}
  ],
  "key_takeaways": ["<sentence 1>", "<sentence 2>", "<sentence 3>"],
  "entities": [
    {{"<term>": <count>}}
  ]
}}

Rules:
- summary: maximum 3 sentences.
- sections: identify all logical sections; include key points for each; timestamps must be
  derived from the [HH:MM:SS] markers in the transcript, kept in HH:MM:SS format.
- key_takeaways: 3 to 5 items, each one sentence.
- entities: extract all terms relevant to Data & Analytics (e.g. data governance, data fabric,
  MLOps, AI strategy, data literacy, data mesh, etc.). Count how many times each appears.
  Use the known library terms for consistency where applicable: {library_terms}.
  Add any new relevant terms not yet in the library.

Transcript:
\"\"\"
{text[:12000]}
\"\"\"
"""

    raw = call_llm(SYSTEM_PROMPT, prompt)

    # Strip accidental markdown fences
    raw = re.sub(r"^```[a-z]*\n?", "", raw.strip())
    raw = re.sub(r"\n?```$", "", raw.strip())

    return json.loads(raw)


# ---------------------------------------------------------------------------
# Per-file processing
# ---------------------------------------------------------------------------

def process_file(path: Path, library: dict, index: dict, overwrite: bool) -> tuple[dict, dict]:
    """
    Process a single transcription file.
    Returns updated (library, index).
    """
    session_id = session_id_from_path(path)
    output_path = SESSION_DIR / f"{session_id}_summary.json"

    if output_path.exists() and not overwrite:
        tqdm.write(f"  [skip] {session_id} — loading entities from existing summary")
        existing = load_json(output_path, {})
        entities = existing.get("entities", [])
        library = update_library(library, entities)
        index = update_index(index, session_id, entities)
        return library, index

    text = read_transcript(path)

    if not text.strip():
        tqdm.write(f"  [warn] {session_id} — empty transcript, skipping")
        return library, index

    result = analyse_transcript(text, library)

    # Persist summary
    save_json(output_path, result)
    tqdm.write(f"  [done] {session_id}_summary.json")

    # Update shared library & index and save immediately so progress survives interruption
    entities = result.get("entities", [])
    library = update_library(library, entities)
    index = update_index(index, session_id, entities)
    save_json(LIBRARY_FILE, library)
    save_json(ENTITY_INDEX_FILE, index)

    return library, index


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Summarise Gartner session transcripts using an LLM."
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--all",
        action="store_true",
        default=True,
        help="Process all transcription files (default behaviour).",
    )
    group.add_argument(
        "--file",
        metavar="SESSION_ID",
        help="Process a single session by its ID (e.g. 4458194).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing summary files.",
    )
    args = parser.parse_args()

    if not OPENROUTER_API_KEY:
        print("ERROR: OPENROUTER_API_KEY not set in .env", file=sys.stderr)
        sys.exit(1)

    # Load shared state
    library: dict = load_json(LIBRARY_FILE, {})
    index: dict = load_json(ENTITY_INDEX_FILE, {})

    if args.file:
        # Single-file mode
        path = SESSION_DIR / f"{args.file}_transcription.txt"
        if not path.exists():
            print(f"ERROR: file not found: {path}", file=sys.stderr)
            sys.exit(1)
        files = [path]
    else:
        files = get_transcription_files()
        if not files:
            print("No transcription files found in", SESSION_DIR)
            sys.exit(0)

    print(f"Found {len(files)} transcription file(s).\n")

    # Single-file mode skips tqdm — just run directly
    if args.file:
        try:
            library, index = process_file(files[0], library, index, overwrite=args.overwrite)
        except Exception as exc:
            print(f"  [error] {files[0].name}: {exc}")
    else:
        with tqdm(files, unit="file", desc="Summarising", dynamic_ncols=True) as bar:
            for path in bar:
                session_id = session_id_from_path(path)
                bar.set_postfix(session=session_id)
                try:
                    library, index = process_file(path, library, index, overwrite=args.overwrite)
                except Exception as exc:
                    tqdm.write(f"  [error] {path.name}: {exc}")

    # Persist updated library & index after all files
    save_json(LIBRARY_FILE, library)
    save_json(ENTITY_INDEX_FILE, index)
    print(f"\nDone. Library: {len(library)} terms | Index: {len(index)} terms tracked.")
    print(f"  entity_library.json → {LIBRARY_FILE}")
    print(f"  entity_index.json   → {ENTITY_INDEX_FILE}")


if __name__ == "__main__":
    main()
