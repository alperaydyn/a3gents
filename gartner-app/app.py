from flask import Flask, render_template, jsonify, request, send_file, abort, redirect, url_for, session, Response, stream_with_context
import concurrent.futures
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv
import csv
import json
import math
import os
import re
import sqlite3
import subprocess
import sys
import threading
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import datetime
from itertools import groupby
from werkzeug.utils import secure_filename
from werkzeug.middleware.proxy_fix import ProxyFix


load_dotenv()

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)
app.config['MAX_CONTENT_LENGTH'] = 4 * 1024 * 1024 * 1024  # 4 GB – for large video uploads
app.secret_key = os.getenv('SECRET_KEY', 'dev-secret-change-me')

# ── Auth setup ────────────────────────────────────────────────────────────────

login_manager = LoginManager(app)
login_manager.login_view = 'login'
login_manager.login_message = ''

ALLOWED_EMAILS = {e.strip() for e in os.getenv('ALLOWED_EMAILS', '').split(',') if e.strip()}
ADMIN_EMAILS   = {'alperaydyn@gmail.com'}

_users: dict = {}


class User(UserMixin):
    def __init__(self, sub, email, name, picture):
        self.id = sub
        self.email = email
        self.name = name
        self.picture = picture


@login_manager.user_loader
def load_user(user_id):
    return _users.get(user_id)


oauth = OAuth(app)
google = oauth.register(
    name='google',
    client_id=os.getenv('GOOGLE_CLIENT_ID'),
    client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'},
)


@app.route('/login')
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    return render_template('login.html')


@app.route('/auth/google')
def auth_google():
    redirect_uri = url_for('auth_google_callback', _external=True)
    return google.authorize_redirect(redirect_uri)


@app.route('/auth/google/callback')
def auth_google_callback():
    token = google.authorize_access_token()
    userinfo = token.get('userinfo') or google.userinfo()
    email = userinfo.get('email', '')
    if ALLOWED_EMAILS and email not in ALLOWED_EMAILS:
        return render_template('login.html', error='Your Google account is not authorized to access this app.')
    sub = userinfo['sub']
    user = User(sub, email, userinfo.get('name', email), userinfo.get('picture', ''))
    _users[sub] = user
    login_user(user, remember=True)
    next_page = request.args.get('next') or url_for('index')
    return redirect(next_page)


@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.context_processor
def inject_user_id():
    uid = current_user.id if current_user.is_authenticated else ''
    return {'user_id': uid}


BASE_DIR = Path(__file__).parent

# Mirror the blocklist from summarize_transcripts.py — entities too generic
# to carry discriminating signal between sessions.
ENTITY_BLOCKLIST = {
    "data", "analytics", "ai", "artificial intelligence", "data analytics",
    "technology", "business", "organization", "companies", "company",
    "information", "insights", "solutions", "strategy", "management",
    "intelligence", "tools", "platform", "systems", "process",
}
SESSION_DIR  = BASE_DIR / 'session_details'


def load_subject_areas() -> list[dict]:
    with _sp_conn() as conn:
        rows = conn.execute(
            'SELECT id, title, short, color, bg, description FROM subject_areas ORDER BY sort_order'
        ).fetchall()
    return [dict(r) for r in rows]


def subject_area_map() -> dict:
    """Return {id: area_dict} for quick lookup."""
    return {a['id']: a for a in load_subject_areas()}

# ── Google Drive config ───────────────────────────────────────────────────────
DRIVE_FOLDER_ID  = '1LvO6z_oiXTr7oxrg8VQrtzxbpqBue13A'
DRIVE_API_KEY    = os.getenv('GOOGLE_STT_API_KEY', '')   # reuses existing key
_drive_index: dict | None = None   # {filename: file_id}


def load_drive_index(force: bool = False) -> dict:
    """
    List files in the public Drive folder and return {name: file_id}.
    Result is cached in-process; pass force=True to refresh.
    """
    global _drive_index
    if _drive_index is not None and not force:
        return _drive_index
    if not DRIVE_API_KEY:
        _drive_index = {}
        return _drive_index
    q = urllib.parse.quote(f"'{DRIVE_FOLDER_ID}' in parents and trashed=false")
    url = (
        f'https://www.googleapis.com/drive/v3/files'
        f'?q={q}&fields=files(id,name)&pageSize=1000&key={DRIVE_API_KEY}'
    )
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read())
        _drive_index = {f['name']: f['id'] for f in data.get('files', [])}
    except Exception as exc:
        print(f'[drive] index fetch failed: {exc}', file=sys.stderr)
        _drive_index = {}
    return _drive_index


# ── Data helpers ──────────────────────────────────────────────────────────────

def load_sessions():
    bool_fields = {'attended', 'recommended', 'exclusive', 'has_files',
                   'has_replay', 'has_speaker', 'on_agenda', 'non_informative'}
    with _sp_conn() as conn:
        rows = conn.execute('SELECT * FROM sessions').fetchall()
    result = []
    for row in rows:
        d = dict(row)
        for field in bool_fields:
            d[field] = bool(d[field])
        result.append(d)
    return result


def load_notes():
    """Return {session_id: [note_dict, ...]} for all sessions."""
    with _sp_conn() as conn:
        rows = conn.execute(
            'SELECT session_id, text, timestamp, user_email, user_name FROM notes ORDER BY timestamp'
        ).fetchall()
    result: dict[str, list] = {}
    for r in rows:
        result.setdefault(r['session_id'], []).append({
            'text':       r['text'],
            'timestamp':  r['timestamp'],
            'user_email': r['user_email'],
            'user_name':  r['user_name'],
        })
    return result


def notes_for_session(notes_data, session_id):
    """Return notes as a list, migrating legacy plain-string format."""
    raw = notes_data.get(session_id)
    if raw is None:
        return []
    if isinstance(raw, str):
        if raw.strip():
            return [{'text': raw.strip(), 'timestamp': None,
                     'user_email': None, 'user_name': 'Legacy note'}]
        return []
    return raw


def load_visits():
    """Return {session_id: [visit_dict, ...]} for all sessions."""
    with _sp_conn() as conn:
        rows = conn.execute(
            'SELECT id, session_id, user_email, user_name, timestamp, time_spent_seconds FROM visits ORDER BY timestamp'
        ).fetchall()
    result: dict[str, list] = {}
    for r in rows:
        result.setdefault(r['session_id'], []).append({
            'id':                 r['id'],
            'user_email':         r['user_email'],
            'user_name':          r['user_name'],
            'timestamp':          r['timestamp'],
            'time_spent_seconds': r['time_spent_seconds'] or 0,
        })
    return result


def log_visit(session_id, user) -> int:
    """Insert a visit row and return its id."""
    with _sp_conn() as conn:
        cur = conn.execute(
            'INSERT INTO visits (session_id, user_email, user_name, timestamp, time_spent_seconds) VALUES (?,?,?,?,0)',
            (session_id, user.email, user.name, datetime.utcnow().isoformat()),
        )
        return cur.lastrowid


_entity_index_cache: dict | None = None


def load_entity_index():
    global _entity_index_cache
    if _entity_index_cache is None:
        with _sp_conn() as conn:
            rows = conn.execute('SELECT entity, session_id, frequency FROM entity_index').fetchall()
        result: dict[str, dict] = {}
        for r in rows:
            result.setdefault(r['entity'], {})[r['session_id']] = r['frequency']
        _entity_index_cache = result
    return _entity_index_cache


def load_summary(session_id):
    path = SESSION_DIR / f'{session_id}_summary.json'
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return None


def load_transcription(session_id):
    path = SESSION_DIR / f'{session_id}_transcription.txt'
    if not path.exists():
        return None
    lines = []
    with open(path, encoding='utf-8') as f:
        raw = f.read()

    for line in raw.splitlines():
        m = re.match(r'\[(\d{2}:\d{2}:\d{2})\]\s*(.*)', line)
        if m:
            ts, text = m.groups()
            h, mn, s = map(int, ts.split(':'))
            lines.append({'timestamp': ts, 'seconds': h * 3600 + mn * 60 + s,
                          'text': text.strip(), 'has_timestamp': True})

    # Plain-text transcription — no timestamps found; return lines as-is
    if not lines:
        for line in raw.splitlines():
            if line.strip():
                lines.append({'timestamp': '', 'seconds': 0,
                              'text': line.strip(), 'has_timestamp': False})
    return lines or None


def time_to_seconds(t):
    parts = t.split(':')
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    if len(parts) == 2:
        return int(parts[0]) * 60 + int(parts[1])
    return 0


