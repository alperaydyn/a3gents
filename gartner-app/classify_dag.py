#!/usr/bin/env python3
"""
Iteratively classify all Gartner sessions into DAG streams + levels using Claude.

Usage:
    python classify_dag.py            # classify & regenerate dag_data.js
    python classify_dag.py --regen    # skip classify, just regenerate from saved results
    python classify_dag.py --reset    # clear saved results and start fresh
"""

import anthropic
import json
import os
import sqlite3
import sys
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / '.env')

BASE_DIR    = Path(__file__).parent
DB_PATH     = BASE_DIR / 'gartnersessions.db'
SUMMARY_DIR = BASE_DIR / 'session_details'
OUTPUT_JS   = BASE_DIR / 'static' / 'js' / 'dag_data.js'


def _db_conn():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

# ── Domain definitions ────────────────────────────────────────────────────────

STREAMS = [
    "Context & External Forces",
    "Strategy & Investment Portfolio",
    "Value Creation & Adoption",
    "Operating Model, Talent & Culture",
    "Governance, Risk & Trust",
    "Data Architecture & Platforms",
    "Data Engineering & DataOps",
    "Analytics, ML & Decision Intelligence",
    "GenAI, Agents & AI-Native Enterprise",
]

LEVELS = {
    1: "General Context",
    2: "Landscape",
    3: "Foundations",
    4: "Core",
    5: "Advanced",
    6: "Applied",
    7: "Mastery",
}

SYSTEM_PROMPT = """You are an expert learning-path architect for Gartner's Data & Analytics Summit 2026.

Your task: classify conference sessions into a stream and a depth level so they can be arranged in a directed acyclic graph (DAG) for self-study.

## Streams (pick exactly ONE per session)

1. **Context & External Forces**
   Macro trends, geopolitics, AI predictions, keynotes that set the big-picture landscape.
   e.g. "The Future of AI", "Maverick Predictions", "Signature Series: State of D&A"

2. **Strategy & Investment Portfolio**
   CDAO/CDO role, AI strategy formulation, D&A operating model, organizational design,
   AI maturity, vendor negotiation, budget benchmarking.
   e.g. "How to Design the AI Organization", "Foundations of D&A Strategy"

3. **Value Creation & Adoption**
   Measuring and communicating business value, ROI frameworks, AI impact on headcount,
   productivity metrics, explaining AI to stakeholders, analytics culture.
   e.g. "Value Is Trapped", "Accelerating AI Value With Robust Metrics"

4. **Operating Model, Talent & Culture**
   Workforce upskilling, data literacy, multi-generational teams, change management,
   D&A talent, innovation culture, self-service analytics governance.
   e.g. "Navigating the Multi-Generational Workplace", "Elevating Digital Literacy"

5. **Governance, Risk & Trust**
   Data governance frameworks, AI governance, self-service governance, geopolitical risk,
   digital sovereignty, compliance, ethics, responsible AI, data contracts, data products governance.
   e.g. "7 Practical Actions to Improve Data Governance", "AI Governance Operating Model"

6. **Data Architecture & Platforms**
   Data lakes, lakehouses, data fabrics, converged platforms, data mesh/products,
   metadata management, master data management, data catalogs, reference architectures.
   e.g. "Data Lake vs Lakehouse vs Warehouse", "10 Steps to Build a Data Fabric"

7. **Data Engineering & DataOps**
   Data pipelines, ETL/ELT, DataOps, data integration, real-time data, data quality,
   active metadata, unstructured data, external data, data reliability.
   e.g. "AI-Ready Data", "The Evolution of Data Engineering for AI", "7 Ways to Fix RAG"

8. **Analytics, ML & Decision Intelligence**
   Business intelligence, decision intelligence, self-service analytics, data storytelling,
   prescriptive analytics, ML models, optimisation, embedded analytics.
   e.g. "Reimagined BI Retakes the Helm", "Will AI Kill BI?", "Decision Intelligence"

9. **GenAI, Agents & AI-Native Enterprise**
   Generative AI use cases, RAG, LLMs, AI agents / multi-agent systems, agentic pipelines,
   context layers, knowledge graphs for AI, AI-native architectures.
   e.g. "AI Agents: Quantifying Value and Cost", "Practical Guide to Measure GenAI Value"

## Levels (pick exactly ONE per session)

1. **General Context** — broad, non-technical big-picture; signature keynotes, outlooks
2. **Landscape** — survey of the space; hype cycles, market maps, trend reports, predictions
3. **Foundations** — conceptual grounding; what/why before the how; frameworks & definitions
4. **Core** — practical mainstream guidance; actionable how-to; widely applicable
5. **Advanced** — in-depth technical or strategic depth; requires prior domain knowledge
6. **Applied** — case studies, live demos, vendor implementations, proof-of-concept walkthroughs
7. **Mastery** — cutting-edge; synthesis; emerging patterns; challenges established thinking

## Rules

- Classify by CONTENT, not by who is presenting (Gartner analyst vs vendor matters less than the substance).
- Applied (6) is specifically for vendor case studies, live demos, and hands-on walkthroughs.
- Keynotes / Signature Series are usually Level 1 (General Context) or Level 2 (Landscape).
- CDAO Circle peer meetups / roundtables / leadership exchanges are usually Level 4-5.
- "Crossroads Debate" sessions are usually Level 4.
- Reference Architecture sessions are usually Level 5.
- Magic Quadrant sessions are Level 2 (market landscape).
- Use the summary text to judge depth — a session may be titled simply but deliver advanced content.

Respond ONLY with a valid JSON array. No markdown fences, no commentary outside JSON.

Each element: {"id": "<session_id>", "stream": "<exact stream name>", "level": <1-7>}
"""


