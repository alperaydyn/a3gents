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
import sqlite3
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
DB_PATH     = Path(__file__).parent / "gartnersessions.db"


def _db_conn():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

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


def load_entity_library() -> dict:
    """Load entity_library from DB as {term: definition}."""
    with _db_conn() as conn:
        rows = conn.execute('SELECT term, definition FROM entity_library').fetchall()
    return {r['term']: r['definition'] for r in rows}


def save_entity_library(library: dict):
    """Upsert all terms from the in-memory library dict into the DB."""
    with _db_conn() as conn:
        conn.executemany(
            '''INSERT INTO entity_library (term, definition) VALUES (?,?)
               ON CONFLICT(term) DO UPDATE SET definition=excluded.definition''',
            [(term, defn) for term, defn in library.items()],
        )


def load_entity_index() -> dict:
    """Load entity_index from DB as {entity: {session_id: freq}}."""
    with _db_conn() as conn:
        rows = conn.execute('SELECT entity, session_id, frequency FROM entity_index').fetchall()
    result: dict[str, dict] = {}
    for r in rows:
        result.setdefault(r['entity'], {})[r['session_id']] = r['frequency']
    return result


def save_entity_index(index: dict):
    """Upsert all entries from the in-memory index dict into the DB."""
    rows = [
        (entity, session_id, freq)
        for entity, smap in index.items()
        for session_id, freq in smap.items()
    ]
    with _db_conn() as conn:
        conn.executemany(
            '''INSERT INTO entity_index (entity, session_id, frequency) VALUES (?,?,?)
               ON CONFLICT(entity, session_id) DO UPDATE SET frequency=excluded.frequency''',
            rows,
        )


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


# Terms too generic for a D&A summit — present in virtually every session,
# so they add no discriminating signal to the entity index.
ENTITY_BLOCKLIST = {
    "data", "analytics", "ai", "artificial intelligence", "data analytics",
    "technology", "business", "organization", "companies", "company",
    "information", "insights", "solutions", "strategy", "management",
    "intelligence", "tools", "platform", "systems", "process",
}

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


def extract_timestamps(text: str) -> list[str]:
    """Return all [HH:MM:SS] timestamps found in the transcript, in order."""
    return re.findall(r"\[(\d{2}:\d{2}:\d{2})\]", text)


def build_timeline_skeleton(text: str, chars_per_entry: int = 180) -> str:
    """
    Compact timeline: one entry per timestamp line keeping only the first
    `chars_per_entry` characters of speech. Used to give the LLM the full
    duration view without hitting token limits.
    """
    lines = []
    for line in text.splitlines():
        m = re.match(r"(\[\d{2}:\d{2}:\d{2}\])\s*(.*)", line)
        if m:
            ts, speech = m.group(1), m.group(2).strip()
            lines.append(f"{ts} {speech[:chars_per_entry]}")
    return "\n".join(lines)


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

    Strategy:
    - Sections use the full timeline skeleton so no section is cut off.
    - Summary + entities use the full transcript text (model supports 128k tokens).
    - Library terms are passed sorted by length (longer = more specific first)
      so the model prefers precise existing terms over inventing broad ones.
    """
    timestamps = extract_timestamps(text)
    first_ts = timestamps[0] if timestamps else "00:00:00"
    last_ts = timestamps[-1] if timestamps else "00:00:00"
    timeline = build_timeline_skeleton(text)

    # Sort library: longer (more specific) terms first so LLM matches those first
    sorted_terms = sorted(library.keys(), key=len, reverse=True)
    library_terms = "\n".join(f"- {t}" for t in sorted_terms) if sorted_terms else "none yet"

    blocklist_str = ", ".join(sorted(ENTITY_BLOCKLIST))

    subject_area_options = (
        "agentic_ai, governance, ai_strategy, data_management, generative_ai, "
        "analytics_bi, data_quality, ai_value, trends_ethics, culture_people"
    )

    prompt = f"""Analyse the following Gartner Data & Analytics Summit session transcript.
Respond with a single JSON object that exactly matches this schema (no extra keys):

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
  ],
  "subject_area_id": "<one of the IDs listed below>"
}}