# ── FTS search index ──────────────────────────────────────────────────────────

_fts_conn: sqlite3.Connection | None = None


def _load_transcript_text(session_id: str) -> str:
    """Return stripped transcription text (timestamps removed)."""
    path = SESSION_DIR / f'{session_id}_transcription.txt'
    if not path.exists():
        return ''
    with open(path, encoding='utf-8') as f:
        raw = f.read()
    return re.sub(r'\[\d{2}:\d{2}:\d{2}\]\s*', ' ', raw)


def build_fts_index() -> sqlite3.Connection:
    """
    Build an in-memory SQLite FTS5 index over every piece of session content.
    Columns (indexed with BM25 weights):
      title ×5 | speakers ×4 | summary_content ×3 | transcript ×1
    """
    sessions = load_sessions()
    summary_idx = load_summary_search_index()

    conn = sqlite3.connect(':memory:', check_same_thread=False)
    conn.execute('''
        CREATE VIRTUAL TABLE sessions_fts USING fts5(
            session_id UNINDEXED,
            title,
            speakers,
            summary_content,
            transcript,
            tokenize = "unicode61 remove_diacritics 1"
        )
    ''')

    rows = []
    for s in sessions:
        sid = s['session_id']
        rows.append((
            sid,
            s['title'],
            s['speakers'],
            summary_idx.get(sid, ''),
            _load_transcript_text(sid),
        ))

    conn.executemany('INSERT INTO sessions_fts VALUES (?,?,?,?,?)', rows)
    conn.commit()
    return conn


def get_fts_conn() -> sqlite3.Connection:
    global _fts_conn
    if _fts_conn is None:
        _fts_conn = build_fts_index()
    return _fts_conn


def rebuild_fts_index():
    global _fts_conn
    _fts_conn = build_fts_index()


def _make_fts_query(raw: str) -> str | None:
    """
    Convert a user search string to an FTS5 MATCH expression.
    Each token becomes a prefix query (token*).
    Falls back to OR if fewer than all terms are needed.
    """
    terms = re.sub(r'[^\w\s]', ' ', raw).split()
    terms = [t for t in terms if len(t) >= 2]
    if not terms:
        return None
    return ' '.join(f'{t}*' for t in terms)  # implicit AND, each as prefix


_AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.aiff']


def enrich_sessions(sessions, notes):
    """Add derived fields (has_notes, has_summary, has_video, has_audio, subject_area) in-place."""
    sa_map = subject_area_map()
    for s in sessions:
        sid = s['session_id']
        raw_notes = notes.get(sid)
        if isinstance(raw_notes, list):
            s['has_notes'] = bool(raw_notes)
        elif isinstance(raw_notes, str):
            s['has_notes'] = bool(raw_notes.strip())
        else:
            s['has_notes'] = False
        s['has_summary'] = (SESSION_DIR / f"{sid}_summary.json").exists()
        s['has_video']   = (SESSION_DIR / f"{sid}_stream.mp4").exists()
        s['has_audio']   = any((SESSION_DIR / f"{sid}_audio{ext}").exists() for ext in _AUDIO_EXTS)
        area = sa_map.get(s.get('subject_area_id', ''))
        s['subject_area'] = area  # full dict or None
    return sessions


def _time_sort_key(time_str):
    """Convert time string like '11:00 - 11:30 AM' to minutes for sorting."""
    if not time_str:
        return 9999 * 60
    m = re.match(r'(\d{1,2}):(\d{2})', time_str)
    if not m:
        return 9999 * 60
    h, mn = int(m.group(1)), int(m.group(2))
    upper = time_str.upper()
    # Explicit AM at start
    if re.match(r'\d+:\d+\s*AM', upper):
        if h == 12:
            h = 0
    # Explicit PM at start
    elif re.match(r'\d+:\d+\s*PM', upper):
        if h < 12:
            h += 12
    # PM only at end (e.g. "5:00 - 7:30 PM") with low start hour
    elif 'PM' in upper and 'AM' not in upper and h < 8:
        if h < 12:
            h += 12
    return h * 60 + mn


def _date_sort_key(day_date_str):
    try:
        return datetime.strptime(day_date_str, '%m/%d/%Y')
    except Exception:
        return datetime.max


def load_summary_search_index():
    """Return {session_id: lowercase_searchable_text} for all summaries."""
    index = {}
    for path in SESSION_DIR.glob('*_summary.json'):
        session_id = path.stem.replace('_summary', '')
        try:
            with open(path) as f:
                s = json.load(f)
            parts = []
            if s.get('summary'):
                parts.append(s['summary'])
            for sec in s.get('sections', []):
                if sec.get('topic'):
                    parts.append(sec['topic'])
                for pt in sec.get('key_points', []):
                    parts.append(pt)
            for t in s.get('key_takeaways', []):
                parts.append(t)
            index[session_id] = ' '.join(parts).lower()
        except Exception:
            pass
    return index


def group_sessions_by_date(sessions):
    """Sort sessions by date+time, then group into date buckets."""
    sorted_sessions = sorted(
        sessions,
        key=lambda s: (_date_sort_key(s['day_date']), _time_sort_key(s['time']))
    )
    groups = []
    for day_date, group_iter in groupby(sorted_sessions, key=lambda s: s['day_date']):
        group_list = list(group_iter)
        groups.append({
            'day_date': day_date,
            'date_label': group_list[0]['date'] if group_list else day_date,
            'sessions': group_list,
        })
    return groups


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route('/')
@login_required
def index():
    sessions = enrich_sessions(load_sessions(), load_notes())
    grouped = group_sessions_by_date(sessions)
    subject_areas = load_subject_areas()
    get_fts_conn()  # warm up index on first page load
    return render_template('index.html', grouped=grouped, subject_areas=subject_areas)


@app.route('/graph')
@login_required
def graph():
    return render_template('graph.html')


@app.route('/dag')
@login_required
def dag():
    return render_template('dag.html')


@app.route('/api/graph-data')
@login_required
def api_graph_data():
    sessions = enrich_sessions(load_sessions(), load_notes())
    entity_index = load_entity_index()
    subject_areas = load_subject_areas()

    # Only real 7-digit session IDs
    real_sessions = [s for s in sessions if re.match(r'^\d{7}$', s.get('session_id', ''))]
    session_map = {s['session_id']: s for s in real_sessions}
    N = len(real_sessions)

    # Build edges: IDF-weighted co-occurrence across shared entities
    # Skip entities that are too rare (df<2), too common (df > 35% of sessions),
    # or on the generic-term blocklist.
    edge_acc = {}  # (sid_a, sid_b) -> {weight, entities}
    for entity, smap in entity_index.items():
        if entity.lower() in ENTITY_BLOCKLIST:
            continue
        df = len(smap)
        if df < 2 or df > N * 0.35:
            continue
        idf = math.log(N / df)
        sids = [sid for sid in smap if sid in session_map]
        for i in range(len(sids)):
            for j in range(i + 1, len(sids)):
                a, b = min(sids[i], sids[j]), max(sids[i], sids[j])
                key = (a, b)
                if key not in edge_acc:
                    edge_acc[key] = {'weight': 0.0, 'entities': []}
                edge_acc[key]['weight'] += idf
                edge_acc[key]['entities'].append(entity)

    # Prune: keep edges with IDF-weight >= 1.5 (at least one moderately-specific shared topic)
    MIN_WEIGHT = 1.5
    edges = []
    for (src, tgt), data in edge_acc.items():
        if data['weight'] < MIN_WEIGHT:
            continue
        # Sort shared entities by specificity (highest IDF first) and keep top 8
        top_entities = sorted(
            data['entities'],
            key=lambda e: -math.log(N / len(entity_index.get(e, {1: 1})))
        )[:8]
        edges.append({
            'source': src,
            'target': tgt,
            'weight': round(data['weight'], 2),
            'shared_count': len(data['entities']),
            'shared_entities': top_entities,
        })

    # Sort edges by weight descending for frontend rendering order
    edges.sort(key=lambda e: e['weight'], reverse=True)

    # Compute node degrees for sizing
    degree = {}
    for e in edges:
        degree[e['source']] = degree.get(e['source'], 0) + 1
        degree[e['target']] = degree.get(e['target'], 0) + 1

    # Build node list
    nodes = []
    for s in real_sessions:
        area = s.get('subject_area')
        nodes.append({
            'id': s['session_id'],
            'title': s['title'],
            'speakers': s.get('speakers', ''),
            'date': s.get('date', ''),
            'time': s.get('time', ''),
            'subject_area_id': s.get('subject_area_id', ''),
            'color': area['color'] if area else '#9ca3af',
            'bg': area['bg'] if area else '#f3f4f6',
            'subject_area_title': area['short'] if area else 'Unknown',
            'has_summary': s.get('has_summary', False),
            'has_video': s.get('has_video', False),
            'attended': s.get('attended', False),
            'degree': degree.get(s['session_id'], 0),
        })

    return jsonify({
        'nodes': nodes,
        'edges': edges,
        'subject_areas': subject_areas,
        'stats': {
            'total_sessions': len(nodes),
            'total_edges': len(edges),
            'total_entities': len(entity_index),
        },
    })


