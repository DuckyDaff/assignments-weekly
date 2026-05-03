"""
add_machlakati.py
-----------------
מוסיף מדור "מחלקתי" לתוכנית השנתית ולנתוני השיבוצים השבועיים,
ומעביר אליו את:
  - איציק אפרמשווילי
  - אבי שמואלי
  - מוטי חלפון

Usage:
  python scripts/add_machlakati.py              # dry run
  python scripts/add_machlakati.py --upload     # production
  python scripts/add_machlakati.py --url http://localhost:5173 --upload
"""

import sys, json, argparse
import urllib.request, urllib.error

NEW_SECTION = "מחלקתי"
MOVE_PEOPLE = ["איציק אפרמשווילי", "אבי שמואלי", "מוטי חלפון"]


def fetch_json(url):
    with urllib.request.urlopen(url, timeout=20) as r:
        return json.loads(r.read().decode())


def put_json(url, data):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req  = urllib.request.Request(url, data=body, method="PUT",
                                  headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode()


def patch_json(url, data):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req  = urllib.request.Request(url, data=body, method="PATCH",
                                  headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode()


def update_sections(sections):
    """Move MOVE_PEOPLE from their current sections to NEW_SECTION."""
    # Remove from all existing sections
    new_sections = []
    for sec in sections:
        people = [p for p in sec["people"] if p not in MOVE_PEOPLE]
        new_sections.append({**sec, "people": people})

    # Add/update target section
    target = next((s for s in new_sections if s["name"] == NEW_SECTION), None)
    if target:
        target["people"] = list(dict.fromkeys(target["people"] + MOVE_PEOPLE))
    else:
        new_sections.append({"name": NEW_SECTION, "people": MOVE_PEOPLE[:]})

    return new_sections


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url",    default="https://assignments-weekly.vercel.app")
    parser.add_argument("--upload", action="store_true")
    args = parser.parse_args()

    base = args.url.rstrip("/")

    # ── Annual plan ────────────────────────────────────────────────
    print("Fetching annual plan...")
    annual = fetch_json(f"{base}/api/annual")
    annual["sections"] = update_sections(annual.get("sections", []))

    print("Annual sections after update:")
    for sec in annual["sections"]:
        print(f"  {sec['name']}: {sec['people']}")

    # ── Weekly assignments data ───────────────────────────────────
    print("\nFetching weekly data...")
    weekly = fetch_json(f"{base}/api/data")
    weekly["sections"] = update_sections(weekly.get("sections", []))

    print("Weekly sections after update:")
    for sec in weekly["sections"]:
        print(f"  {sec['name']}: {sec['people']}")

    if not args.upload:
        print("\n(dry run — add --upload to apply)")
        return

    # ── Upload ────────────────────────────────────────────────────
    print("\nUpdating annual plan (PUT full plan)...")
    r = put_json(f"{base}/api/annual", annual)
    print(f"  OK {r}")

    print("Updating weekly assignments (PUT)...")
    r = put_json(f"{base}/api/data", weekly)
    print(f"  OK {r}")

    print("\nDone.")


if __name__ == "__main__":
    main()
