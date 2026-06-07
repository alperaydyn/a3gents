#!/usr/bin/env python3
"""
Parse all Gartner conference sessions from gartner_all_sessions.html
into a structured CSV/JSON file.

Extracts 16 data points per session based on the template analysis.
"""

import csv
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

from bs4 import BeautifulSoup


def clean_text(text: str) -> str:
    """Normalize whitespace and strip text."""
    if not text:
        return ""
    # Replace &amp; with & and other HTML entities
    text = text.replace("&amp;", "&").replace("&nbsp;", " ")
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_sessions(html_path: str) -> list[dict]:
    """Parse all sessions from the Gartner HTML file."""
    with open(html_path, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")

    sessions = []

    # Find all session wrapper divs (all 3 variants)
    wrapper_selectors = [
        "div.session-wrapper",
        "div.session-wrapper-added",
        "div.session-wrapper-inactive",
    ]

    all_wrappers = []
    for selector in wrapper_selectors:
        all_wrappers.extend(soup.select(selector))

    # Sort by document order (bs4 preserves order within each select)
    # Re-find all at once to maintain document order
    all_wrappers = soup.find_all(
        "div",
        class_=re.compile(
            r"^ng-tns-c\d+-\d+ session-wrapper(?:-added|-inactive)? ng-star-inserted$"
        ),
    )

    print(f"Found {len(all_wrappers)} session wrappers")

    for wrapper in all_wrappers:
        session = extract_session(wrapper)
        if session:
            sessions.append(session)

    print(f"Extracted {len(sessions)} sessions")
    return sessions


def extract_session(wrapper) -> dict | None:
    """Extract all data points from a single session wrapper div."""

    # --- Wrapper-level data ---
    wrapper_id = wrapper.get("id", "")  # e.g. "05/11/2026-4591317"
    wrapper_classes = " ".join(wrapper.get("class", []))

    # Determine wrapper state
    if "session-wrapper-added" in wrapper_classes:
        wrapper_state = "added"
    elif "session-wrapper-inactive" in wrapper_classes:
        wrapper_state = "inactive"
    else:
        wrapper_state = "default"

    # --- Session container ---
    container = wrapper.find("div", class_="session-container")
    if not container:
        return None

    session_id = container.get("id", "")  # e.g. "4591317"

    # --- Title & URL ---
    title_div = container.find("div", class_="title")
    title = ""
    session_url = ""
    if title_div:
        a_tag = title_div.find("a")
        if a_tag:
            title = clean_text(a_tag.get_text())
            session_url = a_tag.get("href", "")

    # --- Speakers ---
    specialists_div = container.find("div", class_="specialists")
    speakers = []
    if specialists_div:
        spans = specialists_div.find_all("span", recursive=False)
        for span in spans:
            # Get the text, removing nested separator spans
            speaker_text = ""
            for child in span.children:
                if isinstance(child, str):
                    speaker_text += child
                elif hasattr(child, "name") and child.name == "span":
                    # This is the ", " separator span — skip it
                    continue
            speaker_name = clean_text(speaker_text)
            if speaker_name:
                speakers.append(speaker_name)
    speakers_str = ", ".join(speakers)

    # --- Time ---
    time_div = container.find("div", class_="gmt-time")
    time_str = ""
    if time_div:
        time_span = time_div.find("span")
        if time_span:
            time_str = clean_text(time_span.get_text())

    # --- Date ---
    date_div = container.find("div", class_="date")
    date_str = ""
    if date_div:
        date_str = clean_text(date_div.get_text())

    # --- Day Group Date (from wrapper id) ---
    day_date = ""
    if wrapper_id and "-" in wrapper_id:
        day_date = wrapper_id.rsplit("-", 1)[0]  # e.g. "05/11/2026"

    # --- Location ---
    location_div = container.find("div", class_="location")
    location = ""
    if location_div:
        location = clean_text(location_div.get_text())

    # --- Viewing Rooms ---
    viewing_rooms_div = container.find("div", class_="viewing-rooms")
    viewing_rooms = ""
    if viewing_rooms_div:
        viewing_rooms = clean_text(viewing_rooms_div.get_text())

    # --- Status Badges ---
    notifications_div = container.find("div", class_="notifications")
    badges = []
    attended = False
    recommended = False
    exclusive = False

    if notifications_div:
        pills = notifications_div.find_all("span", class_="session-pill")
        for pill in pills:
            pill_classes = " ".join(pill.get("class", []))
            pill_text = clean_text(pill.get_text())

            if "change-note-attended" in pill_classes:
                attended = True
                badges.append("Attended")
            elif "recommended-pill" in pill_classes:
                recommended = True
                badges.append("Recommended")
            elif pill_text.lower().strip() == "exclusive":
                exclusive = True
                badges.append("Exclusive")
            else:
                badges.append(pill_text)

    # --- Has Files ---
    files_div = container.find("div", class_="files")
    has_files = files_div is not None

    # --- Has Replay ---
    media_div = container.find("div", class_="media")
    has_replay = False
    if media_div:
        replay_spans = media_div.find_all("span", string=re.compile(r"replay", re.I))
        has_replay = len(replay_spans) > 0

    # --- Has Speaker (from border) ---
    border_div = wrapper.find("div", class_="session-border")
    has_speaker = False
    if border_div:
        border_classes = " ".join(border_div.get("class", []))
        has_speaker = "has-speaker" in border_classes

    # --- Action Icon ---
    action_div = container.find("div", class_="session-action")
    action_icon = ""
    if action_div:
        icon_spans = action_div.find_all("span", class_="material-symbols-outlined")
        for span in icon_spans:
            icon_text = clean_text(span.get_text())
            if icon_text in ("check_circle", "add_circle"):
                action_icon = icon_text
                break

    # Determine if added to agenda
    on_agenda = action_icon == "check_circle" or wrapper_state == "added"

    return {
        "session_id": session_id,
        "composite_id": wrapper_id,
        "title": title,
        "speakers": speakers_str,
        "time": time_str,
        "date": date_str,
        "day_date": day_date,
        "location": location,
        "viewing_rooms": viewing_rooms,
        "attended": attended,
        "recommended": recommended,
        "exclusive": exclusive,
        "badges": "; ".join(badges),
        "has_files": has_files,
        "has_replay": has_replay,
        "has_speaker": has_speaker,
        "on_agenda": on_agenda,
        "wrapper_state": wrapper_state,
        "session_url": session_url,
    }


def write_csv(sessions: list[dict], output_path: str):
    """Write sessions to CSV."""
    if not sessions:
        print("No sessions to write!")
        return

    fieldnames = sessions[0].keys()
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(sessions)

    print(f"CSV written to {output_path}")


def write_json(sessions: list[dict], output_path: str):
    """Write sessions to JSON."""
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(sessions, f, indent=2, ensure_ascii=False)

    print(f"JSON written to {output_path}")


def print_summary(sessions: list[dict]):
    """Print a summary of the parsed data."""
    print("\n" + "=" * 60)
    print("PARSING SUMMARY")
    print("=" * 60)
    print(f"Total sessions: {len(sessions)}")

    # Unique days
    days = set(s["day_date"] for s in sessions if s["day_date"])
    print(f"Conference days: {len(days)} — {sorted(days)}")

    # Wrapper states
    states = {}
    for s in sessions:
        st = s["wrapper_state"]
        states[st] = states.get(st, 0) + 1
    print(f"Wrapper states: {states}")

    # Badges
    attended = sum(1 for s in sessions if s["attended"])
    recommended = sum(1 for s in sessions if s["recommended"])
    exclusive = sum(1 for s in sessions if s["exclusive"])
    print(f"Attended: {attended}, Recommended: {recommended}, Exclusive: {exclusive}")

    # Media
    with_files = sum(1 for s in sessions if s["has_files"])
    with_replay = sum(1 for s in sessions if s["has_replay"])
    print(f"With files: {with_files}, With replay: {with_replay}")

    # On agenda
    on_agenda = sum(1 for s in sessions if s["on_agenda"])
    print(f"On agenda: {on_agenda}")

    # With speakers
    with_speakers = sum(1 for s in sessions if s["speakers"])
    print(f"With speakers: {with_speakers}")

    # Sample
    print("\n--- First 5 sessions ---")
    for s in sessions[:5]:
        print(
            f"  [{s['session_id']}] {s['title'][:60]:<60} | {s['time']:<20} | {s['date']}"
        )

    print("=" * 60)


if __name__ == "__main__":
    html_file = Path(__file__).parent / "gartner_all_sessions.html"
    csv_file = Path(__file__).parent / "gartner_sessions.csv"
    json_file = Path(__file__).parent / "gartner_sessions.json"

    sessions = parse_sessions(str(html_file))
    write_csv(sessions, str(csv_file))
    write_json(sessions, str(json_file))
    print_summary(sessions)
