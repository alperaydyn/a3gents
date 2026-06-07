#!/usr/bin/env python3
"""
Fetch session detail (description) and download documents for a Gartner conference session.

Usage:
    python fetch_session_detail.py <session_id>
    python fetch_session_detail.py 4458203
"""

import json
import os
import re
import sys
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# Load .env from the same directory as the script
load_dotenv(Path(__file__).parent / ".env")

# Conference ID from the URL pattern
CONFERENCE_ID = "13225"
BASE_URL = "https://cn.gartner.com/BIE27I/sessiondetails"
API_BASE = "https://api.ct.aws.gartner.com/ConfAggService/agenda"

BEARER_TOKEN = os.environ.get("GARTNER_BEARER_TOKEN", "")
print(BEARER_TOKEN[:-5])

def get_session_detail_page(session_id: str) -> str:
    """Fetch the session detail page HTML."""
    url = f"{BASE_URL}/{session_id}"
    print(f"Fetching session detail page: {url}")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.text


def parse_session_description(html: str) -> dict:
    """Parse session description from the detail page HTML."""
    soup = BeautifulSoup(html, "html.parser")
    
    detail = {}
    
    # Get session description from div.session-detail-left
    detail_left = soup.find("div", class_="session-detail-left")
    if detail_left:
        detail["description_html"] = str(detail_left)
        detail["description_text"] = detail_left.get_text(separator="\n", strip=True)
    else:
        detail["description_html"] = ""
        detail["description_text"] = "(No description found in HTML - page may be JS-rendered)"
    
    # Look for download-icon divs
    download_divs = soup.find_all("div", class_="download-icon")
    detail["download_icons_found"] = len(download_divs)
    
    return detail


def get_appointment_media(session_id: str, bearer_token: str) -> dict:
    """
    Call the GetAppointmentMedia API to get document/media info.
    
    Endpoint: /ConfAggService/agenda/GetAppointmentMedia/{conference_id}/{session_id}
    """
    url = f"{API_BASE}/GetAppointmentMedia/{CONFERENCE_ID}/{session_id}"
    print(f"Fetching media info from API: {url}")
    
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Authorization": f"Bearer {bearer_token}",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    }
    
    params = {
        "LanguageCode": "en",
    }
    
    resp = requests.get(url, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def get_session_detail_api(session_id: str, bearer_token: str) -> dict:
    """
    Try to fetch session details from the API directly.
    The site is an Angular SPA, so session detail is likely fetched via API.
    """
    # Try the appointment detail endpoint
    url = f"{API_BASE}/GetAppointmentDetail/{CONFERENCE_ID}/{session_id}"
    print(f"Fetching session detail from API: {url}")
    
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Authorization": f"Bearer {bearer_token}",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    }
    
    params = {
        "LanguageCode": "en",
    }
    
    resp = requests.get(url, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def download_document(asset_url: str, filename: str, output_dir: Path, bearer_token: str):
    """Download a document/asset."""
    print(f"Downloading: {filename} from {asset_url}")
    
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    }
    
    resp = requests.get(asset_url, headers=headers, timeout=60, stream=True)
    resp.raise_for_status()
    
    output_path = output_dir / filename
    with open(output_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
    
    print(f"  Saved to: {output_path} ({output_path.stat().st_size} bytes)")
    return output_path


def main():
    if len(sys.argv) < 2:
        print("Usage: python fetch_session_detail.py <session_id>")
        sys.exit(1)
    
    session_id = sys.argv[1]
    bearer_token = BEARER_TOKEN
    
    if not bearer_token:
        print("ERROR: Set GARTNER_BEARER_TOKEN environment variable")
        print("  export GARTNER_BEARER_TOKEN='eyJhbG...'")
        sys.exit(1)
    
    output_dir = Path(__file__).parent / "session_details"
    output_dir.mkdir(exist_ok=True)
    
    # Step 1: Try to get session detail from API
    print("\n" + "=" * 60)
    print(f"FETCHING SESSION DETAIL: {session_id}")
    print("=" * 60)
    
    try:
        detail = get_session_detail_api(session_id, bearer_token)
        detail_path = output_dir / f"{session_id}_detail.json"
        with open(detail_path, "w", encoding="utf-8") as f:
            json.dump(detail, f, indent=2, ensure_ascii=False)
        print(f"\nSession detail saved to: {detail_path}")
        
        # Print key info
        if isinstance(detail, dict):
            print(f"\nTitle: {detail.get('Title', detail.get('title', 'N/A'))}")
            desc = detail.get('Description', detail.get('description', ''))
            if desc:
                # Strip HTML tags for display
                clean_desc = BeautifulSoup(desc, "html.parser").get_text(separator="\n", strip=True)
                print(f"\nDescription:\n{clean_desc[:2000]}")
    except requests.exceptions.HTTPError as e:
        print(f"API detail request failed: {e}")
        print("Trying to scrape from the HTML page instead...")
    except Exception as e:
        print(f"Error fetching detail: {e}")
    
    # Step 2: Get media/documents
    print("\n" + "-" * 60)
    print("FETCHING DOCUMENTS")
    print("-" * 60)
    
    try:
        media = get_appointment_media(session_id, bearer_token)
        media_path = output_dir / f"{session_id}_media.json"
        with open(media_path, "w", encoding="utf-8") as f:
            json.dump(media, f, indent=2, ensure_ascii=False)
        print(f"\nMedia info saved to: {media_path}")
        print(f"Media response:\n{json.dumps(media, indent=2)[:3000]}")
        
        # Try to find downloadable assets in the response
        docs = []
        if isinstance(media, list):
            docs = media
        elif isinstance(media, dict):
            docs = media.get("Documents", media.get("documents", media.get("Assets", media.get("assets", []))))
            if not docs and media:
                # The response might be the asset info directly
                docs = [media]
        
        for doc in docs:
            if isinstance(doc, dict):
                # Try various key patterns for download URL
                download_url = (
                    doc.get("AssetLink") or doc.get("assetLink") or
                    doc.get("DownloadUrl") or doc.get("downloadUrl") or 
                    doc.get("Url") or doc.get("url") or
                    doc.get("AssetUrl") or doc.get("assetUrl") or
                    doc.get("FileUrl") or doc.get("fileUrl") or ""
                )
                filename = (
                    doc.get("AssetName") or doc.get("assetName") or
                    doc.get("FileName") or doc.get("fileName") or 
                    doc.get("Name") or doc.get("name") or 
                    doc.get("Title") or doc.get("title") or
                    f"document_{doc.get('AssetId', doc.get('assetId', 'unknown'))}"
                )
                
                if download_url:
                    # Ensure filename has extension
                    if "." not in filename:
                        ext = doc.get("FileExtension", doc.get("fileExtension", ".pdf"))
                        if not ext.startswith("."):
                            ext = f".{ext}"
                        filename += ext
                    
                    download_document(download_url, filename, output_dir, bearer_token)
                else:
                    print(f"  No download URL found for: {json.dumps(doc, indent=2)[:500]}")
    except requests.exceptions.HTTPError as e:
        print(f"Media request failed: {e}")
    except Exception as e:
        print(f"Error fetching media: {e}")


if __name__ == "__main__":
    main()