# ── Data loading ──────────────────────────────────────────────────────────────

def load_sessions():
    """Return all substantive sessions from the DB."""
    skip_titles = [
        'Registration', 'Exclusive Member Lounge', 'Gartner Showcase',
        'Speed Networking', 'Book Signing', 'Ask the Expert',
    ]
    with _db_conn() as conn:
        rows = conn.execute('SELECT * FROM sessions WHERE non_informative=0').fetchall()
    return [
        dict(r) for r in rows
        if not any(t in (r['title'] or '') for t in skip_titles)
    ]


def load_session_context(session_id):
    """
    Return a dict with all available classification-relevant fields:
      summary, key_takeaways, entities (sorted by frequency)
    Returns {} if the summary file doesn't exist.
    """
    p = SUMMARY_DIR / f'{session_id}_summary.json'
    if not p.exists():
        return {}
    try:
        d = json.loads(p.read_text())
        # Entities are stored as list of single-key dicts [{name: freq}, ...]
        raw_entities = d.get('entities', [])
        entities = sorted(
            [(list(e.keys())[0], list(e.values())[0]) for e in raw_entities if e],
            key=lambda x: -x[1]
        )
        return {
            'summary':    d.get('summary', '').strip(),
            'takeaways':  d.get('key_takeaways', []),
            'entities':   entities[:8],   # top 8 by frequency
        }
    except Exception:
        return {}


def load_results():
    with _db_conn() as conn:
        rows = conn.execute('SELECT session_id, stream, level FROM session_classification').fetchall()
    return {r['session_id']: {'stream': r['stream'], 'level': r['level']} for r in rows}


def save_results(results):
    with _db_conn() as conn:
        conn.executemany(
            '''INSERT INTO session_classification (session_id, stream, level) VALUES (?,?,?)
               ON CONFLICT(session_id) DO UPDATE SET stream=excluded.stream, level=excluded.level''',
            [(sid, v['stream'], v['level']) for sid, v in results.items()],
        )


# ── Classification ────────────────────────────────────────────────────────────

def build_batch_prompt(batch):
    """Build the user message for a batch of sessions."""
    lines = []
    for s in batch:
        ctx = load_session_context(s['session_id'])
        parts = [
            f'ID: {s["session_id"]}',
            f'Title: {s["title"]}',
            f'Area tag: {s["subject_area_id"]}',
        ]
        if ctx.get('summary'):
            parts.append(f'Summary: {ctx["summary"]}')
        if ctx.get('takeaways'):
            parts.append('Key takeaways:\n' + '\n'.join(f'  - {t}' for t in ctx['takeaways']))
        if ctx.get('entities'):
            ent_str = ', '.join(f'{name} ({freq})' for name, freq in ctx['entities'])
            parts.append(f'Top entities: {ent_str}')
        lines.append('\n'.join(parts))
    return 'Classify these sessions:\n\n' + '\n---\n'.join(lines)


