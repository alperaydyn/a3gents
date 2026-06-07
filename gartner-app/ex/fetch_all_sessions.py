#!/usr/bin/env python3
"""
Fetch session documents for ALL sessions in gartner_sessions.csv.

Reads authentication from:
  - .env              → GARTNER_BEARER_TOKEN
  - cookies.json      → browser cookies (exported from DevTools)

Stores results in session_details/ folder:
  - {session_id}_media.json    — raw API response for available documents
  - {session_id}_detail.json   — session metadata
  - {session_id}_document.pdf  — downloaded presentation files

Usage:
    python fetch_all_sessions.py --session 4581709   # single session
    python fetch_all_sessions.py --files-only        # only sessions with has_files=True
    python fetch_all_sessions.py --files-only --resume  # skip already processed
    python fetch_all_sessions.py                     # process all sessions

To export cookies from Chrome:
    1. Open DevTools → Console on any cn.gartner.com page
    2. Run:  copy(JSON.stringify(document.cookie.split('; ').reduce((o,p)=>{const[k,...v]=p.split('=');o[k]=v.join('=');return o},{})))
    3. Paste into cookies.json
"""

import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

# Load .env from the same directory as the script
load_dotenv(Path(__file__).parent / ".env")

# ─── Configuration ────────────────────────────────────────────────────────────
CONFERENCE_ID = "13225"
API_BASE = "https://api.ct.aws.gartner.com/ConfAggService/agenda"
SESSION_PAGE_BASE = "https://cn.gartner.com/BIE27I/sessiondetails"

RATE_LIMIT_SECONDS = 1.5      # delay between API calls
DOWNLOAD_TIMEOUT = 60         # timeout for document downloads (seconds)

HEADERS_BASE = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://cn.gartner.com",
    "Referer": "https://cn.gartner.com/",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
}


# ─── Auth ─────────────────────────────────────────────────────────────────────
def load_auth() -> dict:
    """Load bearer token from .env and cookies from cookies.json."""
    bearer = os.environ.get("GARTNER_BEARER_TOKEN", "")
    cookies = {}

    cookie_path = Path(__file__).parent / "cookies.json"
    if cookie_path.exists():
        try:
            cookies = json.loads(cookie_path.read_text(encoding="utf-8"))
            print(f"🍪 Loaded {len(cookies)} cookies from cookies.json")
        except (json.JSONDecodeError, IOError) as e:
            print(f"⚠  Failed to load cookies.json: {e}")

    if bearer:
        print(f"🔑 Bearer token loaded from .env ({len(bearer)} chars)")
    else:
        print("❌ No GARTNER_BEARER_TOKEN in .env")

    return {"bearer_token": bearer, "cookies": cookies}


