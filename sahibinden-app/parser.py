"""
Sahibinden listing page parser.
Extracts structured data from raw HTML.
"""

import re
from datetime import datetime
from bs4 import BeautifulSoup


def parse_listing_page(html: str, url: str) -> dict:
    """Extract structured data from a sahibinden.com listing page."""
    soup = BeautifulSoup(html, "html.parser")
    data = {"url": url, "scraped_at": datetime.now().isoformat()}

    # ── Title ─────────────────────────────────────────────────────────
    title_el = soup.select_one("h1.classifiedDetailTitle")
    if not title_el:
        title_el = soup.select_one("h1")
    data["title"] = title_el.get_text(strip=True) if title_el else None

    # ── Price ─────────────────────────────────────────────────────────
    price_el = soup.select_one("div.classifiedInfo h3")
    if not price_el:
        price_el = soup.select_one(".classified-price-wrapper")
    data["price"] = price_el.get_text(strip=True) if price_el else None

    # ── Location ──────────────────────────────────────────────────────
    loc_el = soup.select_one("div.classifiedInfo h2")
    if not loc_el:
        loc_el = soup.select_one(".classified-location")
    data["location"] = loc_el.get_text(strip=True) if loc_el else None

    # ── Key–value detail table ────────────────────────────────────────
    details = {}
    for row in soup.select("ul.classifiedInfoList li"):
        label_el = row.select_one("strong")
        value_el = row.select_one("span")
        if label_el and value_el:
            key = label_el.get_text(strip=True).rstrip(":")
            val = value_el.get_text(strip=True)
            if key and val:
                details[key] = val
    data["details"] = details

    # ── Description ───────────────────────────────────────────────────
    desc_el = soup.select_one("div#classifiedDescription")
    if not desc_el:
        desc_el = soup.select_one("div.classifiedDescription")
    data["description"] = desc_el.get_text("\n", strip=True) if desc_el else None

    # ── Image URLs ────────────────────────────────────────────────────
    images = []
    for img in soup.select("img.classifiedDetailMainPhoto, div.classifiedDetailPhotos img"):
        src = img.get("data-src") or img.get("src") or ""
        if src and "placeholder" not in src:
            images.append(src)
    for script in soup.select("script"):
        text = script.string or ""
        if "imageUrls" in text or "galleryPhotos" in text:
            urls = re.findall(r'https?://[^\s"\']+\.(?:jpg|jpeg|png|webp)', text)
            images.extend(urls)
    data["images"] = list(dict.fromkeys(images))

    # ── Seller info ───────────────────────────────────────────────────
    seller = {}
    seller_name = soup.select_one("div.username-info-area a, .classified-owner-name")
    if seller_name:
        seller["name"] = seller_name.get_text(strip=True)
    seller_store = soup.select_one("div.store-info a")
    if seller_store:
        seller["store"] = seller_store.get_text(strip=True)
    data["seller"] = seller if seller else None

    # ── Date info ─────────────────────────────────────────────────────
    date_el = soup.select_one("span.classified-date-info")
    data["listing_date"] = date_el.get_text(strip=True) if date_el else None

    # ── Listing ID from URL ───────────────────────────────────────────
    id_match = re.search(r'-(\d{8,})', url)
    data["listing_id"] = id_match.group(1) if id_match else None

    return data
