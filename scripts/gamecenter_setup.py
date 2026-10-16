"""Creates the game's Game Center achievements and leaderboards in App Store Connect.

Run by the "Game Center setup" workflow. Safe to run again: anything that already
exists (matched by its ID) is left alone, and missing pieces are filled in.
Needs: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, APP_ID.
"""
import json, os, sys, time, urllib.request, urllib.error
import jwt  # PyJWT

API = "https://api.appstoreconnect.apple.com"
HERE = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(HERE, "..", "store", "gamecenter")

ACHIEVEMENTS = [
    # id, title, how to earn (shown before), earned text, points
    ("first", "First day on the job", "Finish any shift.", "You finished your first shift.", 10),
    ("week", "Week one done", "Pass a Friday.", "You made it through a whole week.", 50),
    ("month", "Librarian of the Month", "Finish a shift at 85 or higher.", "You finished a shift rated 85 or higher.", 50),
    ("silent", "Silent library", "Finish a shift with no noise complaints.", "Not a single noise complaint all shift.", 30),
    ("speedy", "Speed stamp", "Earn 10 quick-service tips in one shift.", "Ten quick-service tips in one shift.", 30),
    ("goals", "Goal getter", "Complete both daily goals in one shift.", "Both daily goals done in one shift.", 20),
    ("bookworm", "Bookworm", "Shelve 100 books in total.", "You have shelved 100 books.", 40),
    ("detective", "Reference detective", "Answer 20 reference questions in total.", "You answered 20 reference questions.", 40),
    ("finders", "Finders keepers", "Return 5 lost items to their owners.", "Five lost items back with their owners.", 30),
    ("kind", "Soft touch", "Waive 5 overdue fees.", "You waived five overdue fees.", 20),
    ("order", "Dewey devotee", "Sort 10 shelves perfectly.", "Ten shelves in perfect call-number order.", 50),
    ("theo", "Study buddy", "Help Theo pass his exam.", "Theo passed his exam thanks to you.", 30),
    ("ava", "Fan art", "Serve Ava every day of a week.", "Ava drew you a picture of the library.", 30),
    ("cookies", "Cookie jar", "Earn Mrs. Kowalski's cookies.", "Mrs. Kowalski brought you cookies.", 30),
    ("story", "Once upon a time", "Read at story time.", "You read to the kids at story time.", 20),
    ("night", "Night owl", "Find the stray patron at lock-up.", "You found Mr. Brooks asleep in the stacks.", 40),
    ("cozy", "Home sweet library", "Own every decoration.", "Every decoration is in the library.", 50),
    ("tycoon", "Fully funded", "Buy every upgrade and expansion.", "Every upgrade and expansion is yours.", 100),
]

LEADERBOARDS = [
    # vendor id, reference name, display name, submission type, suffix, singular suffix, range
    ("qp.lb.bestrating", "Best Shift Rating", "Best Shift Rating", "BEST_SCORE", " rating", " rating", (0, 100)),
    ("qp.lb.booksshelved", "Books Shelved", "Books Shelved", "MOST_RECENT_SCORE", " books", " book", (0, 10000000)),
]