@app.route('/subjects')
@login_required
def subjects():
    sessions  = load_sessions()
    sa_map    = subject_area_map()
    areas     = load_subject_areas()
    # Count sessions per area (only real session IDs — 7-digit numbers)
    counts: dict[str, int] = {a['id']: 0 for a in areas}
    sessions_by_area: dict[str, list[str]] = {a['id']: [] for a in areas}
    for s in sessions:
        sid = s.get('session_id', '')
        if re.match(r'^\d{7}$', sid):
            aid = s.get('subject_area_id', '')
            if aid in counts:
                counts[aid] += 1
                sessions_by_area[aid].append(sid)
    for area in areas:
        area['session_count'] = counts.get(area['id'], 0)
    total = sum(counts.values())
    return render_template('subjects.html', areas=areas, total_sessions=total,
                           sessions_by_area=sessions_by_area)


@app.route('/session/<session_id>')
@login_required
def session_detail(session_id):
    if not re.match(r'^\d+$', session_id):
        abort(400)
    sessions = load_sessions()
    session = next((s for s in sessions if s['session_id'] == session_id), None)
    if not session:
        abort(404)

    is_admin = current_user.email in ADMIN_EMAILS

    # Prev / next navigation in chronological order
    all_sessions_sorted = sorted(
        load_sessions(),
        key=lambda s: (_date_sort_key(s['day_date']), _time_sort_key(s['time']))
    )
    all_ids = [s['session_id'] for s in all_sessions_sorted]
    cur_idx  = next((i for i, s in enumerate(all_sessions_sorted) if s['session_id'] == session_id), None)
    prev_session = all_sessions_sorted[cur_idx - 1] if cur_idx and cur_idx > 0 else None
    next_session = all_sessions_sorted[cur_idx + 1] if cur_idx is not None and cur_idx < len(all_sessions_sorted) - 1 else None

    # Record this visit before loading visit stats
    visit_id = log_visit(session_id, current_user)
    all_visits = load_visits().get(session_id, [])
    visit_count  = len(all_visits)
    last_visit   = all_visits[-2] if len(all_visits) >= 2 else None  # previous visit
    # Only show visits where the user spent ≥ 60 seconds (exclude quick accidental opens)
    visits_desc  = [v for v in reversed(all_visits) if v['time_spent_seconds'] >= 60]

    notes = load_notes()
    session_notes = notes_for_session(notes, session_id)
    summary = load_summary(session_id)
    summary_mtime = None
    if summary:
        p = SESSION_DIR / f'{session_id}_summary.json'
        if p.exists():
            summary_mtime = datetime.fromtimestamp(p.stat().st_mtime).strftime('%-d %b %Y, %H:%M')
    transcription = load_transcription(session_id)
    has_video = (SESSION_DIR / f'{session_id}_stream.mp4').exists()
    # Google Drive video — only used when no local video file is present
    drive_video_url = None
    if not has_video:
        drive_idx = load_drive_index()
        file_id = drive_idx.get(f'{session_id}_stream.mp4')
        if file_id:
            drive_video_url = f'https://drive.google.com/file/d/{file_id}/preview'
    has_transcription = (SESSION_DIR / f'{session_id}_transcription.txt').exists()
    # Raw transcript text for pre-populating the upload textarea
    transcript_raw = ''
    if has_transcription:
        try:
            transcript_raw = (SESSION_DIR / f'{session_id}_transcription.txt').read_text(encoding='utf-8')
        except Exception:
            pass
    # Existing documents (pdf / ppt / pptx) uploaded for this session
    raw_docs = (sorted(SESSION_DIR.glob(f'{session_id}_*.pdf')) +
                sorted(SESSION_DIR.glob(f'{session_id}_*.ppt')) +
                sorted(SESSION_DIR.glob(f'{session_id}_*.pptx')))
    documents = [
        {
            'name': d.name,
            'display': d.name[len(session_id) + 1:],   # strip "{id}_" prefix
            'ext': d.suffix.lower().lstrip('.'),
        }
        for d in raw_docs
    ]

    # Detect audio recording — saved as {session_id}_audio.{ext}
    AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.aiff']
    has_audio = False
    audio_ext = ''
    for ext in AUDIO_EXTS:
        if (SESSION_DIR / f'{session_id}_audio{ext}').exists():
            has_audio = True
            audio_ext = ext
            break

    # Build sections with percentage positions for the time bar
    sections_data = []
    if summary and summary.get('sections'):
        total_end = max(
            time_to_seconds(sec['end_time']) for sec in summary['sections']
        ) or 1
        for sec in summary['sections']:
            start_s = time_to_seconds(sec['start_time'])
            end_s = time_to_seconds(sec['end_time'])
            duration = end_s - start_s
            sections_data.append({
                **sec,
                'start_seconds': start_s,
                'end_seconds': end_s,
                'width_pct': round(duration / total_end * 100, 2),
                'left_pct': round(start_s / total_end * 100, 2),
            })

    # Flatten entities [{term: count}] → [{term, count, sessions_count}]
    entity_index = load_entity_index()
    session_map = {s['session_id']: s for s in sessions}
    session_entities = []
    if summary and summary.get('entities'):
        for obj in summary['entities']:
            for term, count in obj.items():
                session_entities.append({
                    'term': term,
                    'count': count,
                    'sessions_count': len(entity_index.get(term, {})),
                })
        session_entities.sort(key=lambda x: x['count'], reverse=True)

    # Read state for this session
    with _sp_conn() as conn:
        read_row = conn.execute(
            'SELECT time_spent_seconds, manually_flagged FROM session_reads WHERE user_id=? AND session_id=?',
            (current_user.id, session_id),
        ).fetchone()
    is_read = bool(
        read_row and (read_row['time_spent_seconds'] >= 300 or read_row['manually_flagged'])
    )
    is_flagged = bool(read_row and read_row['manually_flagged'])

    return render_template(
        'session_detail.html',
        session=session,
        summary=summary,
        summary_mtime=summary_mtime,
        transcription=transcription,
        sections=sections_data,
        entities=session_entities,
        session_notes=session_notes,
        visit_count=visit_count,
        last_visit=last_visit,
        visits_desc=visits_desc,
        visit_id=visit_id,
        is_admin=is_admin,
        prev_session=prev_session,
        next_session=next_session,
        has_video=has_video,
        drive_video_url=drive_video_url,
        has_transcription=has_transcription,
        transcript_raw=transcript_raw,
        documents=documents,
        has_audio=has_audio,
        is_read=is_read,
        is_flagged=is_flagged,
        user_id=current_user.id,
    )


# ── API ───────────────────────────────────────────────────────────────────────

@app.route('/api/search')
@login_required
def api_search():
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({'results': [], 'total': 0})

    fts_query = _make_fts_query(q)
    if not fts_query:
        return jsonify({'results': [], 'total': 0})

    conn = get_fts_conn()

    def run_query(match_expr):
        # bm25 weights: title×5, speakers×4, summary_content×3, transcript×1
        return conn.execute(
            '''SELECT session_id, bm25(sessions_fts, 0, 5.0, 4.0, 3.0, 1.0) AS rank
               FROM sessions_fts WHERE sessions_fts MATCH ?
               ORDER BY rank LIMIT 235''',
            (match_expr,)
        ).fetchall()

    try:
        rows = run_query(fts_query)
        # If AND gave zero hits, retry with OR so partial matches still surface
        if not rows and len(fts_query.split()) > 1:
            or_query = ' OR '.join(fts_query.split())
            rows = run_query(or_query)
    except sqlite3.OperationalError:
        # Malformed query — fall back to a simple prefix on the whole string
        try:
            rows = run_query(re.sub(r'\s+', '* ', q.strip()) + '*')
        except Exception:
            rows = []

    results = [row[0] for row in rows]
    return jsonify({'results': results, 'total': len(results)})


@app.route('/api/session/<session_id>/summary')
@login_required
def api_summary(session_id):
    if not re.match(r'^\d+$', session_id):
        abort(400)
    summary = load_summary(session_id)
    return (jsonify(summary), 200) if summary else (jsonify({}), 404)


