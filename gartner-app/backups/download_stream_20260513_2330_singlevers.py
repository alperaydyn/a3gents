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
    pip install playwright python-dotenv tqdm
    playwright install chrome
    brew install ffmpeg
"""

import argparse
import csv
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm

# ─── Config ───────────────────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env")

USER_ID  = os.environ.get("GARTNER_USER_ID", "")
PASSWORD = os.environ.get("GARTNER_PASSWORD", "")

BASE_DIR    = Path(__file__).parent
CSV_PATH    = BASE_DIR / "gartner_sessions.csv"
OUTPUT_DIR  = BASE_DIR / "session_details"
CONF_CODE   = "BIE27I"
SIGNIN_URL  = "https://www.gartner.com/account/signin"
STREAM_BASE = f"https://cn.gartner.com/stream/{CONF_CODE}"


# ─── Logging (tqdm-safe) ──────────────────────────────────────────────────────
def log(msg: str):
    """Print a line without corrupting active tqdm bars."""
    tqdm.write(msg)


# ─── Debug helper ─────────────────────────────────────────────────────────────
def _screenshot(page, name: str):
    path = str(BASE_DIR / f"debug_{name}.png")
    page.screenshot(path=path)
    log(f"  [screenshot] {path}")


# ─── OneTrust helper ──────────────────────────────────────────────────────────
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


# ─── Login ────────────────────────────────────────────────────────────────────
def do_login(page, user_id: str, password: str, PWTimeout):
    target = f"{SIGNIN_URL}?targetUrl=https%3A%2F%2Fcn.gartner.com%2F"
    log(f"  Navigating to sign-in page...")
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


# ─── Stream interception ──────────────────────────────────────────────────────
def find_stream_url(page, stream_page_url: str, PWTimeout, status_bar: tqdm) -> str:
    captured = []

    def on_request(request):
        url = request.url
        if re.search(r"\.(m3u8|mpd|mp4)(\?|$)", url, re.IGNORECASE):
            captured.append(url)

    page.on("request", on_request)

    status_bar.set_postfix_str("loading page")
    page.goto(stream_page_url, wait_until="domcontentloaded", timeout=30_000)
    time.sleep(3)

    play_selectors = [
        "button.vjs-big-play-button",
        "button[aria-label='Play']",
        "button[title='Play']",
        ".play-button",
        "[class*='play']",
        "video",
    ]
    status_bar.set_postfix_str("clicking play")
    for sel in play_selectors:
        el = page.query_selector(sel)
        if el:
            page.evaluate("el => el.click()", el)
            break

    status_bar.set_postfix_str("waiting for stream URL")
    deadline = time.time() + 30
    while time.time() < deadline:
        if captured:
            break
        time.sleep(0.5)

    for pattern in [r"\.m3u8", r"\.mpd", r"\.mp4"]:
        for url in captured:
            if re.search(pattern, url, re.IGNORECASE):
                return url

    return captured[0] if captured else ""


# ─── Cookie export ────────────────────────────────────────────────────────────
def cookies_to_header(cookies: list[dict]) -> str:
    return "; ".join(f"{c['name']}={c['value']}" for c in cookies)


# ─── HLS quality selection ────────────────────────────────────────────────────
def resolve_best_variant(master_url: str, cookie_header: str) -> str:
    """
    If master_url is an HLS master playlist, parse it and return the URL of
    the highest-bandwidth (best quality) variant stream. If it is already a
    media playlist (no #EXT-X-STREAM-INF), return it unchanged.
    """
    try:
        req = urllib.request.Request(
            master_url,
            headers={
                "Cookie": cookie_header,
                "Referer": "https://cn.gartner.com/",
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/131.0.0.0 Safari/537.36"
                ),
            },
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            text = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        log(f"  [hls] Could not fetch master playlist: {e}")
        return master_url

    if "#EXT-X-STREAM-INF" not in text:
        return master_url  # already a media playlist

    # Parse variants: collect (bandwidth, resolution, uri) tuples
    variants = []
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("#EXT-X-STREAM-INF"):
            bandwidth   = int(re.search(r"BANDWIDTH=(\d+)", line).group(1)
                              if re.search(r"BANDWIDTH=(\d+)", line) else 0)
            resolution  = re.search(r"RESOLUTION=(\d+x\d+)", line)
            resolution  = resolution.group(1) if resolution else ""
            uri_line    = lines[i + 1].strip() if i + 1 < len(lines) else ""
            if uri_line and not uri_line.startswith("#"):
                variants.append((bandwidth, resolution, uri_line))

    if not variants:
        return master_url

    # Pick the highest bandwidth variant
    best = max(variants, key=lambda v: v[0])
    best_bw, best_res, best_uri = best

    log(f"  [hls] variants found: {[v[1] for v in variants]}")
    log(f"  [hls] selected: {best_res} @ {best_bw//1000} kbps")

    # Resolve relative URLs against the master playlist URL
    best_url = urllib.parse.urljoin(master_url, best_uri)
    return best_url


# ─── ffmpeg helpers ───────────────────────────────────────────────────────────
def get_stream_duration(stream_url: str, cookie_header: str) -> float | None:
    """Use ffprobe to get the total duration of the stream in seconds."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-headers", f"Cookie: {cookie_header}\r\nReferer: https://cn.gartner.com/\r\n",
                stream_url,
            ],
            capture_output=True, text=True, timeout=30,
        )
        data = json.loads(result.stdout)
        return float(data["format"]["duration"])
    except Exception:
        return None