# ─── API Functions ────────────────────────────────────────────────────────────
def fetch_media(session_id: str, auth: dict) -> list[dict]:
    """Fetch document/media info for a session via the GetAppointmentMedia API."""
    url = f"{API_BASE}/GetAppointmentMedia/{CONFERENCE_ID}/{session_id}"

    headers = {**HEADERS_BASE}
    if auth.get("bearer_token"):
        headers["Authorization"] = f"Bearer {auth['bearer_token']}"

    resp = requests.get(
        url,
        headers=headers,
        cookies=auth.get("cookies", {}),
        params={"LanguageCode": "en"},
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    if isinstance(data, list):
        return data
    elif isinstance(data, dict):
        return data.get("Documents", data.get("Assets", [data] if data else []))
    return []


def download_asset(asset: dict, output_dir: Path, session_id: str, doc_index: int = 0) -> dict:
    """Download a single asset/document. Returns download result info."""
    url = asset.get("AssetLink", "")
    asset_id = asset.get("AssetId", "unknown")
    ext = asset.get("Extn", "pdf")

    if not url:
        return {"status": "skipped", "reason": "no AssetLink", "asset_id": asset_id}

    # Name files as {session_id}_document.{ext}
    if doc_index > 0:
        name = f"{session_id}_document_{doc_index + 1}.{ext}"
    else:
        name = f"{session_id}_document.{ext}"

    output_path = output_dir / name

    # Skip if already downloaded
    if output_path.exists() and output_path.stat().st_size > 0:
        return {
            "status": "exists",
            "file": str(output_path),
            "size": output_path.stat().st_size,
            "asset_id": asset_id,
        }

    try:
        # CloudFront signed URLs don't need bearer auth
        resp = requests.get(
            url,
            headers={"User-Agent": HEADERS_BASE["User-Agent"]},
            timeout=DOWNLOAD_TIMEOUT,
            stream=True,
        )
        resp.raise_for_status()

        with open(output_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)

        size = output_path.stat().st_size
        return {
            "status": "downloaded",
            "file": str(output_path),
            "size": size,
            "asset_id": asset_id,
        }
    except Exception as e:
        return {"status": "error", "error": str(e), "asset_id": asset_id}


def process_session(session: dict, output_dir: Path, auth: dict, resume: bool = False) -> dict:
    """Process a single session: fetch media info and download documents."""
    session_id = session["session_id"]
    title = session.get("title", "")
    has_files = session.get("has_files", "").strip().lower() == "true"

    media_path = output_dir / f"{session_id}_media.json"
    detail_path = output_dir / f"{session_id}_detail.json"

    result = {
        "session_id": session_id,
        "title": title,
        "has_files": has_files,
        "media_fetched": False,
        "documents": [],
        "errors": [],
    }

    # Skip if already fully processed (resume mode)
    if resume and detail_path.exists():
        try:
            existing = json.loads(detail_path.read_text(encoding="utf-8"))
            if existing.get("media_fetched"):
                result["media_fetched"] = True
                result["documents"] = existing.get("documents", [])
                result["skipped"] = True
                return result
        except (json.JSONDecodeError, KeyError):
            pass

    # ── Fetch media/document info ──
    try:
        media_assets = fetch_media(session_id, auth)
        result["media_fetched"] = True

        # Save raw media response
        with open(media_path, "w", encoding="utf-8") as f:
            json.dump(media_assets, f, indent=2, ensure_ascii=False)

        # Download each document
        doc_idx = 0
        for asset in media_assets:
            if not asset.get("Display", True):
                continue
            dl_result = download_asset(asset, output_dir, session_id, doc_idx)
            result["documents"].append(dl_result)
            doc_idx += 1

    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else "?"
        result["errors"].append(f"Media API HTTP {status_code}")
    except Exception as e:
        result["errors"].append(f"Media fetch error: {e}")

    # ── Save session detail JSON ──
    detail = {
        "session_id": session_id,
        "title": title,
        "speakers": session.get("speakers", ""),
        "time": session.get("time", ""),
        "date": session.get("date", ""),
        "location": session.get("location", ""),
        "session_url": f"{SESSION_PAGE_BASE}/{session_id}",
        "has_files_csv": has_files,
        "media_fetched": result["media_fetched"],
        "documents": result["documents"],
        "errors": result["errors"],
    }

    with open(detail_path, "w", encoding="utf-8") as f:
        json.dump(detail, f, indent=2, ensure_ascii=False)

    return result


# ─── Main ─────────────────────────────────────────────────────────────────────
def load_sessions(csv_path: str) -> list[dict]:
    """Load sessions from CSV."""
    sessions = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            sessions.append(row)
    return sessions


def main():
    parser = argparse.ArgumentParser(description="Fetch Gartner session details and documents")
    parser.add_argument("--files-only", action="store_true",
                        help="Only process sessions that have files (has_files=True)")
    parser.add_argument("--resume", action="store_true",
                        help="Skip sessions that were already processed")
    parser.add_argument("--session", type=str, default=None,
                        help="Process a single session ID")
    parser.add_argument("--delay", type=float, default=RATE_LIMIT_SECONDS,
                        help=f"Delay between API calls in seconds (default: {RATE_LIMIT_SECONDS})")
    parser.add_argument("--csv", type=str, default=None,
                        help="Path to sessions CSV (default: gartner_sessions.csv)")
    args = parser.parse_args()

    # Paths
    base_dir = Path(__file__).parent
    csv_path = args.csv or str(base_dir / "gartner_sessions.csv")
    output_dir = base_dir / "session_details"
    output_dir.mkdir(exist_ok=True)

    # ── Authentication ──
    auth = load_auth()

    if not auth.get("bearer_token"):
        sys.exit(1)

    # Quick auth test
    print("\n🔑 Testing authentication...")
    try:
        test_media = fetch_media("4458203", auth)
        print(f"✅ Auth OK (test returned {len(test_media)} assets)")
    except requests.exceptions.HTTPError as e:
        code = e.response.status_code if e.response is not None else "?"
        print(f"❌ Auth test failed: HTTP {code}")
        if str(code) == "500":
            print("   Token or cookies expired. Update .env and/or cookies.json")
        sys.exit(1)

    # Load sessions
    all_sessions = load_sessions(csv_path)
    print(f"\n📋 Loaded {len(all_sessions)} sessions from CSV")

    # Filter
    if args.session:
        sessions = [s for s in all_sessions if s["session_id"] == args.session]
        if not sessions:
            print(f"❌ Session {args.session} not found in CSV")
            sys.exit(1)
    elif args.files_only:
        sessions = [s for s in all_sessions if s.get("has_files", "").strip().lower() == "true"]
        print(f"📁 Filtered to {len(sessions)} sessions with files")
    else:
        sessions = all_sessions

    # Process
    print(f"\n{'=' * 70}")
    print(f"  Processing {len(sessions)} sessions")
    print(f"  Output directory: {output_dir}")
    print(f"  Rate limit: {args.delay}s between API calls")
    print(f"  Resume mode: {'ON' if args.resume else 'OFF'}")
    print(f"{'=' * 70}\n")

    stats = {
        "total": len(sessions),
        "processed": 0,
        "skipped": 0,
        "with_documents": 0,
        "documents_downloaded": 0,
        "documents_existed": 0,
        "errors": 0,
        "no_media": 0,
    }

    for i, session in enumerate(sessions, 1):
        sid = session["session_id"]
        title = session.get("title", "")[:55]

        print(f"\n[{i}/{len(sessions)}] Session {sid}: {title}")

        result = process_session(session, output_dir, auth, resume=args.resume)
        stats["processed"] += 1

        if result.get("skipped"):
            stats["skipped"] += 1
            doc_count = len(result.get("documents", []))
            print(f"  ⏭  Skipped (already processed, {doc_count} docs)")
            continue

        # Report results
        docs = result.get("documents", [])
        if docs:
            stats["with_documents"] += 1
            for d in docs:
                status = d.get("status", "?")
                if status == "downloaded":
                    size_mb = d.get("size", 0) / (1024 * 1024)
                    print(f"  📥 Downloaded: {Path(d['file']).name} ({size_mb:.1f} MB)")
                    stats["documents_downloaded"] += 1
                elif status == "exists":
                    print(f"  ✅ Already exists: {Path(d['file']).name}")
                    stats["documents_existed"] += 1
                elif status == "error":
                    print(f"  ❌ Download error: {d.get('error', '?')}")
                    stats["errors"] += 1
                elif status == "skipped":
                    print(f"  ⏭  Skipped: {d.get('reason', '?')}")
        else:
            has_files = session.get("has_files", "").strip().lower() == "true"
            if has_files:
                print(f"  ⚠  has_files=True but no media returned")
            else:
                print(f"  📄 No documents")
            stats["no_media"] += 1

        if result.get("errors"):
            for err in result["errors"]:
                print(f"  ❌ {err}")
                stats["errors"] += 1

        # Rate limiting
        if i < len(sessions):
            time.sleep(args.delay)

    # ── Summary ──
    print(f"\n\n{'=' * 70}")
    print("  SUMMARY")
    print(f"{'=' * 70}")
    print(f"  Total sessions:        {stats['total']}")
    print(f"  Processed:             {stats['processed']}")
    print(f"  Skipped (resumed):     {stats['skipped']}")
    print(f"  With documents:        {stats['with_documents']}")
    print(f"  Documents downloaded:  {stats['documents_downloaded']}")
    print(f"  Already existed:       {stats['documents_existed']}")
    print(f"  No media:              {stats['no_media']}")
    print(f"  Errors:                {stats['errors']}")
    print(f"{'=' * 70}")

    # Save summary
    summary_path = output_dir / "_fetch_summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)
    print(f"\n  Summary saved to: {summary_path}")


if __name__ == "__main__":
    main()
