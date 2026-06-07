#!/usr/bin/env python3
"""
Download streaming video from Gartner Conference Navigator.

Strategy:
  1. Use Playwright (real Chrome) to log in — bypasses Cloudflare.
  2. Read gartner_sessions.csv, filter has_replay=True sessions.
  3. Skip sessions that already have a stream file in session_details/.
  4. For each remaining session: navigate to stream page, intercept the
     HLS (.m3u8) URL, download with ffmpeg as {session_id}_stream.mp4.

Usage:
    python download_stream.py --all             # download all with has_replay=True
    python download_stream.py --all --top_n 4   # only the first 4 (for testing)

Install dependencies:
    pip install playwright python-dotenv
    playwright install chrome
    brew install ffmpeg
"""

import argparse
import csv
import os
import re
import subprocess
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

# ─── Config ───────────────────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env")

USER_ID  = os.environ.get("GARTNER_USER_ID", "")
PASSWORD = os.environ.get("GARTNER_PASSWORD", "")

BASE_DIR      = Path(__file__).parent
CSV_PATH      = BASE_DIR / "gartner_sessions.csv"
OUTPUT_DIR    = BASE_DIR / "session_details"
CONF_CODE     = "BIE27I"
SIGNIN_URL    = "https://www.gartner.com/account/signin"
STREAM_BASE   = f"https://cn.gartner.com/stream/{CONF_CODE}"


# ─── Debug helper ────────────────────────────────────────────────────────────
def _screenshot(page, name: str):
    path = str(Path(__file__).parent / f"debug_{name}.png")
    page.screenshot(path=path)
    print(f"  [screenshot] {path}")


# ─── OneTrust helper ──────────────────────────────────────────────────────────
def dismiss_onetrust(page):
    """Remove the OneTrust cookie-consent overlay if it is present."""
    try:
        for sel in ["#onetrust-accept-btn-handler",
                    "button:has-text('Accept All Cookies')",
                    "button:has-text('Accept All')"]:
            btn = page.query_selector(sel)
            if btn:
                page.evaluate("el => el.click()", btn)
                print("  [onetrust] dismissed")
                time.sleep(0.5)
                return
        if page.query_selector("#onetrust-consent-sdk"):
            page.evaluate("document.getElementById('onetrust-consent-sdk')?.remove()")
            print("  [onetrust] removed via JS")
    except Exception:
        pass


# ─── Login ────────────────────────────────────────────────────────────────────
def do_login(page, user_id: str, password: str, PWTimeout):
    """Fill in the Gartner multi-step login form."""
    target = f"{SIGNIN_URL}?targetUrl=https%3A%2F%2Fcn.gartner.com%2F"
    print(f"  → {target}")
    page.goto(target, wait_until="domcontentloaded", timeout=30_000)
    dismiss_onetrust(page)

    # --- Step A: enter username ---
    print("  Waiting for username field...")
    page.wait_for_selector("#username, input[name='username']", timeout=15_000)
    page.fill("#username, input[name='username']", user_id)
    print(f"  Filled username: {user_id}")

    # --- Step B: click "Sign in Using Password" (#gSignInButton) ---
    print("  Clicking 'Sign in Using Password'...")
    page.wait_for_selector("#gSignInButton", timeout=10_000)
    page.evaluate("document.getElementById('gSignInButton').click()")

    # --- Step C: wait for password field ---
    print("  Waiting for password field...")
    page.wait_for_selector("input[type='password']", timeout=15_000)
    dismiss_onetrust(page)  # overlay sometimes reappears here
    page.fill("input[type='password']", password)
    print("  Filled password.")

    # --- Step D: submit via Enter (most reliable — avoids wrong button match) ---
    print("  Submitting...")
    page.keyboard.press("Enter")
    time.sleep(1)
    _screenshot(page, "after_submit")

    # --- Step E: wait for successful redirect away from signin page ---
    print("  Waiting for post-login redirect...")
    try:
        # Wait until the URL changes away from the signin page
        page.wait_for_function(
            "() => !window.location.href.includes('/account/signin')",
            timeout=30_000,
        )
        print(f"  Redirected to: {page.url}")
    except PWTimeout:
        _screenshot(page, "login_timeout")
        # Check for inline error messages
        for err_sel in [".error", ".alert", "[class*='error']", "[class*='alert']",
                        "[role='alert']", ".gErrorMessage"]:
            el = page.query_selector(err_sel)
            if el:
                print(f"  Login error on page ({err_sel}): {el.inner_text().strip()}")
        print(f"  Redirect timed out. URL: {page.url}")
        # Continue anyway — we may still have valid auth cookies


# ─── Stream interception ──────────────────────────────────────────────────────
def find_stream_url(page, stream_page_url: str, PWTimeout) -> str:
    """
    Navigate to the stream page and intercept network requests to find
    the HLS manifest (.m3u8) or direct video URL.
    """
    captured = []

    def on_request(request):
        url = request.url
        if re.search(r"\.(m3u8|mpd|mp4)(\?|$)", url, re.IGNORECASE):
            captured.append(url)
            print(f"  [network] captured: {url[:120]}")

    page.on("request", on_request)

    print(f"\n  Navigating to stream page: {stream_page_url}")
    page.goto(stream_page_url, wait_until="domcontentloaded", timeout=30_000)

    # Wait for the page to settle, then click the play button
    time.sleep(3)
    _screenshot(page, "stream_page_loaded")

    play_selectors = [
        "button.vjs-big-play-button",   # Video.js
        "button[aria-label='Play']",
        "button[title='Play']",
        ".play-button",
        "[class*='play']",
        "video",                         # click the video element itself as fallback
    ]
    for sel in play_selectors:
        el = page.query_selector(sel)
        if el:
            print(f"  Clicking play: {sel}")
            page.evaluate("el => el.click()", el)
            break
    else:
        print("  No play button found — video may auto-play.")

    # Wait up to 30 s for a video manifest to appear in network traffic
    print("  Waiting for video URL in network traffic...")
    deadline = time.time() + 30
    while time.time() < deadline:
        if captured:
            break
        time.sleep(0.5)

    # Prefer .m3u8, then .mpd, then .mp4
    for pattern in [r"\.m3u8", r"\.mpd", r"\.mp4"]:
        for url in captured:
            if re.search(pattern, url, re.IGNORECASE):
                return url

    return captured[0] if captured else ""