@app.route('/api/session/<session_id>/notes', methods=['GET', 'POST'])
@login_required
def api_notes(session_id):
    if not re.match(r'^\d+$', session_id):
        abort(400)
    if request.method == 'POST':
        data = request.get_json() or {}
        text = data.get('notes', '').strip()
        if text:
            with _sp_conn() as conn:
                conn.execute(
                    'INSERT INTO notes (session_id, text, timestamp, user_email, user_name) VALUES (?,?,?,?,?)',
                    (session_id, text, datetime.utcnow().isoformat(),
                     current_user.email, current_user.name),
                )
        existing = notes_for_session(load_notes(), session_id)
        return jsonify({'status': 'ok', 'notes': existing})
    return jsonify({'notes': notes_for_session(load_notes(), session_id)})


@app.route('/api/session/<session_id>/refresh-summary', methods=['POST'])
@login_required
def refresh_summary(session_id):
    if not re.match(r'^\d+$', session_id):
        abort(400)
    transcript = SESSION_DIR / f'{session_id}_transcription.txt'
    if not transcript.exists():
        return jsonify({'status': 'error', 'message': 'No transcription file found for this session.'}), 404
    script = BASE_DIR / 'summarize_transcripts.py'
    try:
        proc = subprocess.run(
            [sys.executable, str(script), '--file', session_id, '--overwrite'],
            capture_output=True, text=True, timeout=180, cwd=str(BASE_DIR),
        )
        if proc.returncode == 0:
            rebuild_fts_index()  # keep search index fresh
            return jsonify({'status': 'ok', 'output': proc.stdout.strip()})
        return jsonify({'status': 'error', 'message': (proc.stderr or proc.stdout).strip()}), 500
    except subprocess.TimeoutExpired:
        return jsonify({'status': 'error', 'message': 'Summarization timed out after 180 s.'}), 504
    except Exception as exc:
        return jsonify({'status': 'error', 'message': str(exc)}), 500


@app.route('/api/entity/<path:entity_name>')
@login_required
def api_entity(entity_name):
    entity_index = load_entity_index()
    sessions_csv = load_sessions()
    session_map = {s['session_id']: s for s in sessions_csv}

    entity_sessions = entity_index.get(entity_name, {})
    result = []
    for sid, count in sorted(entity_sessions.items(), key=lambda x: x[1], reverse=True):
        s = session_map.get(sid, {})
        result.append({
            'session_id': sid,
            'title': s.get('title', 'Unknown'),
            'speakers': s.get('speakers', ''),
            'date': s.get('date', ''),
            'count': count,
        })
    return jsonify({'entity': entity_name, 'sessions': result, 'total': len(result)})


@app.route('/api/session/<session_id>/time', methods=['POST'])
@login_required
def api_session_time(session_id):
    """Accumulate time spent (seconds) for current user on a session."""
    if not re.match(r'^\d+$', session_id):
        abort(400)
    # force=True so sendBeacon text/plain bodies are also parsed as JSON
    data = request.get_json(silent=True, force=True) or {}
    seconds = int(data.get('seconds', 0))
    if seconds <= 0:
        return jsonify({'ok': True})
    with _sp_conn() as conn:
        conn.execute(
            '''INSERT INTO session_reads (user_id, user_email, session_id, time_spent_seconds, updated_at)
               VALUES (?, ?, ?, ?, datetime('now'))
               ON CONFLICT(user_id, session_id) DO UPDATE SET
                 user_email = excluded.user_email,
                 time_spent_seconds = time_spent_seconds + excluded.time_spent_seconds,
                 updated_at = excluded.updated_at''',
            (current_user.id, current_user.email, session_id, seconds),
        )
    return jsonify({'ok': True})


@app.route('/api/visit/<int:visit_id>/time', methods=['POST'])
@login_required
def api_visit_time(visit_id):
    """Update time_spent_seconds on a specific visit row, capped at 9999 s."""
    data = request.get_json(silent=True, force=True) or {}
    seconds = int(data.get('seconds', 0))
    if seconds <= 0:
        return jsonify({'ok': True})
    with _sp_conn() as conn:
        conn.execute(
            '''UPDATE visits
               SET time_spent_seconds = MIN(COALESCE(time_spent_seconds, 0) + ?, 9999)
               WHERE id = ?''',
            (seconds, visit_id),
        )
    return jsonify({'ok': True})


@app.route('/api/session/<session_id>/flag', methods=['POST'])
@login_required
def api_session_flag(session_id):
    """Toggle the manual 'read' flag for current user on a session."""
    if not re.match(r'^\d+$', session_id):
        abort(400)
    with _sp_conn() as conn:
        row = conn.execute(
            'SELECT manually_flagged FROM session_reads WHERE user_id=? AND session_id=?',
            (current_user.id, session_id),
        ).fetchone()
        new_val = 0 if (row and row['manually_flagged']) else 1
        conn.execute(
            '''INSERT INTO session_reads (user_id, user_email, session_id, manually_flagged, updated_at)
               VALUES (?, ?, ?, ?, datetime('now'))
               ON CONFLICT(user_id, session_id) DO UPDATE SET
                 user_email = excluded.user_email,
                 manually_flagged = excluded.manually_flagged,
                 updated_at = excluded.updated_at''',
            (current_user.id, current_user.email, session_id, new_val),
        )
    return jsonify({'flagged': bool(new_val)})


@app.route('/api/visited')
@login_required
def api_visited():
    """Return session_ids the current user has 'read' (>5 min or manually flagged)."""
    with _sp_conn() as conn:
        rows = conn.execute(
            '''SELECT session_id FROM session_reads
               WHERE user_id=? AND (time_spent_seconds >= 300 OR manually_flagged = 1)''',
            (current_user.id,),
        ).fetchall()
        flagged = conn.execute(
            'SELECT session_id FROM session_reads WHERE user_id=? AND manually_flagged=1',
            (current_user.id,),
        ).fetchall()
    return jsonify({
        'visited': [r['session_id'] for r in rows],
        'flagged': [r['session_id'] for r in flagged],
    })


@app.route('/api/sessions')
@login_required
def api_sessions():
    sessions = enrich_sessions(load_sessions(), load_notes())
    entity_index = load_entity_index()

    search = request.args.get('search', '').strip().lower()
    filter_visited = request.args.get('visited', '')
    filter_notes = request.args.get('has_notes', '')
    filter_entity = request.args.get('entity', '').strip()

    if search:
        entity_hits = {sid for ent, smap in entity_index.items()
                       if search in ent.lower() for sid in smap}
        sessions = [s for s in sessions if
                    search in s['title'].lower() or
                    search in s['speakers'].lower() or
                    s['session_id'] in entity_hits]

    if filter_visited == 'true':
        sessions = [s for s in sessions if s['attended']]
    elif filter_visited == 'false':
        sessions = [s for s in sessions if not s['attended']]

    if filter_notes == 'true':
        sessions = [s for s in sessions if s['has_notes']]

    if filter_entity:
        ids = set(entity_index.get(filter_entity, {}).keys())
        sessions = [s for s in sessions if s['session_id'] in ids]

    return jsonify(sessions)


@app.route('/api/session/<session_id>/upload-video', methods=['POST'])
@login_required
def upload_video(session_id):
    if not re.match(r'^\d+$', session_id):
        abort(400)
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'No file provided'}), 400
    f = request.files['file']
    if not f.filename:
        return jsonify({'status': 'error', 'message': 'No file selected'}), 400
    dest = SESSION_DIR / f'{session_id}_stream.mp4'
    f.save(str(dest))
    rebuild_fts_index()
    return jsonify({'status': 'ok'})


@app.route('/api/session/<session_id>/upload-audio', methods=['POST'])
@login_required
def upload_audio(session_id):
    if not re.match(r'^\d+$', session_id):
        abort(400)
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'No file provided'}), 400
    f = request.files['file']
    if not f.filename:
        return jsonify({'status': 'error', 'message': 'No file selected'}), 400
    filename = secure_filename(f.filename)
    ext = Path(filename).suffix.lower()
    ALLOWED_AUDIO = {'.mp3', '.wav', '.m4a', '.ogg', '.aac', '.aiff'}
    if ext not in ALLOWED_AUDIO:
        return jsonify({'status': 'error', 'message': 'Only MP3, WAV, M4A, OGG, AAC, AIFF files are allowed'}), 400
    # Remove any existing audio file for this session
    for old_ext in ALLOWED_AUDIO:
        old = SESSION_DIR / f'{session_id}_audio{old_ext}'
        if old.exists():
            old.unlink()
    dest = SESSION_DIR / f'{session_id}_audio{ext}'
    f.save(str(dest))
    return jsonify({'status': 'ok'})


