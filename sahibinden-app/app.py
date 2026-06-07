"""
Sahibinden Web Scraper — Web Application
=========================================
FastAPI backend that runs a Playwright browser, streams its view
to the frontend via WebSocket, and forwards user interactions
(clicks, typing) so the user can solve captchas from the browser.
"""

import asyncio
import json
import base64
import re
import os
from datetime import datetime
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from playwright.async_api import async_playwright, Browser, BrowserContext, Page

from parser import parse_listing_page


# ── Config ────────────────────────────────────────────────────────────
SESSION_DIR = Path(os.getenv("SESSION_DIR", "/tmp/sahibinden_session"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "./output"))
OUTPUT_DIR.mkdir(exist_ok=True)
SESSION_DIR.mkdir(parents=True, exist_ok=True)

VIEWPORT = {"width": 1280, "height": 900}

# ── Proxy config (set via env vars or .env file) ─────────────────────
PROXY_SERVER = os.getenv("PROXY_SERVER", "")       # e.g. http://gate.smartproxy.com:7000
PROXY_USERNAME = os.getenv("PROXY_USERNAME", "")
PROXY_PASSWORD = os.getenv("PROXY_PASSWORD", "")

def get_proxy_config() -> dict | None:
    """Build Playwright proxy dict from env vars. Returns None if no proxy configured."""
    if not PROXY_SERVER:
        return None
    config = {"server": PROXY_SERVER}
    if PROXY_USERNAME:
        config["username"] = PROXY_USERNAME
    if PROXY_PASSWORD:
        config["password"] = PROXY_PASSWORD
    print(f"🌐 Proxy configured: {PROXY_SERVER} (user: {PROXY_USERNAME or 'none'})")
    return config

# ── Global state ──────────────────────────────────────────────────────
playwright_instance = None
browser_context: BrowserContext | None = None
active_page: Page | None = None
scraped_results: list[dict] = []


# ── Lifespan ──────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global playwright_instance, browser_context
    playwright_instance = await async_playwright().start()

    # Build launch options
    proxy_config = get_proxy_config()
    launch_opts = dict(
        user_data_dir=str(SESSION_DIR),
        headless=True,
        viewport=VIEWPORT,
        locale="tr-TR",
        timezone_id="Europe/Istanbul",
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        args=[
            "--disable-blink-features=AutomationControlled",
            "--disable-features=IsolateOrigins,site-per-process",
            "--disable-dev-shm-usage",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-infobars",
            "--window-size=1280,900",
            "--start-maximized",
        ],
        ignore_default_args=["--enable-automation"],
        color_scheme="light",
    )
    if proxy_config:
        launch_opts["proxy"] = proxy_config

    browser_context = await playwright_instance.chromium.launch_persistent_context(**launch_opts)
    # Comprehensive stealth script
    await browser_context.add_init_script("""
        // Remove webdriver flag
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

        // Fake plugins (headless Chrome has none)
        Object.defineProperty(navigator, 'plugins', {
            get: () => [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                { name: 'Native Client', filename: 'internal-nacl-plugin' },
            ],
        });

        // Fake languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['tr-TR', 'tr', 'en-US', 'en'],
        });

        // Fix chrome object
        window.chrome = {
            runtime: { onMessage: { addListener: () => {} }, sendMessage: () => {} },
            loadTimes: () => ({}),
            csi: () => ({}),
        };

        // Fix permissions query
        const originalQuery = window.navigator.permissions?.query;
        if (originalQuery) {
            window.navigator.permissions.query = (parameters) =>
                parameters.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(parameters);
        }

        // Prevent iframe detection
        Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
            get: function() { return window; },
        });
    """)
    print("✅ Browser context ready")
    yield
    await browser_context.close()
    await playwright_instance.stop()
    print("🛑 Browser closed")