# ─── Cookie export ────────────────────────────────────────────────────────────
def cookies_to_header(cookies: list[dict]) -> str:
    """Build a Cookie: header string from a list of Playwright cookie dicts."""
    return "; ".join(f"{c['name']}={c['value']}" for c in cookies)


def save_cookies_netscape(cookies: list[dict], path: str):
    with open(path, "w", encoding="utf-8") as f:
        f.write("# Netscape HTTP Cookie File\n")
        for c in cookies:
            domain = c.get("domain", "")
            if domain and not domain.startswith("."):
                domain = f".{domain}"
            secure   = "TRUE" if c.get("secure") else "FALSE"
            expires  = max(int(c.get("expires", 0) or 0), 0)
            f.write(
                f"{domain}\tTRUE\t{c.get('path','/')}\t"
                f"{secure}\t{expires}\t{c['name']}\t{c['value']}\n"
            )


# ─── ffmpeg download ─────────────────────────────────────────────────────────
def download_with_ffmpeg(stream_url: str, cookie_header: str, output: str):
    """Download an HLS/DASH stream using ffmpeg."""
    cmd = [
        "ffmpeg", "-y",
        "-headers", f"Cookie: {cookie_header}\r\nReferer: https://cn.gartner.com/\r\n",
        "-i", stream_url,
        "-c", "copy",
        output,
    ]
    print(f"\nRunning ffmpeg:")
    print("  " + " ".join(cmd[:6]) + " ... " + output)
    subprocess.run(cmd, check=True)
    print(f"\nSaved to: {output}")


# ─── CSV helpers ──────────────────────────────────────────────────────────────
def load_replay_sessions(csv_path: Path, top_n: int = 0) -> list[dict]:
    """Return sessions with has_replay=True, optionally limited to top_n."""
    sessions = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("has_replay", "").strip().lower() == "true":
                sessions.append(row)
    if top_n:
        sessions = sessions[:top_n]
    return sessions


def already_downloaded(session_id: str) -> bool:
    return (OUTPUT_DIR / f"{session_id}_stream.mp4").exists()


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Download Gartner session streams")
    parser.add_argument("--all", action="store_true",
                        help="Download all sessions with has_replay=True")
    parser.add_argument("--top_n", type=int, default=0,
                        help="Limit to first N sessions (for testing)")
    args = parser.parse_args()

    if not args.all:
        parser.print_help()
        sys.exit(0)

    if not USER_ID or not PASSWORD:
        print("ERROR: GARTNER_USER_ID and GARTNER_PASSWORD must be set in .env")
        sys.exit(1)

    OUTPUT_DIR.mkdir(exist_ok=True)

    # ── Load sessions ──
    sessions = load_replay_sessions(CSV_PATH, top_n=args.top_n)
    pending = [s for s in sessions if not already_downloaded(s["session_id"])]

    print(f"Sessions with has_replay=True : {len(sessions)}")
    print(f"Already downloaded            : {len(sessions) - len(pending)}")
    print(f"To download                   : {len(pending)}")

    if not pending:
        print("Nothing to do.")
        sys.exit(0)

    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright"])
        subprocess.check_call([sys.executable, "-m", "playwright", "install", "chrome"])
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

    print(f"\nLogging in as: {USER_ID}\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel="chrome",
            headless=False,
            slow_mo=150,
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

        # Login once — reuse the session for all downloads
        do_login(page, USER_ID, PASSWORD, PWTimeout)

        results = {"ok": 0, "failed": 0, "skipped": 0}

        for i, session in enumerate(pending, 1):
            sid   = session["session_id"]
            title = session.get("title", "")[:60]
            out   = OUTPUT_DIR / f"{sid}_stream.mp4"

            print(f"\n[{i}/{len(pending)}] {sid}: {title}")

            stream_url = find_stream_url(page, f"{STREAM_BASE}/{sid}", PWTimeout)

            if not stream_url:
                print(f"  SKIP — no video URL captured. Saving debug page.")
                (BASE_DIR / f"debug_{sid}_page.html").write_text(
                    page.content(), encoding="utf-8"
                )
                results["failed"] += 1
                continue

            print(f"  Stream URL: {stream_url[:100]}")
            cookies = context.cookies()
            cookie_header = cookies_to_header(cookies)

            try:
                download_with_ffmpeg(stream_url, cookie_header, str(out))
                results["ok"] += 1
            except subprocess.CalledProcessError as e:
                print(f"  ffmpeg failed: {e}")
                results["failed"] += 1

        browser.close()

    print(f"\n{'='*50}")
    print(f"Done. Downloaded: {results['ok']}  Failed: {results['failed']}")
    print(f"Files saved to: {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
