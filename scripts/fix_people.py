"""
fix_people.py
-------------
1. מוחק את "אהרון" מכל המדורים ומכל סטטוסי הימים
2. מעביר את "שמוליק" מהמדור הנוכחי שלו אל "מדור תאורת מסלולים"

Usage:
  python scripts/fix_people.py              # dry run (מציג מה ישתנה)
  python scripts/fix_people.py --upload     # מבצע שינויים ב-production
  python scripts/fix_people.py --url http://localhost:5173 --upload
"""

import sys, json, argparse
import urllib.request, urllib.error

TARGET_SECTION = "מדור תאורת מסלולים"
DELETE_PERSON  = "אהרון שוחמי"
MOVE_PERSON    = "שמוליק פוגל"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="https://assignments-weekly.vercel.app")
    parser.add_argument("--upload", action="store_true")
    args = parser.parse_args()

    api = f"{args.url.rstrip('/')}/api/annual"

    # ── 1. GET current plan ────────────────────────────────────────
    print(f"Fetching {api} ...")
    try:
        with urllib.request.urlopen(api, timeout=20) as resp:
            plan = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode()}")

    sections = plan.get("sections", [])
    days     = plan.get("days", {})

    # ── 2. Fix sections list ───────────────────────────────────────
    shmulik_found_in = None
    new_sections = []
    for sec in sections:
        people = sec.get("people", [])

        # Find & remove אהרון
        if DELETE_PERSON in people:
            print(f"  [sections] מוחק '{DELETE_PERSON}' מ'{sec['name']}'")
            people = [p for p in people if p != DELETE_PERSON]

        # Find שמוליק (before possibly removing from here)
        if MOVE_PERSON in people and sec["name"] != TARGET_SECTION:
            shmulik_found_in = sec["name"]
            print(f"  [sections] מוציא '{MOVE_PERSON}' מ'{sec['name']}'")
            people = [p for p in people if p != MOVE_PERSON]

        new_sections.append({**sec, "people": people})

    # Add שמוליק to target section
    for sec in new_sections:
        if sec["name"] == TARGET_SECTION:
            if MOVE_PERSON not in sec["people"]:
                sec["people"].append(MOVE_PERSON)
                print(f"  [sections] מוסיף '{MOVE_PERSON}' ל'{TARGET_SECTION}'")
            break
    else:
        print(f"  [WARNING] לא נמצא מדור '{TARGET_SECTION}' — לא הועבר שמוליק")

    # ── 3. Fix daily statuses ──────────────────────────────────────
    deleted_days = 0
    for iso, day in days.items():
        statuses = day.get("statuses", {})
        if DELETE_PERSON in statuses:
            del statuses[DELETE_PERSON]
            deleted_days += 1

    print(f"  [days] מחק סטטוסים של '{DELETE_PERSON}' ב-{deleted_days} ימים")

    plan["sections"] = new_sections

    # ── 4. Summary ────────────────────────────────────────────────
    for sec in new_sections:
        print(f"  מדור '{sec['name']}': {sec['people']}")

    if not args.upload:
        print("\n(dry run — הוסף --upload לביצוע)")
        return

    # ── 5. PUT updated plan ────────────────────────────────────────
    json_bytes = json.dumps(plan, ensure_ascii=False).encode("utf-8")
    print(f"\nUploading ({len(json_bytes):,} bytes) ...")
    req = urllib.request.Request(
        api,
        data=json_bytes,
        method="PUT",
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"OK {resp.read().decode()}")
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode()}")


if __name__ == "__main__":
    main()