app = FastAPI(title="Sahibinden Scraper", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# ── Routes ────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/results")
async def get_results():
    return JSONResponse(scraped_results)


@app.get("/api/status")
async def get_status():
    """Show proxy config and current outbound IP."""
    return JSONResponse({
        "proxy_configured": bool(PROXY_SERVER),
        "proxy_server": PROXY_SERVER or None,
        "proxy_user": PROXY_USERNAME or None,
        "session_dir": str(SESSION_DIR),
        "results_count": len(scraped_results),
    })


@app.get("/api/results/download")
async def download_results():
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = OUTPUT_DIR / f"listings_{ts}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(scraped_results, f, ensure_ascii=False, indent=2)
    return FileResponse(path, filename=path.name, media_type="application/json")


@app.post("/api/results/clear")
async def clear_results():
    scraped_results.clear()
    return {"status": "cleared"}


# ── WebSocket: Browser streaming + interaction ────────────────────────

@app.websocket("/ws/browser")
async def browser_ws(ws: WebSocket):
    global active_page
    await ws.accept()

    page = await browser_context.new_page()
    active_page = page

    streaming = False
    stream_task = None

    async def stream_screenshots():
        """Continuously send screenshots to the client."""
        try:
            while True:
                try:
                    screenshot = await page.screenshot(type="jpeg", quality=65)
                    b64 = base64.b64encode(screenshot).decode()
                    await ws.send_json({
                        "type": "screenshot",
                        "data": b64,
                        "url": page.url,
                    })
                except Exception:
                    pass
                await asyncio.sleep(0.3)  # ~3 fps
        except asyncio.CancelledError:
            pass

    try:
        while True:
            msg = await ws.receive_json()
            action = msg.get("action")

            # ── Navigate to URL ───────────────────────────────────────
            if action == "navigate":
                url = msg["url"]
                await ws.send_json({"type": "status", "message": f"Navigating to {url}..."})

                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                except Exception as e:
                    await ws.send_json({"type": "status", "message": f"Navigation note: {str(e)[:100]}"})

                await asyncio.sleep(1)

                # Start streaming if not already
                if not streaming:
                    streaming = True
                    stream_task = asyncio.create_task(stream_screenshots())

                # Check for protection
                content = await page.content()
                blocked_keywords = [
                    "captcha", "robot", "doğrulama", "güvenlik",
                    "challenge", "cf-browser-verification",
                    "just a moment", "checking your browser"
                ]
                is_blocked = any(kw in content.lower() for kw in blocked_keywords)

                if is_blocked:
                    await ws.send_json({
                        "type": "captcha_detected",
                        "message": "Protection detected — please solve it in the browser view below."
                    })
                else:
                    await ws.send_json({
                        "type": "status",
                        "message": "Page loaded. You can parse now or interact with the page."
                    })

            # ── Mouse click ───────────────────────────────────────────
            elif action == "click":
                x = msg["x"]
                y = msg["y"]
                await page.mouse.click(x, y)

            # ── Mouse down (for press-and-hold) ──────────────────────
            elif action == "mousedown":
                x = msg["x"]
                y = msg["y"]
                await page.mouse.move(x, y)
                await page.mouse.down()

            # ── Mouse up (release press-and-hold) ────────────────────
            elif action == "mouseup":
                x = msg["x"]
                y = msg["y"]
                await page.mouse.up()

            # ── Mouse move ────────────────────────────────────────────
            elif action == "mousemove":
                x = msg["x"]
                y = msg["y"]
                await page.mouse.move(x, y)

            # ── Keyboard input ────────────────────────────────────────
            elif action == "type":
                text = msg.get("text", "")
                await page.keyboard.type(text)

            elif action == "keypress":
                key = msg.get("key", "")
                await page.keyboard.press(key)

            # ── Scroll ────────────────────────────────────────────────
            elif action == "scroll":
                delta_y = msg.get("deltaY", 0)
                x = msg.get("x", VIEWPORT["width"] // 2)
                y = msg.get("y", VIEWPORT["height"] // 2)
                await page.mouse.wheel(0, delta_y)

            # ── Parse current page ────────────────────────────────────
            elif action == "parse":
                await ws.send_json({"type": "status", "message": "Parsing page..."})
                content = await page.content()
                url = page.url
                listing = parse_listing_page(content, url)
                scraped_results.append(listing)
                await ws.send_json({
                    "type": "parsed",
                    "data": listing,
                    "total": len(scraped_results),
                })

            # ── Batch: navigate + auto-parse multiple URLs ────────────
            elif action == "batch":
                urls = msg.get("urls", [])
                for i, url in enumerate(urls):
                    await ws.send_json({
                        "type": "status",
                        "message": f"[{i+1}/{len(urls)}] Loading {url}"
                    })
                    try:
                        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    except Exception:
                        pass
                    await asyncio.sleep(2)

                    content = await page.content()
                    blocked_keywords = [
                        "captcha", "robot", "doğrulama", "güvenlik",
                        "challenge", "cf-browser-verification",
                        "just a moment", "checking your browser"
                    ]
                    is_blocked = any(kw in content.lower() for kw in blocked_keywords)

                    if is_blocked:
                        await ws.send_json({
                            "type": "captcha_detected",
                            "message": f"Captcha on [{i+1}/{len(urls)}] — solve it, then click 'Continue Batch'."
                        })
                        # Wait for "continue_batch" signal
                        while True:
                            resume_msg = await ws.receive_json()
                            if resume_msg.get("action") == "continue_batch":
                                break
                            elif resume_msg.get("action") == "click":
                                await page.mouse.click(resume_msg["x"], resume_msg["y"])
                            elif resume_msg.get("action") == "type":
                                await page.keyboard.type(resume_msg.get("text", ""))
                            elif resume_msg.get("action") == "keypress":
                                await page.keyboard.press(resume_msg.get("key", ""))
                            elif resume_msg.get("action") == "scroll":
                                await page.mouse.wheel(0, resume_msg.get("deltaY", 0))
                        content = await page.content()

                    listing = parse_listing_page(content, url)
                    scraped_results.append(listing)
                    await ws.send_json({
                        "type": "parsed",
                        "data": listing,
                        "total": len(scraped_results),
                    })
                    await asyncio.sleep(1.5)

                await ws.send_json({
                    "type": "batch_complete",
                    "message": f"Batch complete — {len(urls)} listings scraped.",
                    "total": len(scraped_results),
                })

    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        if stream_task:
            stream_task.cancel()
        await page.close()
        active_page = None