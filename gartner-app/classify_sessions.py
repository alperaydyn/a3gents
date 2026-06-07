#!/usr/bin/env python3
"""
Classify all Gartner sessions into one of 10 subject areas using LLM.
Adds/updates the subject_area_id column in the sessions table of gartnersessions.db.
Also writes the subject_area_id into each session's _summary.json if it exists.

Usage:
  python classify_sessions.py            # classify sessions missing a subject_area_id
  python classify_sessions.py --overwrite  # reclassify all sessions
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

load_dotenv()

BASE_DIR      = Path(__file__).parent
SESSION_DIR   = BASE_DIR / 'session_details'
DB_PATH       = BASE_DIR / 'gartnersessions.db'

OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY')
MODEL = 'openai/gpt-4o-mini'
OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'


def _db_conn():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _load_subject_areas():
    with _db_conn() as conn:
        rows = conn.execute('SELECT id, title, description FROM subject_areas ORDER BY sort_order').fetchall()
    return [dict(r) for r in rows]


SUBJECT_AREAS = _load_subject_areas()
VALID_IDS     = {a['id'] for a in SUBJECT_AREAS}
AREA_LIST_STR = '\n'.join(
    f"  {a['id']}: {a['title']} — {a['description'][:120]}..."
    for a in SUBJECT_AREAS
)


def call_llm(prompt: str) -> str:
    headers = {
        'Authorization': f'Bearer {OPENROUTER_API_KEY}',
        'Content-Type': 'application/json',
    }
    payload = {
        'model': MODEL,
        'messages': [{'role': 'user', 'content': prompt}],
        'temperature': 0,
        'max_tokens': 20,
    }
    resp = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()['choices'][0]['message']['content'].strip()


def classify_session(session_id: str, title: str, speakers: str) -> str:
    """Return the subject area ID that best fits this session."""
    # Try to load existing summary for richer context
    summary_text = ''
    summary_path = SESSION_DIR / f'{session_id}_summary.json'
    if summary_path.exists():
        try:
            data = json.loads(summary_path.read_text())
            parts = []
            if data.get('summary'):
                parts.append(data['summary'])
            for t in data.get('key_takeaways', [])[:3]:
                parts.append(t)
            summary_text = ' '.join(parts)[:400]
        except Exception:
            pass

    prompt = f"""You are classifying a Gartner Data & Analytics Summit session into exactly ONE subject area.
Respond with ONLY the subject area ID — no explanation, no punctuation, just the ID.

Subject Areas:
{AREA_LIST_STR}

Session Title: {title}
Speakers: {speakers}
Summary: {summary_text or '(no summary available)'}

Subject Area ID:"""

    raw = call_llm(prompt).strip().lower()
    # Extract the first token that matches a valid ID
    for token in re.split(r'[\s,.:]+', raw):
        if token in VALID_IDS:
            return token
    # Fallback: try substring match
    for area_id in VALID_IDS:
        if area_id in raw:
            return area_id
    return 'trends_ethics'   # safe default


def load_rows() -> list[dict]:
    with _db_conn() as conn:
        rows = conn.execute('SELECT * FROM sessions').fetchall()
    return [dict(r) for r in rows]


def save_subject_area(session_id: str, area_id: str):
    with _db_conn() as conn:
        conn.execute(
            'UPDATE sessions SET subject_area_id=? WHERE session_id=?',
            (area_id, session_id),
        )


def update_summary_json(session_id: str, area_id: str):
    path = SESSION_DIR / f'{session_id}_summary.json'
    if path.exists():
        try:
            data = json.loads(path.read_text())
            data['subject_area_id'] = area_id
            path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--overwrite', action='store_true',
                        help='Reclassify all sessions, even those already classified')
    args = parser.parse_args()

    if not OPENROUTER_API_KEY:
        print('ERROR: OPENROUTER_API_KEY not set in .env', file=sys.stderr)
        sys.exit(1)

    rows = load_rows()

    # Skip non-session rows (registration, meals, etc.) — no session_id digit match
    sessions_to_classify = [
        r for r in rows
        if re.match(r'^\d{7}$', str(r.get('session_id', '')).strip())
        and (args.overwrite or not str(r.get('subject_area_id', '')).strip())
    ]

    total = len(sessions_to_classify)
    print(f'Sessions to classify: {total}')

    for i, row in enumerate(sessions_to_classify, 1):
        sid    = str(row['session_id']).strip()
        title  = str(row.get('title', '')).strip()
        speakers = str(row.get('speakers', '')).strip()
        print(f'  [{i:3}/{total}] {sid}  {title[:60]}', end=' ... ', flush=True)
        try:
            area_id = classify_session(sid, title, speakers)
            save_subject_area(sid, area_id)
            update_summary_json(sid, area_id)
            print(area_id)
        except Exception as exc:
            print(f'ERROR: {exc}')

    print(f'\nDone. DB updated: {DB_PATH}')


if __name__ == '__main__':
    main()
