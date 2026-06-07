#!/usr/bin/env python3
"""
Fetch session descriptions from Gartner Conference Navigator for sessions
that don't yet have a _summary.json file.

Strategy:
  1. Use Playwright (real Chrome) to log in — bypasses Cloudflare.
  2. For each session missing a _summary.json, navigate to:
       https://cn.gartner.com/BIE27I/sessiondetails/{session_id}
  3. Extract div.session-detail-description text.
  4. Save minimal _summary.json with the description as the summary.

Usage:
    python fetch_descriptions.py              # process all missing sessions
    python fetch_descriptions.py --top_n 5   # only first 5 (for testing)
    python fetch_descriptions.py --headless  # run Chrome in headless mode
"""

import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
import os

load_dotenv(Path(__file__).parent / ".env")

USER_ID  = os.environ.get("GARTNER_USER_ID", "")
PASSWORD = os.environ.get("GARTNER_PASSWORD", "")

BASE_DIR   = Path(__file__).parent
DB_PATH    = BASE_DIR / "gartnersessions.db"
DETAIL_DIR = BASE_DIR / "session_details"


def _db_conn():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn
CONF_CODE  = "BIE27I"
SIGNIN_URL = "https://www.gartner.com/account/signin"
DETAIL_BASE = f"https://cn.gartner.com/{CONF_CODE}/sessiondetails"


def log(msg: str):
    print(msg, flush=True)


def _screenshot(page, name: str):
    path = str(BASE_DIR / f"debug_{name}.png")
    page.screenshot(path=path)
    log(f"  [screenshot] {path}")


def dismiss_onetrust(page):
    try:
        for sel in ["#onetrust-accept-btn-handler",
                    "button:has-text('Accept All Cookies')",
                    "button:has-text('Accept All')"]:
            btn = page.query_selector(sel)
            if btn:
                page.evaluate("el => el.click()", btn)
                time.sleep(0.5)
                return
        if page.query_selector("#onetrust-consent-sdk"):
            page.evaluate("document.getElementById('onetrust-consent-sdk')?.remove()")
    except Exception:
        pass


def do_login(page, user_id: str, password: str, PWTimeout):
    target = f"{SIGNIN_URL}?targetUrl=https%3A%2F%2Fcn.gartner.com%2F"
    log("  Navigating to sign-in page...")
    page.goto(target, wait_until="domcontentloaded", timeout=30_000)
    dismiss_onetrust(page)

    page.wait_for_selector("#username, input[name='username']", timeout=15_000)
    page.fill("#username, input[name='username']", user_id)

    page.wait_for_selector("#gSignInButton", timeout=10_000)
    page.evaluate("document.getElementById('gSignInButton').click()")

    page.wait_for_selector("input[type='password']", timeout=15_000)
    dismiss_onetrust(page)
    page.fill("input[type='password']", password)

    page.keyboard.press("Enter")
    time.sleep(1)
    _screenshot(page, "after_submit")

    log("  Waiting for post-login redirect...")
    try:
        page.wait_for_function(
            "() => !window.location.href.includes('/account/signin')",
            timeout=30_000,
        )
        log(f"  Logged in. URL: {page.url}")
    except PWTimeout:
        _screenshot(page, "login_timeout")
        for err_sel in [".error", ".alert", "[role='alert']", ".gErrorMessage"]:
            el = page.query_selector(err_sel)
            if el:
                log(f"  Login error: {el.inner_text().strip()}")
        log(f"  Redirect timed out — continuing anyway. URL: {page.url}")


def fetch_description(page, session_id: str, PWTimeout) -> str | None:
    url = f"{DETAIL_BASE}/{session_id}"
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        dismiss_onetrust(page)

        # Wait for the description div
        page.wait_for_selector(
            "div.session-detail-description, [class*='session-detail-description']",
            timeout=15_000,
        )
        el = page.query_selector(
            "div.session-detail-description, [class*='session-detail-description']"
        )
        if el:
            text = el.inner_text().strip()
            return text if text else None

        # Fallback: try broader selectors
        for sel in [".session-description", ".sessionDescription",
                    "[class*='description']", ".session-detail"]:
            el = page.query_selector(sel)
            if el:
                text = el.inner_text().strip()
                if text and len(text) > 50:
                    log(f"    [fallback selector: {sel}]")
                    return text

        _screenshot(page, f"no_desc_{session_id}")
        log(f"  [{session_id}] WARNING: description element not found")
        return None

    except PWTimeout:
        _screenshot(page, f"timeout_{session_id}")
        log(f"  [{session_id}] TIMEOUT loading page")
        return None
    except Exception as exc:
        log(f"  [{session_id}] ERROR: {exc}")
        return None


def load_sessions_needing_summaries(detail_dir: Path, top_n: int = 0) -> list[dict]:
    with _db_conn() as conn:
        rows = conn.execute('SELECT * FROM sessions').fetchall()
    sessions = [
        dict(r) for r in rows
        if not (detail_dir / f"{r['session_id']}_summary.json").exists()
    ]
    if top_n:
        sessions = sessions[:top_n]
    return sessions


def save_summary(session: dict, description: str, detail_dir: Path):
    sid = session["session_id"]
    subject_area_id = session.get("subject_area_id", "").strip() or None
    data = {
        "summary": description,
        "sections": [],
        "key_takeaways": [],
        "entities": [],
        "subject_area_id": subject_area_id,
    }
    out_path = detail_dir / f"{sid}_summary.json"
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"  [{sid}] Saved summary ({len(description)} chars)")


def main():
    parser = argparse.ArgumentParser(
        description="Fetch Gartner session descriptions for sessions missing summaries"
    )
    parser.add_argument("--top_n", type=int, default=0,
                        help="Limit to first N sessions (for testing)")
    parser.add_argument("--headless", action="store_true",
                        help="Run Chrome in headless mode")
    args = parser.parse_args()

    if not USER_ID or not PASSWORD:
        print("ERROR: GARTNER_USER_ID and GARTNER_PASSWORD must be set in .env")
        sys.exit(1)

    DETAIL_DIR.mkdir(exist_ok=True)

    sessions = load_sessions_needing_summaries(DETAIL_DIR, top_n=args.top_n)
    log(f"Sessions missing summaries: {len(sessions)}")

    if not sessions:
        log("Nothing to do.")
        sys.exit(0)

    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright"])
        subprocess.check_call([sys.executable, "-m", "playwright", "install", "chrome"])
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

    log(f"\nLogging in as: {USER_ID}")

    results = {"ok": 0, "failed": 0, "empty": 0}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel="chrome",
            headless=args.headless,
            slow_mo=100,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
        )
        page = context.new_page()
        do_login(page, USER_ID, PASSWORD, PWTimeout)

        for i, session in enumerate(sessions, 1):
            sid   = session["session_id"]
            title = session.get("title", "")[:60]
            log(f"\n[{i}/{len(sessions)}] {sid} — {title}")

            description = fetch_description(page, sid, PWTimeout)

            if description:
                save_summary(session, description, DETAIL_DIR)
                results["ok"] += 1
            else:
                log(f"  [{sid}] No description found — skipping")
                results["empty"] += 1

            # Small pause to be polite
            time.sleep(0.5)

        browser.close()

    log(f"\nDone.")
    log(f"  Saved   : {results['ok']}")
    log(f"  Empty   : {results['empty']}")
    log(f"  Errors  : {results['failed']}")


if __name__ == "__main__":
    main()