def _parse_response(raw):
    """Parse JSON array from model response. Returns dict {session_id: {stream, level}}."""
    raw = raw.strip()
    if raw.startswith('```'):
        raw = raw.split('\n', 1)[1].rsplit('```', 1)[0].strip()
    parsed = json.loads(raw)
    result = {}
    for item in parsed:
        sid    = str(item['id'])
        stream = item['stream']
        level  = int(item['level'])
        if stream not in STREAMS:
            raise ValueError(f'Unknown stream: {stream!r}')
        if level not in LEVELS:
            raise ValueError(f'Unknown level: {level}')
        result[sid] = {'stream': stream, 'level': level}
    return result


def _call_anthropic(prompt, retries=3):
    client = anthropic.Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'])
    for attempt in range(retries):
        try:
            msg = client.messages.create(
                model='claude-haiku-4-5-20251001',
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                messages=[{'role': 'user', 'content': prompt}],
            )
            return _parse_response(msg.content[0].text)
        except Exception as e:
            if attempt < retries - 1:
                wait = 2 ** attempt
                print(f'    ⚠ attempt {attempt+1} failed ({e}), retrying in {wait}s…')
                time.sleep(wait)
            else:
                raise


def _call_openrouter(prompt, retries=3):
    """Fallback: use OpenRouter with Claude Haiku via OpenAI-compatible API."""
    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError('openai package not installed — run: pip install openai')
    client = OpenAI(
        api_key=os.environ['OPENROUTER_API_KEY'],
        base_url='https://openrouter.ai/api/v1',
    )
    for attempt in range(retries):
        try:
            resp = client.chat.completions.create(
                model='anthropic/claude-haiku-4-5',
                max_tokens=2048,
                messages=[
                    {'role': 'system', 'content': SYSTEM_PROMPT},
                    {'role': 'user',   'content': prompt},
                ],
            )
            return _parse_response(resp.choices[0].message.content)
        except Exception as e:
            if attempt < retries - 1:
                wait = 2 ** attempt
                print(f'    ⚠ attempt {attempt+1} failed ({e}), retrying in {wait}s…')
                time.sleep(wait)
            else:
                raise


def classify_batch(batch):
    """Call the available LLM API to classify one batch. Returns dict {session_id: {stream, level}}."""
    prompt = build_batch_prompt(batch)
    try:
        if os.environ.get('ANTHROPIC_API_KEY'):
            return _call_anthropic(prompt)
        elif os.environ.get('OPENROUTER_API_KEY'):
            print('    (using OpenRouter fallback)')
            return _call_openrouter(prompt)
        else:
            raise RuntimeError('No API key found. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY in .env')
    except Exception as e:
        print(f'    ✗ batch failed: {e}')
        return {}


def classify_all_sessions(batch_size=10):
    """
    Iteratively classify all sessions, saving progress after each batch.
    Already-classified sessions are skipped automatically (resumable).
    """
    sessions  = load_sessions()
    results   = load_results()
    pending   = [s for s in sessions if s['session_id'] not in results]
    total_new = len(pending)

    if not pending:
        print(f'All {len(sessions)} sessions already classified. Run with --reset to redo.')
        return results

    print(f'Sessions total: {len(sessions)} | already classified: {len(results)} | pending: {total_new}')

    batches = [pending[i:i+batch_size] for i in range(0, len(pending), batch_size)]
    for idx, batch in enumerate(batches):
        ids_str = ', '.join(s['session_id'] for s in batch)
        print(f'\nBatch {idx+1}/{len(batches)} ({len(batch)} sessions): {ids_str[:80]}…')
        batch_result = classify_batch(batch)
        if batch_result:
            results.update(batch_result)
            save_results(results)
            print(f'  ✓ classified {len(batch_result)}/{len(batch)} | total saved: {len(results)}')
        else:
            print(f'  ✗ skipping batch (all retries failed)')
        # Brief pause between batches
        if idx < len(batches) - 1:
            time.sleep(0.5)

    print(f'\nClassification complete. {len(results)}/{len(sessions)} sessions classified.')
    return results


# ── DAG data generation ───────────────────────────────────────────────────────

