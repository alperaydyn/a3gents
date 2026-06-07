# Sahibinden Scraper — Web App
cite: https://github.com/berkdemir/sahibinden-scraper
cite: https://claude.ai/chat/1a5e7ce0-146a-496b-903e-1195724ed35f

A self-hosted web application that scrapes sahibinden.com listings with a human-in-the-loop captcha flow. The browser runs server-side and streams its viewport to your browser via WebSocket — you solve captchas from the web UI, then the parser extracts structured data automatically.

## Architecture

```
┌──────────────────────────────────────────────┐
│  Your Browser (any device)                   │
│  ┌────────────────────────────────────────┐  │
│  │  URL Input  │  Browser Stream (canvas) │  │
│  │  Results    │  Click → forwarded       │  │
│  │  Export     │  Scroll → forwarded      │  │
│  └────────────────────────────────────────┘  │
│              ▲ WebSocket ▼                   │
├──────────────────────────────────────────────┤
│  VPS / Docker                                │
│  ┌──────────┐  ┌─────────────┐              │
│  │ FastAPI   │──│  Playwright │              │
│  │ (uvicorn) │  │  (Chromium) │              │
│  └──────────┘  └─────────────┘              │
│       │              │                       │
│  ┌────┴──────────────┴────┐                 │
│  │  Persistent Session    │                 │
│  │  (cookies survive      │                 │
│  │   container restarts)  │                 │
│  └────────────────────────┘                 │
└──────────────────────────────────────────────┘
```

## Quick Start

### Local (no Docker)

```bash
cd sahibinden-app
pip install -r requirements.txt
playwright install chromium
uvicorn app:app --host 0.0.0.0 --port 8000
```

Then open `http://localhost:8000`

### Docker

```bash
cd sahibinden-app
docker compose up -d --build
```

Open `http://your-vps-ip:8000`

## Features

| Feature | Description |
|---------|-------------|
| **Browser streaming** | Server-side Chromium streams JPEG frames at ~3 fps via WebSocket |
| **Click/scroll forwarding** | Interact with the remote browser through the canvas — solve captchas, navigate |
| **Auto captcha detection** | Detects challenge pages and alerts you |
| **Single & batch mode** | Scrape one URL or paste a list |
| **Persistent sessions** | Login cookies survive container restarts (Docker volume) |
| **JSON export** | Download all scraped listings as JSON |
| **Detail view** | Click any result card to see full details + images |

## How It Works

1. Enter a sahibinden.com listing URL and click **Go**
2. The server navigates Chromium to that page
3. The browser viewport streams to your screen as a live image
4. If captcha appears → click/type directly on the browser view to solve it
5. Click **Parse** to extract the listing data
6. Repeat, or use **Batch** mode for multiple URLs

## File Structure

```
sahibinden-app/
├── app.py              # FastAPI backend + WebSocket handler
├── parser.py           # HTML → structured JSON extraction
├── templates/
│   └── index.html      # Full frontend (single-file, no build step)
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── output/             # Saved JSON exports
```

## Extending

- **Database storage**: Replace the in-memory `scraped_results` list with PostgreSQL via SQLAlchemy
- **Authentication**: Add FastAPI middleware for basic auth or API keys
- **Scheduling**: Add a `/api/schedule` endpoint with APScheduler for recurring scrapes
- **Alerts**: Hook into Telegram bot API to notify when new listings match criteria

## Notes

- The browser runs headless on the server — the "window" you see is a screenshot stream
- Keyboard input is forwarded when the canvas area is focused (click on it first)
- Session cookies are stored in a Docker volume, so login persists across restarts
- For production, add a reverse proxy (Caddy/nginx) with HTTPS in front of port 8000