SUBJECT AREA RULES:
- Choose exactly ONE subject_area_id that best represents the session's primary focus.
- Valid IDs: {subject_area_options}
  agentic_ai     → AI agents, multi-agent systems, context layers, agentic workflows
  governance     → Data governance, AI governance, compliance, trust frameworks
  ai_strategy    → CDAO role, AI org design, operating models, D&A strategy, AI leadership
  data_management → Data platforms, lakehouse, data fabric, DataOps, data engineering, integration
  generative_ai  → GenAI use cases, RAG, LLMs, GenAI ROI, unstructured data for GenAI
  analytics_bi   → BI, decision intelligence, self-service analytics, agentic analytics, data storytelling
  data_quality   → Data quality, MDM, master data, metadata management, data catalogs
  ai_value       → AI ROI, value measurement, KPIs, metrics frameworks, budget benchmarking
  trends_ethics  → Predictions, future trends, AI sustainability, digital sovereignty, responsible AI
  culture_people → Workforce, generational dynamics, organizational culture, upskilling

SECTION RULES (critical):
- The session starts at {first_ts} and ends at {last_ts}. Every section must fall within
  this range. The last section MUST end at {last_ts}.
- Identify all logical topic shifts across the FULL timeline skeleton below.
  Do NOT stop partway through — cover the entire session.
- Each section's start_time must equal the previous section's end_time (no gaps, no overlaps).
- Use exact [HH:MM:SS] values from the timeline markers.

ENTITY RULES:
- Extract specific Data & Analytics concepts: methodologies, frameworks, tools, roles,
  practices (e.g. data fabric, MLOps, FinOps, data mesh, data literacy, CDAO, data product).
- DO NOT extract these overly generic terms: {blocklist_str}.
- Prefer existing library terms (listed below) over inventing new ones. Match library terms
  exactly (same casing/phrasing) when the concept is the same.
- Only add a new term if it is genuinely not covered by any library term.
- Count occurrences across the FULL transcript, not just what appears in the skeleton.

KNOWN LIBRARY TERMS (prefer these):
{library_terms}

SUMMARY & TAKEAWAYS:
- summary: max 3 sentences covering the whole session.
- key_takeaways: 3 to 5 items, each one sentence, concrete and actionable.

--- FULL TIMELINE SKELETON (for sections) ---
{timeline}

--- FULL TRANSCRIPT (for summary, takeaways, entities) ---
{text}
"""

    raw = call_llm(SYSTEM_PROMPT, prompt)

    # Strip accidental markdown fences
    raw = re.sub(r"^```[a-z]*\n?", "", raw.strip())
    raw = re.sub(r"\n?```$", "", raw.strip())

    result = json.loads(raw)

    # Post-process: enforce blocklist and normalise entity keys to lowercase
    filtered_entities = []
    for entry in result.get("entities", []):
        term = list(entry.keys())[0]
        count = list(entry.values())[0]
        normalised = term.lower().strip()
        if normalised not in ENTITY_BLOCKLIST:
            filtered_entities.append({normalised: count})
    result["entities"] = filtered_entities

    # Ensure last section ends at actual transcript end
    if result.get("sections"):
        result["sections"][-1]["end_time"] = last_ts

    # Validate subject_area_id
    valid_ids = {
        "agentic_ai", "governance", "ai_strategy", "data_management",
        "generative_ai", "analytics_bi", "data_quality", "ai_value",
        "trends_ethics", "culture_people",
    }
    if result.get("subject_area_id") not in valid_ids:
        result["subject_area_id"] = ""   # will fall back to CSV value

    return result


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
    save_entity_library(library)
    save_entity_index(index)

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
    library: dict = load_entity_library()
    index: dict = load_entity_index()

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
    save_entity_library(library)
    save_entity_index(index)
    print(f"\nDone. Library: {len(library)} terms | Index: {len(index)} terms tracked.")
    print(f"  entity_library → gartnersessions.db (entity_library table)")
    print(f"  entity_index   → gartnersessions.db (entity_index table)")


if __name__ == "__main__":
    main()