@app.route('/api/session/<session_id>/transcribe-audio', methods=['POST'])
@login_required
def transcribe_audio_api(session_id):
    """Fire-and-forget: start STT transcription for an audio recording."""
    if not re.match(r'^\d+$', session_id):
        abort(400)
    # Find the audio file
    audio_file = None
    for ext in _AUDIO_EXTS:
        p = SESSION_DIR / f'{session_id}_audio{ext}'
        if p.exists():
            audio_file = p
            break
    if not audio_file:
        return jsonify({'status': 'error', 'message': 'No audio file found for this session'}), 404

    script = BASE_DIR / 'transcribe_sessions.py'

    # Delete the existing transcription file before starting so the status
    # endpoint returns {exists: false} while the job runs, not immediately true.
    old_transcript = SESSION_DIR / f'{session_id}_transcription.txt'
    if old_transcript.exists():
        old_transcript.unlink()

    def _run():
        subprocess.run(
            [sys.executable, str(script), session_id, '--overwrite'],
            capture_output=True, text=True, cwd=str(BASE_DIR),
        )
        rebuild_fts_index()

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return jsonify({'status': 'started'})


@app.route('/api/session/<session_id>/transcription-status')
@login_required
def transcription_status(session_id):
    if not re.match(r'^\d+$', session_id):
        abort(400)
    exists = (SESSION_DIR / f'{session_id}_transcription.txt').exists()
    return jsonify({'exists': exists})


@app.route('/api/session/<session_id>/upload-document', methods=['POST'])
@login_required
def upload_document(session_id):
    if not re.match(r'^\d+$', session_id):
        abort(400)
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'No file provided'}), 400
    f = request.files['file']
    if not f.filename:
        return jsonify({'status': 'error', 'message': 'No file selected'}), 400
    filename = secure_filename(f.filename)
    ext = Path(filename).suffix.lower()
    if ext not in ('.pdf', '.ppt', '.pptx'):
        return jsonify({'status': 'error', 'message': 'Only PDF, PPT, PPTX files are allowed'}), 400
    dest = SESSION_DIR / f'{session_id}_{filename}'
    f.save(str(dest))
    return jsonify({'status': 'ok', 'filename': dest.name})


@app.route('/api/session/<session_id>/save-transcript', methods=['POST'])
@login_required
def save_transcript_api(session_id):
    if not re.match(r'^\d+$', session_id):
        abort(400)
    data = request.get_json() or {}
    text = data.get('text', '').strip()
    if not text:
        return jsonify({'status': 'error', 'message': 'No transcript text provided'}), 400
    dest = SESSION_DIR / f'{session_id}_transcription.txt'
    dest.write_text(text, encoding='utf-8')
    rebuild_fts_index()
    return jsonify({'status': 'ok'})


@app.route('/api/drive/refresh', methods=['POST'])
@login_required
def api_drive_refresh():
    """Force-reload the Drive folder index (call after uploading new videos)."""
    idx = load_drive_index(force=True)
    return jsonify({'status': 'ok', 'files': len(idx)})