def download_with_ffmpeg(stream_url: str, cookie_header: str, output: str,
                         session_bar: tqdm):
    """
    Download an HLS/DASH stream with ffmpeg, showing a tqdm progress bar.
    Uses -progress pipe:1 to parse out_time_ms for accurate % completion.
    """
    duration = get_stream_duration(stream_url, cookie_header)

    cmd = [
        "ffmpeg", "-y",
        "-headers", f"Cookie: {cookie_header}\r\nReferer: https://cn.gartner.com/\r\n",
        "-i", stream_url,
        "-c", "copy",
        "-progress", "pipe:1",
        "-nostats",
        output,
    ]

    bar_fmt = "{desc}: {percentage:3.0f}%|{bar}| {elapsed}<{remaining}"
    desc = Path(output).name

    with tqdm(total=100, desc=f"  {desc}", unit="%",
              bar_format=bar_fmt, leave=True) as dl_bar:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        last_pct = 0.0
        for line in proc.stdout:
            line = line.strip()
            if line.startswith("out_time_ms=") and duration:
                try:
                    ms = int(line.split("=", 1)[1])
                    pct = min(100.0, (ms / 1_000_000) / duration * 100)
                    dl_bar.update(pct - last_pct)
                    last_pct = pct
                except ValueError:
                    pass
            elif line == "progress=end":
                dl_bar.update(100.0 - last_pct)
                last_pct = 100.0

        proc.wait()

        # If we never got duration, jump bar to 100 on success
        if proc.returncode == 0 and last_pct < 100:
            dl_bar.update(100.0 - last_pct)

    if proc.returncode != 0:
        raise subprocess.CalledProcessError(proc.returncode, cmd)

    session_bar.set_postfix_str("done")


# ─── CSV helpers ──────────────────────────────────────────────────────────────
def load_replay_sessions(csv_path: Path, top_n: int = 0) -> list[dict]:
    sessions = []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("has_replay", "").strip().lower() == "true":
                sessions.append(row)
    return sessions[:top_n] if top_n else sessions


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

    sessions = load_replay_sessions(CSV_PATH, top_n=args.top_n)
    pending  = [s for s in sessions if not already_downloaded(s["session_id"])]

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

    print(f"\nLogging in as: {USER_ID}")

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
        do_login(page, USER_ID, PASSWORD, PWTimeout)

        results = {"ok": 0, "failed": 0}

        # Outer bar — one step per session
        session_bar = tqdm(
            total=len(pending),
            desc="Sessions",
            unit="session",
            bar_format="{desc}: {n}/{total}|{bar}| {percentage:3.0f}% [{elapsed}<{remaining}]",
        )

        for session in pending:
            sid   = session["session_id"]
            title = session.get("title", "")[:50]
            out   = OUTPUT_DIR / f"{sid}_stream.mp4"

            session_bar.set_description(f"{sid}")
            session_bar.set_postfix_str(title)

            stream_url = find_stream_url(
                page, f"{STREAM_BASE}/{sid}", PWTimeout, session_bar
            )

            if not stream_url:
                log(f"  [{sid}] FAILED — no video URL captured")
                (BASE_DIR / f"debug_{sid}_page.html").write_text(
                    page.content(), encoding="utf-8"
                )
                results["failed"] += 1
                session_bar.update(1)
                continue

            cookies = context.cookies()
            cookie_header = cookies_to_header(cookies)

            # Resolve master playlist → best quality variant (1080p)
            session_bar.set_postfix_str("resolving quality")
            stream_url = resolve_best_variant(stream_url, cookie_header)

            session_bar.set_postfix_str("downloading")
            try:
                download_with_ffmpeg(stream_url, cookie_header, str(out), session_bar)
                results["ok"] += 1
            except subprocess.CalledProcessError as e:
                log(f"  [{sid}] ffmpeg error: {e}")
                results["failed"] += 1

            session_bar.update(1)

        session_bar.close()
        browser.close()

    print(f"\nDone.  Downloaded: {results['ok']}  Failed: {results['failed']}")
    print(f"Files saved to: {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