# Layout constants
COL         = 285    # px per level
OX          = 60     # left margin
NH          = 44     # node height
NODE_GAP    = 10     # vertical gap between nodes in same cell
CELL_H      = NH + NODE_GAP
LANE_PAD_TOP = 44
LANE_PAD_BOT = 20
LEVEL_HDR   = 50     # px reserved above lanes for level column headers
NW          = 172    # node width

STREAM_ORDER = STREAMS  # preserves the defined order top→bottom

LANE_META = {
    "Context & External Forces":           {'color': '#f97316', 'bg': '#fff7f0'},
    "Strategy & Investment Portfolio":     {'color': '#0ea5e9', 'bg': '#f0f9ff'},
    "Value Creation & Adoption":           {'color': '#10b981', 'bg': '#f0fdf9'},
    "Operating Model, Talent & Culture":   {'color': '#84cc16', 'bg': '#f7fee7'},
    "Governance, Risk & Trust":            {'color': '#16a34a', 'bg': '#f0fdf4'},
    "Data Architecture & Platforms":       {'color': '#f59e0b', 'bg': '#fffbeb'},
    "Data Engineering & DataOps":          {'color': '#06b6d4', 'bg': '#ecfeff'},
    "Analytics, ML & Decision Intelligence": {'color': '#8b5cf6', 'bg': '#f5f3ff'},
    "GenAI, Agents & AI-Native Enterprise": {'color': '#ec4899', 'bg': '#fdf0f8'},
}

THEATER_STREAM = 'Applied (Theater)'
THEATER_META   = {'color': '#7c3aed', 'bg': '#faf5ff'}

AREA_DISPLAY = {
    'trends_ethics':   {'color': '#c2410c', 'bg': '#fff7ed', 'border': '#fb923c', 'label': 'Trends & Ethics'},
    'generative_ai':   {'color': '#be185d', 'bg': '#fdf2f8', 'border': '#ec4899', 'label': 'Generative AI'},
    'agentic_ai':      {'color': '#4338ca', 'bg': '#eef2ff', 'border': '#818cf8', 'label': 'Agentic AI'},
    'data_management': {'color': '#92400e', 'bg': '#fffbeb', 'border': '#fbbf24', 'label': 'Data Management'},
    'data_quality':    {'color': '#155e75', 'bg': '#ecfeff', 'border': '#22d3ee', 'label': 'Data Quality'},
    'governance':      {'color': '#14532d', 'bg': '#f0fdf4', 'border': '#4ade80', 'label': 'Governance'},
    'ai_strategy':     {'color': '#075985', 'bg': '#f0f9ff', 'border': '#38bdf8', 'label': 'AI Strategy'},
    'analytics_bi':    {'color': '#5b21b6', 'bg': '#f5f3ff', 'border': '#a78bfa', 'label': 'Analytics & BI'},
    'ai_value':        {'color': '#064e3b', 'bg': '#ecfdf5', 'border': '#34d399', 'label': 'AI Value & ROI'},
    'culture_people':  {'color': '#365314', 'bg': '#f7fee7', 'border': '#a3e635', 'label': 'Culture & People'},
    'applied':         {'color': '#5b21b6', 'bg': '#faf5ff', 'border': '#a78bfa', 'label': 'Applied (Theater)'},
}

BACKBONE_IDS = {
    '4508150','4458203','4458191','4458762','4510955','4458765','4458194','4461286',
    '4459889','4458192','4459880','4458195','4459905','4459907','4459909','4458205',
    '4458757','4458759','4460719','4458210','4458201','4459879','4458204','4526882',
    '4460711','4458770','4461278','4461266','4461253','4461271','4458772','4461284',
    '4458202','4461281','4458758','4461280','4581709','4514960','4461254','4459885',
    '4458196','4461244','4461267','4459883','4458766','4461282','4502917',
}


def shorten(title, n=38):
    if len(title) <= n:
        return title
    return title[:n].rsplit(' ', 1)[0] + '…'