def token():
    with open(os.environ["ASC_KEY_PATH"]) as f:
        key = f.read()
    now = int(time.time())
    return jwt.encode({"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 1100, "aud": "appstoreconnect-v1"},
                      key, algorithm="ES256", headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"})


TOKEN = None


def call(method, path, body=None, raw=None, headers=None, absolute=False):
    url = path if absolute else API + path
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {} if absolute else {"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode() or "{}"
            return json.loads(txt) if txt.strip().startswith("{") else {}
    except urllib.error.HTTPError as e:
        msg = e.read().decode()
        print(f"::error::{method} {path} -> {e.code}: {msg[:1500]}")
        raise


def get_all(path):
    out, url = [], API + path
    while url:
        req = urllib.request.Request(url, headers={"Authorization": "Bearer " + TOKEN})
        with urllib.request.urlopen(req) as r:
            page = json.loads(r.read().decode())
        out += page.get("data", [])
        url = (page.get("links") or {}).get("next")
    return out


def upload_image(kind, loc_id, file_path):
    size = os.path.getsize(file_path)
    rel = {"achievement": ("gameCenterAchievementImages", "gameCenterAchievementLocalization", "gameCenterAchievementLocalizations")}[kind]
    res = call("POST", "/v1/" + rel[0], {"data": {"type": rel[0], "attributes": {"fileName": os.path.basename(file_path), "fileSize": size},
                                                  "relationships": {rel[1]: {"data": {"type": rel[2], "id": loc_id}}}}})
    img_id = res["data"]["id"]
    with open(file_path, "rb") as f:
        blob = f.read()
    for op in res["data"]["attributes"].get("uploadOperations") or []:
        part = blob[op["offset"]:op["offset"] + op["length"]]
        hdrs = {h["name"]: h["value"] for h in op.get("requestHeaders") or []}
        req = urllib.request.Request(op["url"], data=part, method=op["method"], headers=hdrs)
        with urllib.request.urlopen(req) as r:
            r.read()
    call("PATCH", f"/v1/{rel[0]}/{img_id}", {"data": {"type": rel[0], "id": img_id, "attributes": {"uploaded": True}}})


def main():
    global TOKEN
    TOKEN = token()
    app_id = os.environ["APP_ID"]

    # Game Center detail for the app (created when Game Center is first turned on).
    try:
        gc = call("GET", f"/v1/apps/{app_id}/gameCenterDetail")["data"]
    except urllib.error.HTTPError:
        gc = None
    if not gc:
        gc = call("POST", "/v1/gameCenterDetails", {"data": {"type": "gameCenterDetails",
                  "relationships": {"app": {"data": {"type": "apps", "id": app_id}}}}})["data"]
        print("Created Game Center detail", gc["id"])
    gc_id = gc["id"]
    print("Game Center detail:", gc_id)

    # Achievements
    existing = {a["attributes"]["vendorIdentifier"]: a for a in get_all(f"/v1/gameCenterDetails/{gc_id}/gameCenterAchievements?limit=200")}
    for aid, name, before, after, points in ACHIEVEMENTS:
        vid = "qp.ach." + aid
        if vid in existing:
            ach_id = existing[vid]["id"]
            print("exists ", vid)
        else:
            ach_id = call("POST", "/v1/gameCenterAchievements", {"data": {"type": "gameCenterAchievements",
                          "attributes": {"referenceName": name, "vendorIdentifier": vid, "points": points,
                                         "showBeforeEarned": True, "repeatable": False},
                          "relationships": {"gameCenterDetail": {"data": {"type": "gameCenterDetails", "id": gc_id}}}}})["data"]["id"]
            print("created", vid)
        locs = get_all(f"/v1/gameCenterAchievements/{ach_id}/localizations?limit=50")
        loc = next((l for l in locs if l["attributes"]["locale"] == "en-US"), None)
        if not loc:
            loc = call("POST", "/v1/gameCenterAchievementLocalizations", {"data": {"type": "gameCenterAchievementLocalizations",
                       "attributes": {"locale": "en-US", "name": name, "beforeEarnedDescription": before, "afterEarnedDescription": after},
                       "relationships": {"gameCenterAchievement": {"data": {"type": "gameCenterAchievements", "id": ach_id}}}}})["data"]
            print("  + English text")
        # image
        has_img = False
        try:
            img = call("GET", f"/v1/gameCenterAchievementLocalizations/{loc['id']}/gameCenterAchievementImage")
            has_img = bool(img.get("data"))
        except urllib.error.HTTPError:
            has_img = False
        if not has_img:
            upload_image("achievement", loc["id"], os.path.join(IMG_DIR, f"ach-{aid}.png"))
            print("  + image")

    # Leaderboards
    lbs = {l["attributes"]["vendorIdentifier"]: l for l in get_all(f"/v1/gameCenterDetails/{gc_id}/gameCenterLeaderboards?limit=200")}
    for vid, ref, display, sub, suffix, singular, (lo, hi) in LEADERBOARDS:
        if vid in lbs:
            lb_id = lbs[vid]["id"]
            print("exists ", vid)
        else:
            lb_id = call("POST", "/v1/gameCenterLeaderboards", {"data": {"type": "gameCenterLeaderboards",
                         "attributes": {"referenceName": ref, "vendorIdentifier": vid, "defaultFormatter": "INTEGER",
                                        "submissionType": sub, "scoreSortType": "DESC",
                                        "scoreRangeStart": str(lo), "scoreRangeEnd": str(hi)},
                         "relationships": {"gameCenterDetail": {"data": {"type": "gameCenterDetails", "id": gc_id}}}}})["data"]["id"]
            print("created", vid)
        locs = get_all(f"/v1/gameCenterLeaderboards/{lb_id}/localizations?limit=50")
        if not any(l["attributes"]["locale"] == "en-US" for l in locs):
            call("POST", "/v1/gameCenterLeaderboardLocalizations", {"data": {"type": "gameCenterLeaderboardLocalizations",
                 "attributes": {"locale": "en-US", "name": display, "formatterSuffix": suffix, "formatterSuffixSingular": singular},
                 "relationships": {"gameCenterLeaderboard": {"data": {"type": "gameCenterLeaderboards", "id": lb_id}}}}})
            print("  + English text")
    total = sum(a[4] for a in ACHIEVEMENTS)
    print(f"Done: {len(ACHIEVEMENTS)} achievements ({total} points), {len(LEADERBOARDS)} leaderboards.")


if __name__ == "__main__":
    main()