@app.route('/document/<session_id>/<path:filename>')
@login_required
def serve_document(session_id, filename):
    if not re.match(r'^\d+$', session_id):
        abort(400)
    safe = secure_filename(filename)
    # Ensure the file belongs to this session and is an allowed type
    if not safe.startswith(f'{session_id}_'):
        abort(403)
    path = SESSION_DIR / safe
    if not path.exists():
        abort(404)
    ext = path.suffix.lower()
    mime_map = {
        '.pdf':  'application/pdf',
        '.ppt':  'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }
    mimetype = mime_map.get(ext, 'application/octet-stream')
    return send_file(str(path), mimetype=mimetype)


@app.route('/video/<session_id>')
@login_required
def serve_video(session_id):
    if not re.match(r'^\d+$', session_id):
        abort(400)
    path = SESSION_DIR / f'{session_id}_stream.mp4'
    if not path.exists():
        abort(404)
    return send_file(str(path), mimetype='video/mp4', conditional=True)


@app.route('/audio/<session_id>')
@login_required
def serve_audio(session_id):
    if not re.match(r'^\d+$', session_id):
        abort(400)
    AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.aiff']
    AUDIO_MIMES = {
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
        '.ogg': 'audio/ogg', '.aac': 'audio/aac', '.aiff': 'audio/aiff',
    }
    for ext in AUDIO_EXTS:
        path = SESSION_DIR / f'{session_id}_audio{ext}'
        if path.exists():
            return send_file(str(path), mimetype=AUDIO_MIMES.get(ext, 'audio/mpeg'), conditional=True)
    abort(404)


# ── Study Path ────────────────────────────────────────────────────────────────

SP_STREAM_META = {
    "Context & External Forces":             {"color": "#6366f1", "bg": "#eef2ff", "short": "Context"},
    "Strategy & Investment Portfolio":       {"color": "#8b5cf6", "bg": "#f5f3ff", "short": "Strategy"},
    "Value Creation & Adoption":             {"color": "#ec4899", "bg": "#fdf2f8", "short": "Value"},
    "Operating Model, Talent & Culture":     {"color": "#f59e0b", "bg": "#fffbeb", "short": "Talent"},
    "Governance, Risk & Trust":              {"color": "#ef4444", "bg": "#fef2f2", "short": "Governance"},
    "Data Architecture & Platforms":         {"color": "#3b82f6", "bg": "#eff6ff", "short": "Architecture"},
    "Data Engineering & DataOps":            {"color": "#06b6d4", "bg": "#ecfeff", "short": "Engineering"},
    "Analytics, ML & Decision Intelligence": {"color": "#10b981", "bg": "#ecfdf5", "short": "Analytics"},
    "GenAI, Agents & AI-Native Enterprise":  {"color": "#f97316", "bg": "#fff7ed", "short": "GenAI"},
}

SP_LEVEL_NAMES = {
    1: "General Context", 2: "Landscape", 3: "Foundations",
    4: "Core", 5: "Advanced", 6: "Applied", 7: "Mastery",
}

_sp_classification: dict | None = None

def load_dag_classification():
    global _sp_classification
    if _sp_classification is None:
        with _sp_conn() as conn:
            rows = conn.execute('SELECT session_id, stream, level FROM session_classification').fetchall()
        _sp_classification = {r['session_id']: {'stream': r['stream'], 'level': r['level']} for r in rows}
    return _sp_classification


GARTNERSESSIONS_DB = BASE_DIR / 'gartnersessions.db'


def _sp_conn():
    conn = sqlite3.connect(str(GARTNERSESSIONS_DB), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _init_sp_db():
    with _sp_conn() as conn:
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS sp_successors (
                session_id TEXT PRIMARY KEY,
                successors_json TEXT NOT NULL,
                computed_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS sp_suggestions (
                session_id TEXT PRIMARY KEY,
                suggestions_json TEXT NOT NULL,
                computed_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS sp_paths (
                path_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                user_email TEXT,
                name TEXT NOT NULL,
                sessions_json TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS sp_shares (
                token TEXT PRIMARY KEY,
                path_id TEXT NOT NULL,
                owner_name TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS session_reads (
                user_id TEXT NOT NULL,
                user_email TEXT,
                session_id TEXT NOT NULL,
                time_spent_seconds INTEGER DEFAULT 0,
                manually_flagged INTEGER DEFAULT 0,
                updated_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (user_id, session_id)
            );
            CREATE TABLE IF NOT EXISTS subject_areas (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                short TEXT NOT NULL,
                color TEXT NOT NULL,
                bg TEXT NOT NULL,
                description TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS user_ui_state (
                user_id TEXT NOT NULL,
                user_email TEXT,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (user_id, key)
            );
            CREATE TABLE IF NOT EXISTS entity_library (
                term TEXT PRIMARY KEY,
                definition TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS entity_index (
                entity TEXT NOT NULL,
                session_id TEXT NOT NULL,
                frequency INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (entity, session_id)
            );
            CREATE TABLE IF NOT EXISTS session_classification (
                session_id TEXT PRIMARY KEY,
                stream TEXT NOT NULL,
                level INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                text TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                user_email TEXT,
                user_name TEXT
            );
            CREATE TABLE IF NOT EXISTS visits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                user_email TEXT NOT NULL,
                user_name TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                time_spent_seconds INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                composite_id TEXT,
                title TEXT,
                speakers TEXT,
                time TEXT,
                date TEXT,
                day_date TEXT,
                location TEXT,
                viewing_rooms TEXT,
                attended INTEGER DEFAULT 0,
                recommended INTEGER DEFAULT 0,
                exclusive INTEGER DEFAULT 0,
                badges TEXT,
                has_files INTEGER DEFAULT 0,
                has_replay INTEGER DEFAULT 0,
                has_speaker INTEGER DEFAULT 0,
                on_agenda INTEGER DEFAULT 0,
                wrapper_state TEXT,
                session_url TEXT,
                subject_area_id TEXT,
                non_informative INTEGER DEFAULT 0
            );
        ''')


_init_sp_db()

# ── Runtime migrations ────────────────────────────────────────────────────────
def _run_migrations():
    with _sp_conn() as conn:
        existing = {r[1] for r in conn.execute("PRAGMA table_info(visits)").fetchall()}
        if 'time_spent_seconds' not in existing:
            conn.execute("ALTER TABLE visits ADD COLUMN time_spent_seconds INTEGER DEFAULT 0")

_run_migrations()


def _seed_subject_areas():
    """Migrate subject_areas.json → DB on first run (no-op if already seeded)."""
    with _sp_conn() as conn:
        if conn.execute('SELECT COUNT(*) FROM subject_areas').fetchone()[0] > 0:
            return
        path = BASE_DIR / 'subject_areas.json'
        if not path.exists():
            return
        areas = json.loads(path.read_text())
        conn.executemany(
            'INSERT OR IGNORE INTO subject_areas (id, title, short, color, bg, description, sort_order) VALUES (?,?,?,?,?,?,?)',
            [(a['id'], a['title'], a['short'], a['color'], a['bg'], a['description'], i)
             for i, a in enumerate(areas)],
        )


_seed_subject_areas()


def _seed_sessions():
    """Migrate gartner_sessions.csv → DB on first run (no-op if already seeded)."""
    with _sp_conn() as conn:
        if conn.execute('SELECT COUNT(*) FROM sessions').fetchone()[0] > 0:
            return
        path = BASE_DIR / 'gartner_sessions.csv'
        if not path.exists():
            return
        bool_fields = {'attended', 'recommended', 'exclusive', 'has_files',
                       'has_replay', 'has_speaker', 'on_agenda', 'non_informative'}
        rows = []
        with open(path, encoding='utf-8') as f:
            for row in csv.DictReader(f):
                rows.append((
                    row['session_id'], row['composite_id'], row['title'], row['speakers'],
                    row['time'], row['date'], row['day_date'], row['location'],
                    row['viewing_rooms'],
                    1 if row['attended'].strip().lower() == 'true' else 0,
                    1 if row['recommended'].strip().lower() == 'true' else 0,
                    1 if row['exclusive'].strip().lower() == 'true' else 0,
                    row['badges'],
                    1 if row['has_files'].strip().lower() == 'true' else 0,
                    1 if row['has_replay'].strip().lower() == 'true' else 0,
                    1 if row['has_speaker'].strip().lower() == 'true' else 0,
                    1 if row['on_agenda'].strip().lower() == 'true' else 0,
                    row['wrapper_state'], row['session_url'],
                    row.get('subject_area_id', ''),
                    1 if row['non_informative'].strip().lower() == 'true' else 0,
                ))
        conn.executemany(
            '''INSERT OR IGNORE INTO sessions
               (session_id, composite_id, title, speakers, time, date, day_date,
                location, viewing_rooms, attended, recommended, exclusive, badges,
                has_files, has_replay, has_speaker, on_agenda, wrapper_state,
                session_url, subject_area_id, non_informative)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
            rows,
        )


_seed_sessions()


def _seed_visits():
    """Migrate visits.json → DB on first run (no-op if already seeded)."""
    with _sp_conn() as conn:
        if conn.execute('SELECT COUNT(*) FROM visits').fetchone()[0] > 0:
            return
        path = BASE_DIR / 'visits.json'
        if not path.exists():
            return
        data = json.loads(path.read_text())
        rows = []
        for session_id, visit_list in data.items():
            for v in visit_list:
                rows.append((session_id, v['user_email'], v['user_name'], v['timestamp']))
        conn.executemany(
            'INSERT INTO visits (session_id, user_email, user_name, timestamp) VALUES (?,?,?,?)',
            rows,
        )


_seed_visits()


def _seed_notes():
    """Migrate notes.json → DB on first run (no-op if already seeded)."""
    with _sp_conn() as conn:
        if conn.execute('SELECT COUNT(*) FROM notes').fetchone()[0] > 0:
            return
        path = BASE_DIR / 'notes.json'
        if not path.exists():
            return
        data = json.loads(path.read_text())
        rows = []
        for session_id, raw in data.items():
            if isinstance(raw, str):
                if raw.strip():
                    rows.append((session_id, raw.strip(), '', None, 'Legacy note'))
            elif isinstance(raw, list):
                for note in raw:
                    rows.append((
                        session_id,
                        note.get('text', ''),
                        note.get('timestamp', ''),
                        note.get('user_email'),
                        note.get('user_name'),
                    ))
        conn.executemany(
            'INSERT INTO notes (session_id, text, timestamp, user_email, user_name) VALUES (?,?,?,?,?)',
            rows,
        )


_seed_notes()


def _seed_session_classification():
    """Migrate dag_classification.json → session_classification table on first run."""
    with _sp_conn() as conn:
        if conn.execute('SELECT COUNT(*) FROM session_classification').fetchone()[0] > 0:
            return
        path = BASE_DIR / 'dag_classification.json'
        if not path.exists():
            return
        data = json.loads(path.read_text())
        conn.executemany(
            'INSERT OR IGNORE INTO session_classification (session_id, stream, level) VALUES (?,?,?)',
            [(sid, v['stream'], v['level']) for sid, v in data.items()],
        )


_seed_session_classification()


def _seed_entity_index():
    """Migrate entity_index.json → DB on first run (no-op if already seeded)."""
    with _sp_conn() as conn:
        if conn.execute('SELECT COUNT(*) FROM entity_index').fetchone()[0] > 0:
            return
        path = BASE_DIR / 'entity_index.json'
        if not path.exists():
            return
        data = json.loads(path.read_text())
        rows = [
            (entity, session_id, freq)
            for entity, smap in data.items()
            for session_id, freq in smap.items()
        ]
        conn.executemany(
            'INSERT OR IGNORE INTO entity_index (entity, session_id, frequency) VALUES (?,?,?)',
            rows,
        )


_seed_entity_index()


def _seed_entity_library():
    """Migrate entity_library.json → DB on first run (no-op if already seeded)."""
    with _sp_conn() as conn:
        if conn.execute('SELECT COUNT(*) FROM entity_library').fetchone()[0] > 0:
            return
        path = BASE_DIR / 'entity_library.json'
        if not path.exists():
            return
        data = json.loads(path.read_text())
        conn.executemany(
            'INSERT OR IGNORE INTO entity_library (term, definition) VALUES (?,?)',
            [(term, defn) for term, defn in data.items()],
        )


_seed_entity_library()

# ── Similarity engine ─────────────────────────────────────────────────────────

_SP_STOP_WORDS = frozenset({
    'the','a','an','and','or','in','of','to','for','with','by','is','are','that',
    'this','how','we','our','your','their','its','be','as','at','from','on','into',
    'it','not','but','can','will','has','have','been','more','using','new','this',
    'each','also','what','which','when','where','key','important','different',
    'multiple','various','between','through','across','within',
})
_sp_feat_cache: dict[str, tuple] = {}


def _session_features(session_id: str) -> tuple[frozenset, frozenset, list[str]]:
    """Return (topic_words, entity_set, raw_topics) for a session. Cached in memory."""
    if session_id in _sp_feat_cache:
        return _sp_feat_cache[session_id]
    empty = (frozenset(), frozenset(), [])
    path = SESSION_DIR / f'{session_id}_summary.json'
    if not path.exists():
        _sp_feat_cache[session_id] = empty
        return empty
    try:
        d = json.loads(path.read_text())
        raw_topics: list[str] = []
        texts: list[str] = []
        for sec in d.get('sections', []):
            topic = sec.get('topic', '').strip()
            if topic:
                raw_topics.append(topic)
                texts.append(topic)
            for kp in sec.get('key_points', []):
                if kp:
                    texts.append(kp)
        for t in d.get('key_takeaways', []):
            if t:
                texts.append(t)
        words: set[str] = set()
        for text in texts:
            for w in re.sub(r'[^\w\s]', ' ', text.lower()).split():
                if len(w) > 3 and w not in _SP_STOP_WORDS:
                    words.add(w)
        entities = frozenset(
            k.lower()
            for e in d.get('entities', []) if isinstance(e, dict)
            for k in e.keys()
            if len(k) > 3
        )
        result = (frozenset(words), entities, raw_topics)
        _sp_feat_cache[session_id] = result
        return result
    except Exception:
        _sp_feat_cache[session_id] = empty
        return empty


def _score_pair(
    target_words: frozenset,
    target_entities: frozenset,
    session_id: str,
    entity_index: dict,
    n_sessions: int,
) -> tuple[float, list[str]] | None:
    """Score how relevant session_id is given the target session's features."""
    words, entities, _ = _session_features(session_id)
    if not words and not entities:
        return None

    # Jaccard similarity on topic/takeaway word bags
    union = target_words | words
    jaccard = len(target_words & words) / len(union) if union else 0.0

    # IDF-weighted entity overlap
    shared_ents = (target_entities & entities) - ENTITY_BLOCKLIST
    idf_score = sum(
        math.log(n_sessions / max(len(entity_index.get(e, {})), 1))
        for e in shared_ents
    )
    idf_norm = min(idf_score / 8.0, 1.0)

    score = jaccard * 0.55 + idf_norm * 0.45

    # Matching keywords for display
    overlap_words = sorted(target_words & words, key=len, reverse=True)
    reasons = [w for w in overlap_words if w not in ENTITY_BLOCKLIST][:6]

    return score, reasons


def _compute_sp_successors(session_id):
    """Call LLM to compute the best next sessions after session_id. Returns list of session IDs."""
    sessions = load_sessions()
    session_map = {s['session_id']: s for s in sessions}
    classification = load_dag_classification()

    s = session_map.get(session_id)
    if not s:
        return []

    clf = classification.get(session_id, {})
    current_level = clf.get('level', 4)
    current_stream = clf.get('stream', '')

    summary_path = SESSION_DIR / f'{session_id}_summary.json'
    context = ''
    if summary_path.exists():
        try:
            d = json.loads(summary_path.read_text())
            context = (d.get('summary') or '')[:400]
        except Exception:
            pass

    catalog_lines = []
    for sid, sess in session_map.items():
        if sid == session_id:
            continue
        c = classification.get(sid, {})
        lvl = c.get('level', 4)
        stream = c.get('stream', 'Unknown')
        catalog_lines.append(f'[{sid}] L{lvl} | {stream} | {sess["title"]}')

    prompt = (
        f'Session just studied: "{s["title"]}"\n'
        f'Stream: {current_stream} | Level: {current_level}/7 ({SP_LEVEL_NAMES.get(current_level, "")})\n'
        + (f'Summary: {context}\n' if context else '') +
        f'\nSelect 10-15 sessions from the catalog below that are the best NEXT sessions to study.\n'
        f'Prioritize:\n'
        f'1. Same stream at level {min(current_level + 1, 7)} or higher\n'
        f'2. Applied (L6) case studies that demonstrate this stream\'s concepts\n'
        f'3. 1-3 cross-stream sessions that directly complement this content\n'
        f'Avoid sessions at level < {max(1, current_level - 1)} unless highly complementary.\n\n'
        f'Return ONLY a JSON array of session ID strings, e.g. ["4458203","4461284"]\n\n'
        f'Catalog:\n' + '\n'.join(catalog_lines)
    )

    api_key = os.getenv('OPENROUTER_API_KEY') or os.getenv('ANTHROPIC_API_KEY')
    if not api_key:
        return []
    try:
        from openai import OpenAI
        if os.getenv('OPENROUTER_API_KEY'):
            client = OpenAI(api_key=os.getenv('OPENROUTER_API_KEY'), base_url='https://openrouter.ai/api/v1')
            model = 'anthropic/claude-haiku-4-5'
        else:
            client = OpenAI(api_key=os.getenv('ANTHROPIC_API_KEY'))
            model = 'claude-haiku-4-5-20251001'
        resp = client.chat.completions.create(
            model=model,
            max_tokens=256,
            messages=[
                {'role': 'system', 'content': 'You are a learning-path curator. Return ONLY valid JSON arrays of session ID strings. No commentary, no markdown.'},
                {'role': 'user', 'content': prompt},
            ],
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith('```'):
            raw = raw.split('\n', 1)[1].rsplit('```', 1)[0].strip()
        ids = json.loads(raw)
        return [str(i) for i in ids if str(i) in session_map]
    except Exception as e:
        print(f'[studypath] LLM error: {e}', file=sys.stderr)
        return []


def _get_sp_successors(session_id):
    """Return successor IDs from cache or compute fresh."""
    with _sp_conn() as conn:
        row = conn.execute('SELECT successors_json FROM sp_successors WHERE session_id=?', (session_id,)).fetchone()
        if row:
            return json.loads(row['successors_json'])
    ids = _compute_sp_successors(session_id)
    with _sp_conn() as conn:
        conn.execute(
            'INSERT OR REPLACE INTO sp_successors (session_id, successors_json) VALUES (?,?)',
            (session_id, json.dumps(ids)),
        )
    return ids


def _enrich_sp(session, classification):
    """Return a studypath-ready dict for a session."""
    sid = session['session_id']
    clf = classification.get(sid, {})
    stream = clf.get('stream', 'Unknown')
    level = clf.get('level', 4)
    meta = SP_STREAM_META.get(stream, {"color": "#9ca3af", "bg": "#f3f4f6", "short": "Other"})
    return {
        'session_id': sid,
        'title': session['title'],
        'speakers': session.get('speakers', ''),
        'stream': stream,
        'stream_short': meta['short'],
        'stream_color': meta['color'],
        'stream_bg': meta['bg'],
        'level': level,
        'level_name': SP_LEVEL_NAMES.get(level, ''),
        'date': session.get('date', ''),
        'time': session.get('time', ''),
        'has_summary': (SESSION_DIR / f'{sid}_summary.json').exists(),
    }


@app.route('/studypath')
@login_required
def studypath():
    return render_template('studypath.html', user_id=current_user.id)


@app.route('/studypath/shared/<token>')
@login_required
def studypath_shared(token):
    import uuid as _uuid
    with _sp_conn() as conn:
        row = conn.execute(
            '''SELECT sp_paths.path_id, sp_paths.name, sp_paths.sessions_json, sp_paths.user_id,
                      sp_shares.owner_name
               FROM sp_shares JOIN sp_paths ON sp_shares.path_id = sp_paths.path_id
               WHERE sp_shares.token = ?''',
            (token,),
        ).fetchone()
    if not row:
        abort(404)
    shared = {
        'path_id': row['path_id'],
        'name': row['name'],
        'sessions': json.loads(row['sessions_json']),
        'owner': row['owner_name'] or row['user_id'],
        'token': token,
    }
    return render_template('studypath.html', shared_path=shared, user_id=current_user.id)


ENTRY_SESSION_ID = '4508150'


@app.route('/api/studypath/start')
@login_required
def sp_api_start():
    sessions = load_sessions()
    classification = load_dag_classification()
    session_map = {s['session_id']: s for s in sessions}

    # Entry session
    entry = _enrich_sp(session_map[ENTRY_SESSION_ID], classification) if ENTRY_SESSION_ID in session_map else None

    # Per-stream: lowest level sessions grouped
    stream_min: dict[str, int] = {}
    for sid, clf in classification.items():
        if sid not in session_map or sid == ENTRY_SESSION_ID:
            continue
        stream = clf.get('stream', '')
        level = clf.get('level', 4)
        if stream and (stream not in stream_min or level < stream_min[stream]):
            stream_min[stream] = level

    groups: dict[str, list] = {}
    for sid, clf in classification.items():
        if sid not in session_map or sid == ENTRY_SESSION_ID:
            continue
        stream = clf.get('stream', '')
        level = clf.get('level', 4)
        if stream and level == stream_min.get(stream):
            groups.setdefault(stream, []).append(_enrich_sp(session_map[sid], classification))

    result_groups = []
    for stream in SP_STREAM_META:
        if stream not in groups:
            continue
        meta = SP_STREAM_META[stream]
        lvl = stream_min[stream]
        result_groups.append({
            'stream': stream,
            'stream_short': meta['short'],
            'color': meta['color'],
            'bg': meta['bg'],
            'level': lvl,
            'level_name': SP_LEVEL_NAMES.get(lvl, ''),
            'sessions': sorted(groups[stream], key=lambda x: x['title']),
        })

    return jsonify({'entry': entry, 'groups': result_groups})


@app.route('/api/studypath/suggestions/<session_id>')
@login_required
def sp_api_suggestions(session_id):
    """SSE stream: similarity-scored session suggestions, results arrive as computed."""
    if not re.match(r'^\d+$', session_id):
        abort(400)

    sessions = load_sessions()
    classification = load_dag_classification()
    session_map = {s['session_id']: s for s in sessions}
    entity_index = load_entity_index()
    n = len(session_map)

    # Serve from cache (staggered so animations still play)
    with _sp_conn() as conn:
        cached_row = conn.execute(
            'SELECT suggestions_json FROM sp_suggestions WHERE session_id=?', (session_id,)
        ).fetchone()

    if cached_row:
        cached = json.loads(cached_row['suggestions_json'])

        def gen_cached():
            yield f'data: {json.dumps({"type": "start", "cached": True, "total": len(cached)})}\n\n'
            for item in cached:
                yield f'data: {json.dumps({"type": "result", "session": item})}\n\n'
            yield f'data: {json.dumps({"type": "done", "total": len(cached)})}\n\n'

        return Response(
            stream_with_context(gen_cached()),
            mimetype='text/event-stream',
            headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
        )

    # Live computation
    target_words, target_entities, _ = _session_features(session_id)

    def gen_live():
        yield f'data: {json.dumps({"type": "start", "cached": False})}\n\n'

        if not target_words and not target_entities:
            yield f'data: {json.dumps({"type": "error", "message": "No summary data for this session"})}\n\n'
            return

        results: list[dict] = []

        def process(sid: str):
            result = _score_pair(target_words, target_entities, sid, entity_index, n)
            if result is None:
                return None
            score, reasons = result
            if score < 0.06:
                return None
            enriched = _enrich_sp(session_map[sid], classification)
            enriched['score'] = round(score, 4)
            enriched['reasons'] = reasons
            return enriched

        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
            future_map = {
                executor.submit(process, sid): sid
                for sid in session_map if sid != session_id
            }
            for future in concurrent.futures.as_completed(future_map):
                item = future.result()
                if item:
                    results.append(item)
                    yield f'data: {json.dumps({"type": "result", "session": item})}\n\n'

        results.sort(key=lambda x: -x['score'])
        top = results[:40]

        with _sp_conn() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO sp_suggestions (session_id, suggestions_json, computed_at) "
                "VALUES (?, ?, datetime('now'))",
                (session_id, json.dumps(top)),
            )

        yield f'data: {json.dumps({"type": "done", "total": len(top)})}\n\n'

    return Response(
        stream_with_context(gen_live()),
        mimetype='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )


@app.route('/api/studypath/session/<session_id>')
@login_required
def sp_api_session(session_id):
    if not re.match(r'^\d+$', session_id):
        abort(400)
    sessions = load_sessions()
    classification = load_dag_classification()
    session_map = {s['session_id']: s for s in sessions}
    if session_id not in session_map:
        abort(404)
    return jsonify(_enrich_sp(session_map[session_id], classification))


@app.route('/api/studypath/successors/<session_id>')
@login_required
def sp_api_successors(session_id):
    if not re.match(r'^\d+$', session_id):
        abort(400)
    sessions = load_sessions()
    classification = load_dag_classification()
    session_map = {s['session_id']: s for s in sessions}
    if session_id not in session_map:
        abort(404)

    successor_ids = _get_sp_successors(session_id)
    enriched = [
        _enrich_sp(session_map[sid], classification)
        for sid in successor_ids if sid in session_map
    ]

    # Group by stream (in canonical order), then by level within each stream
    groups = {}
    for item in enriched:
        stream = item['stream']
        if stream not in groups:
            groups[stream] = {
                'stream': stream,
                'stream_short': item['stream_short'],
                'color': item['stream_color'],
                'bg': item['stream_bg'],
                'levels': {},
            }
        lvl = item['level']
        groups[stream]['levels'].setdefault(lvl, []).append(item)

    result_groups = []
    for stream in SP_STREAM_META:
        if stream not in groups:
            continue
        g = groups[stream]
        result_groups.append({
            'stream': stream,
            'stream_short': g['stream_short'],
            'color': g['color'],
            'bg': g['bg'],
            'levels': [
                {'level': lvl, 'level_name': SP_LEVEL_NAMES.get(lvl, ''), 'sessions': slist}
                for lvl, slist in sorted(g['levels'].items())
            ],
        })

    current = _enrich_sp(session_map[session_id], classification)
    return jsonify({'current': current, 'groups': result_groups, 'total': len(enriched)})


@app.route('/api/user/state/<key>', methods=['GET', 'POST', 'DELETE'])
@login_required
def user_state(key):
    """Per-user key/value store for UI state (active study, path editor state)."""
    if not re.match(r'^[a-z_]+$', key):
        abort(400)
    with _sp_conn() as conn:
        if request.method == 'GET':
            row = conn.execute(
                'SELECT value FROM user_ui_state WHERE user_id=? AND key=?',
                (current_user.id, key),
            ).fetchone()
            return jsonify({'value': json.loads(row['value']) if row else None})
        elif request.method == 'POST':
            value = request.get_json(silent=True)
            if value is None:
                abort(400)
            conn.execute(
                '''INSERT INTO user_ui_state (user_id, user_email, key, value, updated_at)
                   VALUES (?, ?, ?, ?, datetime('now'))
                   ON CONFLICT(user_id, key) DO UPDATE SET
                     user_email=excluded.user_email,
                     value=excluded.value, updated_at=excluded.updated_at''',
                (current_user.id, current_user.email, key, json.dumps(value)),
            )
            return jsonify({'ok': True})
        else:  # DELETE
            conn.execute(
                'DELETE FROM user_ui_state WHERE user_id=? AND key=?',
                (current_user.id, key),
            )
            return jsonify({'ok': True})


@app.route('/api/studypath/paths', methods=['GET', 'POST'])
@login_required
def sp_api_paths():
    import uuid as _uuid
    if request.method == 'POST':
        data = request.get_json() or {}
        name = (data.get('name') or 'My Path').strip()
        sessions_list = data.get('sessions', [])
        path_id = data.get('path_id') or _uuid.uuid4().hex
        with _sp_conn() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO sp_paths (path_id, user_id, user_email, name, sessions_json, updated_at) "
                "VALUES (?, ?, ?, ?, ?, datetime('now'))",
                (path_id, current_user.id, current_user.email, name, json.dumps(sessions_list)),
            )
        return jsonify({'status': 'ok', 'path_id': path_id})

    with _sp_conn() as conn:
        rows = conn.execute(
            'SELECT path_id, name, sessions_json, created_at, updated_at FROM sp_paths '
            'WHERE user_id=? ORDER BY updated_at DESC',
            (current_user.id,),
        ).fetchall()
        paths = []
        for row in rows:
            share = conn.execute(
                'SELECT token FROM sp_shares WHERE path_id=? ORDER BY created_at DESC LIMIT 1',
                (row['path_id'],),
            ).fetchone()
            paths.append({
                'path_id': row['path_id'],
                'name': row['name'],
                'session_count': len(json.loads(row['sessions_json'])),
                'sessions': json.loads(row['sessions_json']),
                'created_at': row['created_at'],
                'updated_at': row['updated_at'],
                'share_token': share['token'] if share else None,
            })
    return jsonify({'paths': paths})


@app.route('/api/studypath/paths/<path_id>', methods=['DELETE'])
@login_required
def sp_api_delete_path(path_id):
    with _sp_conn() as conn:
        conn.execute('DELETE FROM sp_shares WHERE path_id=?', (path_id,))
        conn.execute('DELETE FROM sp_paths WHERE path_id=? AND user_id=?', (path_id, current_user.id))
    return jsonify({'status': 'ok'})


@app.route('/api/studypath/paths/<path_id>/share', methods=['POST'])
@login_required
def sp_api_share(path_id):
    import uuid as _uuid
    with _sp_conn() as conn:
        row = conn.execute(
            'SELECT path_id FROM sp_paths WHERE path_id=? AND user_id=?', (path_id, current_user.id)
        ).fetchone()
    if not row:
        abort(403)
    token = _uuid.uuid4().hex
    with _sp_conn() as conn:
        conn.execute(
            'INSERT INTO sp_shares (token, path_id, owner_name) VALUES (?,?,?)',
            (token, path_id, current_user.name),
        )
    share_url = url_for('studypath_shared', token=token, _external=True)
    return jsonify({'status': 'ok', 'token': token, 'url': share_url})


if __name__ == '__main__':
    app.run(debug=True, port=5001)