def regenerate_dag_js(results):
    """
    Build dag_data.js from classification results.
    Sessions not in results fall back to a heuristic assignment.
    """
    sessions = load_sessions()
    for s in sessions:
        s['is_theater'] = 'Theater' in s.get('location', '')

    # Assign stream + level from results
    for s in sessions:
        sid = s['session_id']
        cls = results.get(sid)
        if s['is_theater']:
            # theater sessions always go to the Applied lane
            s['stream'] = THEATER_STREAM
            s['level']  = cls['level'] if cls else 5
        elif cls:
            s['stream'] = cls['stream']
            s['level']  = cls['level']
        else:
            # fallback: use subject_area heuristic
            s['stream'] = 'Data Architecture & Platforms'
            s['level']  = 4

        s['is_backbone'] = sid in BACKBONE_IDS

    # Build all streams (9 content + 1 theater)
    all_streams = STREAM_ORDER + [THEATER_STREAM]

    # Group into cells (stream, level)
    from collections import defaultdict
    cells = defaultdict(list)
    for s in sessions:
        cells[(s['stream'], s['level'])].append(s)
    for key in cells:
        cells[key].sort(key=lambda x: (not x['is_backbone'], x['title']))

    # Compute lane heights
    lane_max = {}
    for stream in all_streams:
        lane_max[stream] = max(
            (len(cells[(stream, lv)]) for lv in range(1, 8)),
            default=1
        )

    # Compute lane top positions
    lane_top = {}
    cur_y = LEVEL_HDR
    for stream in all_streams:
        lane_top[stream] = cur_y
        cur_y += lane_max[stream] * CELL_H + LANE_PAD_TOP + LANE_PAD_BOT

    canvas_h = cur_y + 30
    canvas_w = OX + 7 * COL + 220  # levels 1-7 → 6 columns, + margins

    # Compute node x/y
    # Levels 1-7 → columns 0-6, x = OX + (level-1) * COL
    for s in sessions:
        stream = s['stream']
        lv     = s['level']
        rank   = cells[(stream, lv)].index(s)
        s['x'] = OX + (lv - 1) * COL
        s['y'] = lane_top[stream] + LANE_PAD_TOP + rank * CELL_H + CELL_H // 2

    # Build lane_info JSON
    lane_info = []
    for stream in all_streams:
        meta = LANE_META.get(stream) or THEATER_META
        h    = lane_max[stream] * CELL_H + LANE_PAD_TOP + LANE_PAD_BOT
        lane_info.append({
            'id':     stream,
            'label':  stream,
            'color':  meta['color'],
            'bg':     meta['bg'],
            'top':    lane_top[stream],
            'height': h,
        })

    # Build node list
    nodes_out = []
    for s in sessions:
        area = s['subject_area_id'] if not s['is_theater'] else 'applied'
        nodes_out.append({
            'id':       s['session_id'],
            'x':        round(s['x']),
            'y':        round(s['y']),
            'area':     area,
            'sid':      s['session_id'],
            'title':    s['title'],
            'short':    shorten(s['title']),
            'stream':   s['stream'],
            'level':    s['level'],
            'backbone': s['is_backbone'],
            'theater':  s['is_theater'],
        })

    # Level labels for the JS
    level_labels = ['General Context', 'Landscape', 'Foundations', 'Core',
                    'Advanced', 'Applied', 'Mastery']

    js = (
        f'// Auto-generated by classify_dag.py — {len(nodes_out)} sessions\n'
        f'const CANVAS_H = {canvas_h};\n'
        f'const CANVAS_W = {canvas_w};\n'
        f'const NW = {NW};\n'
        f'const NH = {NH};\n'
        f'const LEVEL_LABELS = {json.dumps(level_labels)};\n\n'
        f'const LANE_INFO = {json.dumps(lane_info)};\n\n'
        f'const NODES = {json.dumps(nodes_out)};\n'
    )
    OUTPUT_JS.write_text(js)
    print(f'\n✓ dag_data.js written — {len(nodes_out)} nodes, canvas {canvas_w}×{canvas_h}px')
    print(f'  Lane heights:')
    for lane in lane_info:
        print(f'    {lane["label"][:45]:<45} {lane["height"]}px  ({lane_max[lane["id"]]} nodes max/column)')


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    args = set(sys.argv[1:])

    if '--reset' in args:
        with _db_conn() as conn:
            count = conn.execute('SELECT COUNT(*) FROM session_classification').fetchone()[0]
            conn.execute('DELETE FROM session_classification')
        if count:
            print(f'✓ Cleared {count} saved classifications.')
        else:
            print('Nothing to reset.')

    if '--regen' in args:
        results = load_results()
        print(f'Loaded {len(results)} existing classifications → regenerating JS…')
        regenerate_dag_js(results)
    else:
        results = classify_all_sessions()
        regenerate_dag_js(results)
