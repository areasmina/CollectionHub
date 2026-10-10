#!/usr/bin/env python3
"""
Deck Wizard v5 - ManaBox collection vs EDHREC (per bracket) + Commander Spellbook combos
+ collection substitutes for missing cards + visual card view (Scryfall images).
No AI, no accounts: only free public sites (Scryfall, EDHREC, Commander Spellbook).

Usage (Windows):  py deck_wizard.py            (newest ManaBox CSV in the "collection" folder)
                  py deck_wizard.py --csv "Collection_ (1).csv"
                  py deck_wizard.py --serve    (local app with an "Upload collection" button)
Options:
  --brackets core,upgraded,optimized,cedh   EDHREC bracket pages to pull
                                            (add exhibition if you want B1)
  --only "Sephiroth, Fabled SOLDIER;Terra, Herald of Hope"
  --limit 20        test run with the first 20 commanders
  --refresh         ignore all caches
  --no-open         don't open the report automatically
  --no-combos       skip Commander Spellbook
  --decks-in DIR    folder of decklists (.txt) to score, default "decks_in"
  --offline         no network: use cached data only (for tests and quick reruns)
  --serve           open the report through a local app (http://127.0.0.1:8765) with an
                    upload button; uploads go to the "collection" folder and trigger a rebuild
  --port 8765       port for --serve
"""
import argparse, csv, glob, hashlib, json, math, os, re, sys, time, unicodedata
import heapq, http.server, subprocess, threading
import urllib.error, urllib.parse, urllib.request, webbrowser

UA = "DeckWizard/0.5 (personal collection tool)"
EDH = "https://json.edhrec.com/pages/commanders/"
EDH_AVG = "https://json.edhrec.com/pages/average-decks/"
CSB = "https://backend.commanderspellbook.com/find-my-combos"
CSB_CARDS = "https://backend.commanderspellbook.com/cards/"
CSB_BRACKET = "https://backend.commanderspellbook.com/estimate-bracket"
CARD_FLAGS = {}         # normalized name -> [game changer, mass land denial, extra turn] from Spellbook
CSB_TEMPLATES = "https://backend.commanderspellbook.com/templates/"
TEMPLATES = {}          # combo condition ("Persist Creature") -> normalized names of cards that meet it
CSB_DELAY = 1.0         # seconds between Commander Spellbook requests (it rate-limits bursts)
CSB_MAX_MAIN = 600      # find-my-combos rejects decks with more cards than this
CSB_DOWN = [False]      # set when Spellbook stops answering; the rest of the run skips combos
BASICS = {"W": "Plains", "U": "Island", "B": "Swamp", "R": "Mountain", "G": "Forest"}
BASIC_NAMES = set(BASICS.values()) | {"Wastes", "Snow-Covered Plains", "Snow-Covered Island",
    "Snow-Covered Swamp", "Snow-Covered Mountain", "Snow-Covered Forest"}
LAND_TARGET = 35
MAX_LANDS = 12          # non-basic lands taken from EDHREC lists
MIN_BASICS = 10         # owned dual lands replace basics down to this many (fetches, land tutors)
TAPPED_MAX = 3          # owned duals that always enter tapped: at most this many in a deck
SUB_MIN = 0.25          # missing cards played in 25%+ of decks get a substitute in the deck
GAP_SHOW = 20           # missing cards shown in the report, with alternatives
ROLE_TARGETS = {"ramp": 10, "draw": 9, "removal": 8, "wipe": 2}
VALID_BRACKETS = ["exhibition", "core", "upgraded", "optimized", "cedh"]
OFFLINE = False         # --offline: never touch the network, use caches only
GC_CAP = {"exhibition": 0, "core": 0, "upgraded": 3}   # Game Changers per bracket; others: no cap
EDH_CACHE, EDH_VERSION = "edhrec_v4.json", 4           # v4 pages add synergy, lift, list tags
SF_VERSION = 4          # bump when compact_card() gains fields; older cache entries are refetched

# ----------------------------------------------------------------- helpers
def norm(name):
    return name.split(" // ")[0].strip().lower()

def slugify(name):
    s = unicodedata.normalize("NFKD", norm(name))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.replace("'", "").replace("\u2019", "").replace(".", "")    # EDHREC: "M.O.D.O.K." -> modok
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

def http_json(url, data=None, retries=3):
    if OFFLINE: return None
    body =json.dumps(data).encode() if data is not None else None
    headers = {"User-Agent": UA, "Accept": "application/json"}
    if body: headers["Content-Type"] = "application/json"
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=body, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            # missing page / no results (EDHREC answers 403 for missing pages); callers don't cache it
            if e.code in (403, 404): return None
            last = e
            if e.code in (429, 502, 503, 504):   # busy / rate limited: wait as long as asked, then longer
                ra = e.headers.get("Retry-After") or ""
                wait = min(300, int(ra)) if ra.isdigit() else min(120, 15 * 2 ** attempt)
                if attempt < retries - 1:
                    print(f"  {urllib.parse.urlparse(url).netloc} says slow down (HTTP {e.code}); waiting {wait}s",
                          file=sys.stderr)
                    time.sleep(wait)
            elif 400 <= e.code < 500:            # our request is wrong: retrying won't help
                detail = e.read()[:200].decode("utf-8", "replace")
                print(f"  ! request rejected: {url} (HTTP {e.code}: {detail})", file=sys.stderr)
                return None
            else:
                time.sleep(2 * (attempt + 1))
        except Exception as e:
            last = e; time.sleep(2 * (attempt + 1))
    print(f"  ! request failed: {url} ({last})", file=sys.stderr)
    return None

def load_json(path):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f: return json.load(f)
    return {}

def save_json(path, obj):
    """Write to a temp file, then swap it in: an interrupted run never leaves a half-written cache."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f: json.dump(obj, f)
    os.replace(tmp, path)

# ------------------------------------------------------------ collection
COLLECTION_DIR = "collection"   # drop new ManaBox exports here; the newest one is used

def manabox_error(head):
    """None if `head` (the CSV's first line) looks like a ManaBox export, else a message."""
    cols = next(csv.reader([head]), [])
    if "Name" in cols and "Scryfall ID" in cols: return None
    return "Not a ManaBox collection export (needs 'Name' and 'Scryfall ID' columns)."

def find_collection():
    """Newest ManaBox CSV: the collection folder first, then the current folder."""
    for folder in (COLLECTION_DIR, "."):
        found = []
        for p in glob.glob(os.path.join(folder, "*.csv")):
            try:
                with open(p, encoding="utf-8-sig") as f:
                    if not manabox_error(f.readline()): found.append(p)
            except (OSError, UnicodeDecodeError): pass
        if found: return max(found, key=os.path.getmtime)
    return None

def collection_changes(csv_path, owned, cmdr_names, cache_dir):
    """Cards and commanders added/removed since the previous collection file. Kept until the
    CSV changes again, so rerunning the same file still shows what it added."""
    path = os.path.join(cache_dir, "last_collection.json")
    with open(csv_path, "rb") as f: h = hashlib.md5(f.read()).hexdigest()
    prev = load_json(path)
    if prev.get("hash") == h: return prev.get("diff")
    names, diff = {m["name"] for m in owned.values()}, None
    if prev.get("names"):
        old = set(prev["names"])
        diff = {"added": sorted(names - old), "removed": sorted(old - names),
                "new_cmdrs": sorted(set(cmdr_names) - set(prev.get("cmdrs", [])))}
    save_json(path, {"hash": h, "names": sorted(names), "cmdrs": sorted(cmdr_names), "diff": diff})
    return diff
def load_collection(path):
    cards = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            sid = (row.get("Scryfall ID") or "").strip()
            if not sid: continue
            qty = int(row.get("Quantity") or 1)
            name = row.get("Name", "")
            cards[sid] = (name, cards[sid][1] + qty) if sid in cards else (name, qty)
    return cards

def compact_card(c):
    faces, pr = c.get("card_faces") or [], c.get("prices") or {}
    oracle = c.get("oracle_text") or " // ".join(f.get("oracle_text", "") for f in faces)
    iu = c.get("image_uris") or (faces[0].get("image_uris") if faces else None) or {}
    cost = c.get("mana_cost") or " // ".join(f["mana_cost"] for f in faces if f.get("mana_cost"))
    return {
        "name": c.get("name", ""), "type_line": c.get("type_line", ""),
        "ci": c.get("color_identity", []), "cmc": c.get("cmc", 0) or 0, "oracle": oracle,
        "produced": c.get("produced_mana", []) or [], "gc": bool(c.get("game_changer", False)),
        "commander_legal": (c.get("legalities") or {}).get("commander") == "legal",
        "layout": c.get("layout", ""), "img": iu.get("normal") or iu.get("small") or "",
        # v2 fields: colored pips for basics, overall EDHREC popularity, keyword abilities
        "mana_cost": cost, "edhrec_rank": c.get("edhrec_rank"), "keywords": c.get("keywords", []) or [],
        # v3: this printing's price in USD (normal, else foil, else etched): shown as information only, never scored
        "usd": next((float(v) for v in (pr.get("usd"), pr.get("usd_foil"), pr.get("usd_etched")) if v), None),
        # v4: power of the (front) face, a string ("*" possible); None for non-creatures
        "power": c.get("power", faces[0].get("power") if faces else None),
        "v": SF_VERSION,
    }

def enrich_scryfall(ids, cache_path, refresh=False):
    cache = {} if refresh else load_json(cache_path)
    todo = [i for i in ids if i not in cache or cache[i].get("v") != SF_VERSION]
    if OFFLINE:
        gone = sum(1 for i in todo if i not in cache)
        print(f"Scryfall: {len(ids) - gone} cached ({len(todo) - gone} in an older format),"
              f" {gone} without data (offline)")
        return cache
    print(f"Scryfall: {len(ids) - len(todo)} cached, {len(todo)} to fetch")
    for n in range(0, len(todo), 75):
        batch = todo[n:n + 75]
        resp = http_json("https://api.scryfall.com/cards/collection",
                         {"identifiers": [{"id": i} for i in batch]})
        if resp is None:
            print("  ! Scryfall batch failed; rerun to resume."); break
        for c in resp.get("data", []):
            cache[c["id"]] = compact_card(c)
        save_json(cache_path, cache)
        print(f"  fetched {min(n + 75, len(todo))}/{len(todo)}")
        time.sleep(0.12)
    return cache

def resolve_names(names, cache_path, refresh=False):
    """Scryfall data for cards you don't own (missing cards, imported decks)."""
    cache = {} if refresh else load_json(cache_path)
    stale = lambda k: k not in cache or (cache[k] is not None and cache[k].get("v") != SF_VERSION)
    todo = sorted({n for n in names if stale(norm(n)) and n not in BASIC_NAMES})
    if OFFLINE:
        if todo: print(f"Scryfall: {len(todo)} cards you don't own skipped (offline)")
        return cache
    if todo: print(f"Scryfall: looking up {len(todo)} cards you don't own")
    for i in range(0, len(todo), 75):
        batch = todo[i:i + 75]
        resp = http_json("https://api.scryfall.com/cards/collection",
                         {"identifiers": [{"name": n.split(" // ")[0]} for n in batch]})
        if not resp:
            print("  ! Scryfall lookup failed; rerun to resume."); break
        for c in resp.get("data", []):
            cache[norm(c["name"])] = compact_card(c)
        for nf in resp.get("not_found", []):
            if nf.get("name"): cache[norm(nf["name"])] = None
        save_json(cache_path, cache)
        if (i // 75) % 10 == 9: print(f"  looked up {min(i + 75, len(todo))}/{len(todo)}")
        time.sleep(0.12)
    return cache

# ---------------------------------------------------------------- roles
ROLE_NAMES = ["ramp", "draw", "removal", "wipe", "tutor", "counter", "recursion", "sac", "win"]
# Scryfall Tagger function tags; several spellings tried, results merged
TAG_QUERIES = {
    "ramp": ["ramp"], "draw": ["draw", "card-draw"], "removal": ["removal"],
    "wipe": ["sweeper", "board-wipe"], "tutor": ["tutor"], "counter": ["counterspell"],
    "recursion": ["recursion"], "sac": ["sacrifice-outlet"],
}
ROLE_TAGS = {}       # role -> set of normalized names (filled in main)
_ROLE_MEMO = {}

def fetch_role_tags(cache_path, refresh=False):
    cache = {} if refresh else load_json(cache_path)
    if cache.get("roles") and time.time() - cache.get("_ts", 0) < 30 * 86400:
        roles = {r: set(v) for r, v in cache["roles"].items()}
        print("Role tags: cached (" + ", ".join(f"{r} {len(v)}" for r, v in roles.items()) + ")")
        return roles
    if OFFLINE:   # any cached tags beat none, even if older than a month
        roles = {r: set(v) for r, v in (cache.get("roles") or {}).items()}
        print("Role tags: " + ("cached, may be stale (offline)" if roles else "none cached; text matching (offline)"))
        return roles
    print("Role tags: downloading from Scryfall Tagger (once a month, ~1-2 min)")
    roles = {}
    for role, tags in TAG_QUERIES.items():
        names = set()
        for tag in tags:
            q = urllib.parse.urlencode({"q": f"otag:{tag} f:commander", "unique": "cards"})
            url, pages = "https://api.scryfall.com/cards/search?" + q, 0
            while url and pages < 80:
                resp = http_json(url)
                if not resp: break
                names |= {norm(c["name"]) for c in resp.get("data", [])}
                url = resp.get("next_page") if resp.get("has_more") else None
                pages += 1; time.sleep(0.11)
        print(f"  {role}: {len(names)} cards")
        if names: roles[role] = names
    if len(roles) == len(TAG_QUERIES):
        save_json(cache_path, {"_ts": time.time(), "roles": {r: sorted(v) for r, v in roles.items()}})
    else:
        print("  ! some tags came back empty; those roles use text matching this run")
    return roles

def regex_roles(c):
    o, r = c["oracle"].lower(), set()
    if c["produced"] or ("search your library" in o and "basic land" in o): r.add("ramp")
    if re.search(r"\bdraws? (a|an|two|three|x|that many|cards?)\b", o): r.add("draw")
    if re.search(r"(destroy|exile) target|target (creature|player) (gets|sacrifices)|each opponent sacrifices", o):
        r.add("removal")
    if re.search(r"(destroy|exile) all|each creature gets -", o): r.add("wipe")
    if "search your library" in o and "basic land" not in o: r.add("tutor")
    if re.search(r"counter target (spell|activated|triggered|noncreature|creature)", o): r.add("counter")
    if re.search(r"return [^.]*cards? from (your|a) graveyard", o): r.add("recursion")
    if re.search(r"sacrifice (a|another) (creature|permanent|artifact)[^.]*:", o): r.add("sac")
    if WIN_RX_CARD.search(o): r.add("win")
    return r

# A win condition, read from rules text (no tag for it): overruns and team-wide pumps ("creatures you control gain
# trample and get +X/+X"), payoffs counting your creatures, repeatable drain/burn to each opponent, extra combats,
# "you win the game" / opponents lose. Two-card combos are counted separately (Spellbook).
WIN_RX_CARD = re.compile(
    r"creatures you control (gain [^.]{0,40}? and )?get \+(x|\d+)/\+(x|\d+) until end of turn|"
    r"where x is the number of creatures you control|"
    r"\byou win the game\b|(each opponent|target player|that player) loses the game|"
    r"whenever [^.]{0,80}(\. if you do, )?(each opponent loses \w+ life|deals? \w+ damage to each opponent)|"
    r"additional combat phase|double strike and trample")

def roles_of(m):
    k = norm(m["name"])
    if k in _ROLE_MEMO: return _ROLE_MEMO[k]
    if "Land" in m["type_line"].split(" // ")[0]:
        r = {"land"}
    else:
        rx, r = None, set()
        for role in ROLE_NAMES:
            if role in ROLE_TAGS and role != "win":
                if k in ROLE_TAGS[role]: r.add(role)
            else:
                rx = rx if rx is not None else regex_roles(m)
                if role in rx: r.add(role)
    _ROLE_MEMO[k] = r
    return r

def card_kind(m):
    t = m["type_line"].split(" // ")[0]
    return "land" if "Land" in t else "creature" if "Creature" in t else "spell"

def type_group(type_line):
    t = type_line.split(" // ")[0]
    for g in ("Land", "Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment"):
        if g in t: return g
    return "Other"

STORE_URL = "https://shop.com/search/results?query={card}"   # 'buy' links (the user's store); --store-url changes it
TWO_FACED = {"transform", "modal_dfc", "reversible_card", "double_faced_token"}   # back image = /back/ path

class CardTable:
    """One shared card list for the report; decks reference cards by index."""
    PREFIX = "https://cards.scryfall.io/normal/"
    def __init__(self): self.rows, self.idx, self.strs, self.sidx, self.opts, self.oidx = [], {}, [], {}, [], {}
    def o(self, opt):
        """Index of a card's swap options in the shared option table (OPTS in the page): the same card gets the
        same options in most decks of a commander (brackets, themes, average decks), so they're stored once."""
        k = json.dumps(opt, separators=(",", ":"))
        if k not in self.oidx: self.oidx[k] = len(self.opts); self.opts.append(json.loads(k))
        return self.oidx[k]
    def s(self, text):
        """Index of a reason text in the shared string table (-1 for none): the same reasons repeat
        thousands of times across commanders, brackets and themes."""
        if not text: return -1
        if text not in self.sidx: self.sidx[text] = len(self.strs); self.strs.append(text)
        return self.sidx[text]
    def add(self, name, meta=None):
        k = norm(name)
        img = (meta or {}).get("img", "")
        if img.startswith(self.PREFIX): img = img[len(self.PREFIX):]
        if k in self.idx:
            i = self.idx[k]
            if img and not self.rows[i][1]: self.rows[i][1] = img
            return i
        if meta: row = [meta["name"], img, type_group(meta["type_line"]), 1 if meta.get("gc") else 0,
                        int(meta.get("cmc") or 0), 1 if meta.get("layout") in TWO_FACED and "front/" in img else 0,
                        sum(1 << i for i, r in enumerate(ROLE_NAMES) if r in roles_of(meta)),   # roles bitmask
                        round(meta["usd"], 2) if meta.get("usd") else 0]                         # USD, shown as info only
        else: row = [name, "", "Land" if name in BASIC_NAMES else "Other", 0, 0]
        self.rows.append(row); self.idx[k] = len(self.rows) - 1
        return self.idx[k]

# ---------------------------------------------------------------- EDHREC
def find_tags(data):
    jd = (data.get("container") or {}).get("json_dict") or {}
    panels = data.get("panels") or jd.get("panels") or {}
    out = []
    for t in panels.get("taglinks") or []:
        if not isinstance(t, dict): continue
        name = t.get("value") or t.get("name") or ""
        if name: out.append([name, t.get("slug") or slugify(name), int(t.get("count") or 0)])
    out.sort(key=lambda x: -x[2])
    return out[:8]

def parse_edhrec(data):
    """cards: key -> [name, rate, synergy, lift, [EDHREC list tags]]. Old (v3) pages have only
    [name, rate], so read the extra fields with a length check."""
    jd = (data.get("container") or {}).get("json_dict") or {}
    cards, decks = {}, 0
    for lst in jd.get("cardlists", []):
        tag = lst.get("tag") or ""
        for cv in lst.get("cardviews", []):
            name = cv.get("name")
            if not name: continue
            pot = cv.get("potential_decks") or 0
            inc = cv.get("inclusion", cv.get("num_decks", 0)) or 0
            decks = max(decks, pot)
            rate = (inc / pot) if pot else 0.0
            key, old = norm(name), cards.get(norm(name))
            if old is None or rate > old[1]:
                syn, lift = cv.get("synergy"), cv.get("lift")
                cards[key] = [name, rate, None if syn is None else round(syn, 3),
                              None if lift is None else round(lift, 3), old[4] if old else []]
            if tag and tag not in cards[key][4]: cards[key][4].append(tag)
    decks = decks or int(data.get("num_decks_avg") or 0)
    return {"v": EDH_VERSION, "decks": decks, "cards": cards, "tags": find_tags(data)}

def parse_avg(data):
    """EDHREC's average deck: one decklist (key -> [name, copies]) and the decks per bracket behind it."""
    deck = data.get("deck") or {}
    cmdrs = {norm(x) for x in deck.get("commander") or []}
    cards = {}
    for group in (deck.get("cards") or {}).values():
        for row in group or []:
            if not row or norm(row[0]) in cmdrs: continue
            cards[norm(row[0])] = [row[0], int(row[1] if len(row) > 1 and row[1] else 1)]
    counts = {str(k): int(v or 0) for k, v in (data.get("bracket_counts") or {}).items()}
    return {"v": EDH_VERSION, "avg": 1, "cards": cards, "counts": counts}

def avg_as_page(ap, page, base, bracket):
    """An average deck as an EDHREC-style page for analyze(): every card in it is "played in every
    deck" (it is the deck); synergy comes from the commander's page for the same bracket (else all
    decks). Returns (page, real play rates) - the real rates order and label the gaps."""
    cards, show = {}, {}
    for k, (name, _) in ap["cards"].items():
        if name in BASIC_NAMES: continue
        syn = next((v[2] for v in (page["cards"].get(k), base["cards"].get(k))
                    if v and len(v) > 2 and v[2] is not None), None)
        cards[k] = [name, 1.0, syn, None, ["avg"]]
        show[k] = (page["cards"].get(k) or (None, 0.0))[1]
    counts = ap.get("counts") or {}
    decks = counts.get(str(BRACKET_NUM.get(bracket))) if bracket != "all" else sum(counts.values())
    return {"decks": decks or page["decks"], "cards": cards, "tags": base.get("tags") or []}, show

def avg_shape(ap, owned, name_meta):
    """Card types and mana curve (non-lands, 7+ together) of an EDHREC average deck, for the
    report's charts: your deck against the average."""
    mv, ty = [0] * 8, {}
    for k, (name, q) in ap["cards"].items():
        m = owned.get(k) or name_meta.get(k)
        if name in BASIC_NAMES: g = "Land"
        elif not m: continue                # no Scryfall data for it: left out of the charts
        else: g = type_group(m["type_line"])
        ty[g] = ty.get(g, 0) + q
        if g != "Land": mv[min(int(m.get("cmc") or 0), 7)] += q
    return {"mv": mv, "ty": ty}

def load_edhrec_cache(cache_dir, refresh=False):
    """EDHREC pages by path. The first time, seeds from the v3 cache so old pages stay usable
    offline; fetch_page upgrades them the next time they're needed online."""
    if refresh: return {}
    cache = load_json(os.path.join(cache_dir, EDH_CACHE))
    if not cache:   # v3 cached misses are dropped: some may have been 403 blocks
        cache = {k: v for k, v in load_json(os.path.join(cache_dir, "edhrec_v3.json")).items() if v}
    return cache

EDH_MAX_DAYS = 14       # a commander's main page (theme stats, play rates) is refetched after this many days

def fetch_page(path, cache, refresh=False, avg=False, max_days=None):
    """A commander page (`avg` = the average-deck page, cached as "avg:<path>"). `max_days`: refetch
    when the cached copy is older (pages cached before ages were recorded count as old)."""
    key = "avg:" + path if avg else path
    old = cache.get(key)
    fresh = max_days is None or time.time() - (old or {}).get("at", 0) < max_days * 86400
    if not refresh and old and old.get("v") == EDH_VERSION and fresh: return old
    if OFFLINE: return old              # older data beats none; nothing new is recorded
    data = http_json((EDH_AVG if avg else EDH) + path + ".json")
    time.sleep(0.8)
    if not data: return old             # missing page (EDHREC answers 403) or failure: never cached
    cache[key] = parse_avg(data) if avg else parse_edhrec(data)
    cache[key]["at"] = int(time.time())
    return cache[key]

# ------------------------------------------------------------ substitutes
STOP = set("a an the of to and or in on at for from with by as is it its this that your you their they "
           "be are can may then if each any one card cards".split())
TEXT_COMMON = 0.04      # word pairs on more than this share of the pool ("target creature") say nothing
_SIG_MEMO = {}

def text_sig(m):
    """Word pairs of the full Oracle text, reminder text included (card name -> ~, numbers -> #)."""
    k = norm(m["name"])
    if k not in _SIG_MEMO:
        words = [w for w in re.findall(r"[a-z~+/#'-]+", re.sub(r"\d+", "#", rules_text(m))) if w not in STOP]
        _SIG_MEMO[k] = frozenset(zip(words, words[1:]))
    return _SIG_MEMO[k]

def text_index(pool):
    """{word pair: [pool items]} without the pairs most cards have."""
    idx = {}
    for it in pool:
        if it[3] == "land": continue
        for bg in text_sig(it[1]): idx.setdefault(bg, []).append(it)
    limit = max(8, TEXT_COMMON * len(pool))
    return {bg: L for bg, L in idx.items() if len(L) <= limit}

def build_pool(ci, owned, exclude=""):
    """Owned cards a commander with color identity `ci` could play, indexed by role
    (and by_role["_text"] = text_index of the pool, for finding cards that read alike)."""
    pool, by_role = [], {}
    for k, m in owned.items():
        if k == exclude or not m["commander_legal"] or not set(m["ci"]) <= ci: continue
        if m["layout"] in ("token", "emblem"): continue
        it = (k, m, roles_of(m), card_kind(m))
        pool.append(it)
        for r in it[2]: by_role.setdefault(r, []).append(it)
    by_role["_text"] = text_index(pool)
    return pool, by_role

# Types a commander's text can name (Dragon, Elf, artifact, Equipment...). Filled by prepare_types()
# from every type line we already have, so no extra download is needed.
TYPE_VOCAB = set()
SUB_MATCH_MIN = 0.35    # closeness (0-1) below which an owned card isn't offered as a stand-in
TEXT_FULL = 0.3         # Oracle-text likeness (Jaccard of word pairs) that counts as "reads the same"
TEXT_ALT = 0.15         # likeness from which a card is a stand-in candidate even without a shared role
OFF_TYPE = 0.4          # closeness multiplier when a stand-in lacks the type the commander cares about
STANDIN = 0.6           # a stand-in is a guess at the real card's job: it counts for 60% of its closeness
MAIN_TYPES = {"artifact", "enchantment", "spell", "planeswalker", "battle"}   # named in lower case
SHRINK_DECKS = 200      # bracket pages with few decklists lean on the all-decks page (blended_rates)

_TW_MEMO = {}
def type_words(m):
    """Front-face types and subtypes, lower case; instant and sorcery both count as 'spell'."""
    tl = m.get("type_line") or ""
    if tl not in _TW_MEMO:
        words = set(re.findall(r"[a-z]+", tl.split(" // ")[0].lower()))
        if words & {"instant", "sorcery"}: words |= {"spell"}
        _TW_MEMO[tl] = frozenset(words)
    return _TW_MEMO[tl]

def is_changeling(m):
    return "Changeling" in (m.get("keywords") or []) or "is every creature type" in m["oracle"].lower()

def prepare_types(cards):
    """Collect creature/artifact/enchantment subtypes (no land types) into TYPE_VOCAB."""
    TYPE_VOCAB.update(MAIN_TYPES)
    for m in cards:
        front = (m.get("type_line") or "").split(" // ")[0]
        if "—" in front and "Land" not in front:
            TYPE_VOCAB.update(re.findall(r"[a-z]+", front.split("—", 1)[1].lower()))

# Mechanics by name (connive, landfall, mobilize, proliferate...) from Scryfall's official keyword catalogs.
# Evergreen/combat keywords and generic actions are left out: they're everywhere or covered by MECHANICS.
KEYWORD_VOCAB = set()
KW_SKIP = {
    "flying", "trample", "haste", "vigilance", "lifelink", "deathtouch", "reach", "first strike", "double strike",
    "menace", "hexproof", "indestructible", "flash", "defender", "ward", "equip", "enchant", "protection", "shroud",
    "intimidate", "fear", "partner", "changeling", "landwalk", "hexproof from", "companion",
    "scry", "heal", "activate", "attach", "cast", "counter", "create", "destroy", "discard", "exchange", "exile",
    "play", "reveal", "sacrifice", "shuffle", "tap", "untap", "vote", "transform", "planeswalk", "mill", "regenerate",
    "fight", "double", "triple", "food", "treasure", "learn", "abandon", "set in motion", "open an attraction",
    "roll to visit your attractions", "empower jace", "draft from a spellbook", "conjure", "seek", "convert", "meld",
    "heist", "incorporate", "assemble", "face a dilemma"}
_KW_RX, _KW_MEMO = {}, {}

def fetch_keyword_catalog(cache_path, refresh=False):
    """Scryfall /catalog/keyword-abilities, keyword-actions, ability-words (monthly) -> KEYWORD_VOCAB."""
    cache = {} if refresh else load_json(cache_path)
    words = cache.get("words")
    if not words or (time.time() - cache.get("_ts", 0) > 30 * 86400 and not OFFLINE):
        got = []
        for c in ("keyword-abilities", "keyword-actions", "ability-words"):
            r = http_json("https://api.scryfall.com/catalog/" + c); time.sleep(0.11)
            if not r: got = None; break
            got += r.get("data", [])
        if got: words = sorted({w.lower() for w in got}); save_json(cache_path, {"_ts": time.time(), "words": words})
    KEYWORD_VOCAB.clear(); KEYWORD_VOCAB.update(set(words or []) - KW_SKIP)

def kw_rx(k):
    if k not in _KW_RX:
        forms = {k, k + "s", k + "es", k + "d", k + "ed", k + "ing"} | ({k[:-1] + "ing"} if k.endswith("e") else set())
        _KW_RX[k] = re.compile(r"\b(" + "|".join(sorted(map(re.escape, forms), key=len, reverse=True)) + r")\b")
    return _KW_RX[k]

def has_keyword(m, k):
    """Card has mechanic k (Scryfall keyword list) or its rules text mentions it ("whenever ... connives")."""
    key = (norm(m["name"]), k)
    if key not in _KW_MEMO:
        _KW_MEMO[key] = k in {x.lower() for x in m.get("keywords") or []} or bool(kw_rx(k).search(rules_text(m)))
    return _KW_MEMO[key]

def commander_types(cmdr):
    """Types the commander's own rules text names, e.g. {'dragon'} for Ureni of the Unwritten."""
    text = cmdr["oracle"]
    parts = cmdr["name"].split(" // ")        # its own names ("Lathliss, Dragon Queen") aren't rules;
    for part in parts + [p.split(",")[0] for p in parts]:   # full names first, then short ones
        text = text.replace(part, " ")
    low = set(re.findall(r"[a-z]+", text.lower()))
    if low & {"instant", "instants", "sorcery", "sorceries"}: low.add("spell")
    caps = {w.lower() for w in re.findall(r"\b[A-Z][a-z]+", text)}   # subtypes are capitalised in rules
    out = set()                                                      # text ("Dragon"), so "each time"
    for t in TYPE_VOCAB:                                             # isn't the Time Lord type
        forms = {t, t + "s", t + "es"}
        if t.endswith("f"): forms.add(t[:-1] + "ves")       # elf -> elves, wolf -> wolves
        if t.endswith("fe"): forms.add(t[:-2] + "ves")
        if forms & (low if t in MAIN_TYPES else caps): out.add(t)
    return out

# ------------------------------------------------------- collection-first scoring
# What a card does / cares about, from its rules text (or its types). A card "fits" a commander when
# they share one of these. Each entry: rules-text pattern, EDHREC theme names, card types that count.
# CARES_ABOUT: a stricter pattern for the commander's own text where the card pattern is too broad
# ("Whenever Ureni attacks" or "Terra gains flying" isn't caring about attackers or fliers).
CARES_ABOUT = {
    "attacking": r"whenever (a|another|one or more|each) [^.]{0,40}attacks?|additional combat|extra combat",
    "flying": r"with flying|flying creatures?|creatures? you control (have|gain) flying",
}
MECHANICS = {
    "tokens":     (r"\btokens?\b", ("tokens", "go wide"), ()),
    "+1/+1":      (r"\+1/\+1 counters?|\bproliferate\b", ("+1/+1 counters", "counters", "proliferate"), ()),
    "-1/-1":      (r"-1/-1 counters?|\binfect\b", ("-1/-1 counters", "infect"), ()),
    "sacrifice":  (r"\bsacrifices? (a|an|another|one or more|x)\b|whenever [^.]{0,40}\bdies\b",
                   ("aristocrats", "sacrifice"), ()),
    "graveyard":  (r"from (your|a) graveyard|\bmills?\b|into your graveyard",
                   ("reanimator", "graveyard", "self-mill", "mill"), ()),
    "lifegain":   (r"\byou gain [^.]{0,12}life|\bgains? \d+ life|whenever you gain life|\blifelink\b",
                   ("lifegain", "lifedrain"), ()),
    # losing life and being dealt damage both end the same plan (Doom drains 2; Brallin deals 1 to each opponent)
    "drain":      (r"\b(each opponent|target opponent|each player) loses? \w+ life|deals? \w+ damage to each opponent|"
                   r"whenever an opponent [^.]{0,60}(that player|they) loses? \w+ life|"     # punishers (Painful Quandary)
                   r"whenever an opponent [^.]{0,60}deals? \w+ damage to (that player|them)",
                   ("lifedrain", "burn", "group slug"), ()),
    "spells":     (r"instant (or|and) sorcery|noncreature spell|whenever you cast (a|an|your) (instant|sorcery|noncreature)",
                   ("spellslinger", "storm", "spell copy", "cantrips"), ("instant", "sorcery")),
    "artifacts":  (r"\bartifacts?\b", ("artifacts",), ("artifact",)),
    "enchantments": (r"\benchantments?\b|\bauras?\b", ("enchantress", "auras", "enchantments"), ("enchantment",)),
    "equipment":  (r"\bequip(ped|ment)?\b", ("voltron", "equipment"), ("equipment",)),
    "lands":      (r"landfall|whenever a land|play an additional land|lands? (cards? )?from your graveyard",
                   ("landfall", "lands matter"), ()),
    "attacking":  (r"whenever [^.]{0,40}\battacks?\b|additional combat|extra combat",
                   ("aggro", "extra combats", "attack triggers", "forced combat"), ()),
    "draw":       (r"whenever (you|a player|an opponent) draws?|draws? (your|their) second card|each player draws",
                   ("wheels", "card draw", "group hug"), ()),
    "blink":      (r"exile [^.]*\. return (it|that card|them|those cards)|then return (it|that card|them|those cards) to the battlefield",
                   ("blink",), ()),
    "discard":    (r"\bdiscards?\b|\bmadness\b", ("discard", "madness"), ()),
    "flying":     (r"\bflying\b", ("flying",), ()),
    "treasure":   (r"\btreasures?\b", ("treasure",), ()),
    "copies":     (r"\bcop(y|ies)\b|\bclones?\b", ("clones", "spell copy"), ()),
    "theft":      (r"gain control of|you don't own", ("theft",), ()),
    "legends":    (r"\blegendary\b|\bhistoric\b", ("legends", "historic"), ("legendary",)),
    "vehicles":   (r"\bvehicles?\b|\bcrew\b", ("vehicles",), ("vehicle",)),
}
THEME_ROLES = {"ramp": "ramp", "big mana": "ramp", "counterspells": "counter", "control": "removal",
               "card draw": "draw", "wheels": "draw", "bounce": "removal"}
USEFUL_ROLES = {"ramp", "draw", "removal", "wipe", "tutor", "counter"}
# Score = play rate (blended) + SYN_W x EDHREC synergy + fit. Fit is in the same units (share of decks),
# so a card EDHREC doesn't list can still beat a 15-20% card or a loose stand-in if it clearly fits.
SYN_W = 0.5             # synergy = how much more this commander's decks play the card than usual
FIT_TRIBE = 0.12        # has a type the commander (or its main theme) names, e.g. a Dragon for Ureni
FIT_MECH = 0.05         # per shared mechanic (tokens, sacrifice, +1/+1 counters...), up to 3
FIT_ROLE = (0, 0.03, 0.05)   # ramp/draw/removal/... : one role, two or more
FIT_THEME_ROLE = 0.03   # the role is the theme itself (e.g. ramp for a Big Mana commander)
STRENGTH_W = 0.6        # card strength across all Commander decks (Scryfall's EDHREC rank), a real signal; see strength()
FIT_GC = 0.05           # Game Changers, only in brackets without a cap
FIT_MV = 0.02           # minus this per mana value above 4
# EDHREC weight (app slider 1-4): multiplies the EDHREC part of a non-land card's score (play rate + synergy);
# fit, theme focus and card-to-card synergy keep their weight. 1 = your collection decides, 4 = closest to
# EDHREC's list. The static report is level 3 (x1.0).
EDH_WEIGHT = {1: 0.4, 2: 0.5, 3: 1.0, 4: 1.4}
SPEND_SUFFIX = {2: ""}   # price is information only: decks always use EDHREC's normal pages (the $/$$$ dial is gone)
PICK_ALTS = 3           # owned cards offered to swap in for each of "your picks" (report: the options chooser)
PICK_CLOSE = 0.15       # ...ranked by the builder's value + deck synergy, + this x closeness for a similar job
OFF_LIST = 0.05         # cards below this play rate count as "your pick" rather than "popular"
COMBO_W = {"upgraded": 0.12, "optimized": 0.25, "cedh": 0.25}   # bonus for a combo you own, per bracket
COMBO_BRACKETS = set(COMBO_W)
COMBO_PIECE_MIN = 0.12  # every piece must score this on its own (synergy/fit), not just be in colour
COMBO_MAX = 2           # combos added on purpose per deck (each adds at most COMBO_NEW cards)
COMBO_NEW = 2
_MECH_MEMO = {}

def rules_text(m, drop_keyword_lines=False):
    """Lower-case rules text with the card's own name removed (so "Treasure Vault" isn't a treasure card)."""
    text = (m.get("oracle") or "").replace(" // ", "\n")
    for part in m["name"].split(" // "):
        text = text.replace(part, "~").replace(part.split(",")[0], "~")
    if drop_keyword_lines:        # "Flying, trample" on a commander isn't something it cares about
        kw = {k.lower() for k in m.get("keywords") or []}
        text = "\n".join(l for l in text.split("\n")
                         if not (kw and set(x.strip() for x in l.lower().split(",")) <= kw))
    return text.lower()

def card_mechanics(m):
    k = norm(m["name"])
    if k not in _MECH_MEMO:
        text, tw = rules_text(m), type_words(m)
        _MECH_MEMO[k] = {name for name, (rx, _, types) in MECHANICS.items()
                         if re.search(rx, text) or set(types) & tw}
    return _MECH_MEMO[k]

def commander_profile(cmdr, themes):
    """What the commander cares about: its rules text plus its top 3 EDHREC themes.
    Returns (tribe types, mechanics, roles the theme asks for, named keyword mechanics)."""
    text = rules_text(cmdr, True)
    mechs = {name for name, (rx, _, _) in MECHANICS.items() if re.search(CARES_ABOUT.get(name, rx), text)}
    tribe, roles = set(commander_types(cmdr)), set()
    kws = {k for k in KEYWORD_VOCAB if kw_rx(k).search(text)} \
        | ({k.lower() for k in cmdr.get("keywords") or []} & KEYWORD_VOCAB)
    for t in themes[:3]:
        t = t[0].lower()
        if t in KEYWORD_VOCAB: kws.add(t)                                  # theme "Connive" -> connive
        mechs |= {name for name, (_, th, _) in MECHANICS.items() if t in th}
        if t in THEME_ROLES: roles.add(THEME_ROLES[t])
        for s in (t[:-3] + "f" if t.endswith("ves") else t[:-1] if t.endswith("s") else t, t):
            if s in TYPE_VOCAB and s not in MAIN_TYPES: tribe.add(s)    # "Dragons" -> dragon
    return tribe, mechs, roles, kws

FOCUS_W = 0.15         # theme decks: extra score for cards whose text/types match the chosen theme
THEME_TOP = 4           # archetypes per commander: EDHREC's top themes by deck count, in EDHREC's order
THEME_MISS_DAYS = 7     # a theme page EDHREC doesn't have is asked for again after this many days

def theme_profile(name):
    """What a theme name means in card terms: (tribe, mechanics, roles, keywords), e.g.
    "Discard" -> discard mechanic, "Villains" -> Villain type, "Control" -> removal role."""
    t = name.lower()
    tribe = {s for s in (t[:-3] + "f" if t.endswith("ves") else t[:-1] if t.endswith("s") else t, t)
             if s in TYPE_VOCAB and s not in MAIN_TYPES}
    mechs = {k for k, (_, th, _) in MECHANICS.items() if t in th}
    roles = {THEME_ROLES[t]} if t in THEME_ROLES else set()
    return tribe, mechs, roles, ({t} & KEYWORD_VOCAB)

def hits_theme(m, tp):
    tribe, mechs, roles, kws = tp
    return bool(type_words(m) & tribe or card_mechanics(m) & mechs or roles_of(m) & roles
                or any(has_keyword(m, k) for k in kws))

def fetch_theme_page(path, cache, refresh=False, avg=False, max_days=None):
    """fetch_page for a theme or average-deck page; pages EDHREC doesn't have are remembered for
    THEME_MISS_DAYS (a commander has 3 themes and 5 average decks, so re-asking every run would cost minutes)."""
    miss, mk = cache.setdefault("_theme_miss", {}), ("avg:" if avg else "") + path
    if not refresh and time.time() - miss.get(mk, 0) < THEME_MISS_DAYS * 86400: return None
    p = fetch_page(path, cache, refresh, avg, max_days)
    if p is None and not OFFLINE: miss[mk] = time.time()
    elif p is not None: miss.pop(mk, None)
    return p

DIFF_KEYS = ("pin", "pinx", "decks", "pct", "own_n", "tmpl_n", "n_miss", "rec", "subs", "fill", "pick", "cpc", "gc", "gcn",
             "cmc", "pw", "rd", "core", "mld", "xt", "tut", "basics", "cin", "c2", "bf", "cl", "sw", "bench", "plan")

def page_match(page, owned, me):
    """Collection Match of an EDHREC page, as analyze() computes it: the play-rate weighted share
    of its top <=99 cards (at 10%+ of decks) that you own."""
    rec = sorted(((k, v[1]) for k, v in page["cards"].items() if k != me and v[0] not in BASIC_NAMES),
                 key=lambda x: -x[1])
    tmpl = [x for x in rec if x[1] >= 0.10][:99] or rec[:99]
    tot = sum(r for _, r in tmpl) or 1
    return round(100 * sum(r for k, r in tmpl if k in owned) / tot, 1)

def deck_diff(base_x, tx):
    """A theme deck stored as changes to the normal deck of the same bracket (keeps the page small):
    numbers of the theme deck + cards added + [card, kind] removed."""
    key = lambda e: json.dumps(e)       # whole entry: the same card can carry other options in this deck
    bset, tset = {key(e) for e in base_x["deck"]}, {key(e) for e in tx["deck"]}
    out = {k: tx[k] for k in DIFF_KEYS if k in tx}
    out["add"] = [e for e in tx["deck"] if key(e) not in bset]
    out["rem"] = [e[0] for e in base_x["deck"] if key(e) not in tset]   # a card is in a deck once
    return out

_FIT_MEMO = {"who": None}

FIT_CMDR = 0.12        # the card works with what the commander does by itself (Doom connives every turn ->
                        # "whenever you discard" cards trigger every turn); once per card, Oracle text via ENGINES

FIT_ENGINE = 0.2        # ...the link repeats on both sides at no extra cost: a real engine (Doom connives every turn ->
                        # Feast of Sanity fires every turn for free; Doom drains on land discards <- Tectonic Reformation)
FIT_ONCE = 0.06         # ...one side happens once (a sorcery, an enters/dies trigger, cycling the card itself)
                        # (a link only by card type, e.g. the commander is a creature and the card pumps creatures, keeps FIT_CMDR)
# One ability line of a card: does it happen again and again (static, trigger, activated ability) or once?
ONCE_RX = re.compile(r"^when\b|^(\w+)?cycling\b|^(flashback|madness|escape|unearth|jump-start|retrace|embalm|eternalize|"
                     r"disturb|encore|blitz|dash|evoke)\b")
COST_RX = re.compile(r"you may pay [^.]{0,25}\. if you do|\bpay \{[^}]*\}[^.]{0,15}\. if you do|you may pay \d+ life")
# cost to set the interaction up or repeat it (not per trigger): an activated ability whose cost has mana in it, a granted
# ability with a mana cost ("each land card in your hand has cycling {R}"), equip / reconfigure to each new creature
ACT_COST_RX = re.compile(r"^[^:\"(]*\{(?!t\})[^}]*\}[^:\"(]*:|\b(has|have|gains?) [\w ]{0,15}cycling \{")
EQUIP_RX = re.compile(r"^(equip|reconfigure)\b[^\n(]*?((\{[^}]*\})+)")
_REL_MEMO = {}

def card_relations(m):
    """Per engine, what the card does with it, read ability line by line: {(engine, side): (repeats, cost)}, sides
    "enable" (makes it happen: an outlet, a token maker, a wheel) and "reward" (triggers on it: a payoff).
    repeats = a static, triggered or activated ability (not a one-shot spell, enters/dies trigger or the card's own
    cycling). cost = None (free) or what you pay, kept apart: per trigger ("pays each trigger": "you may pay {1}. If you
    do") or to set it up / repeat it ("{2}, {T}: ...", "has cycling {R}", "equip {1} per creature" for an "equipped
    creature" trigger). A free trigger on an equipment is still a free trigger; moving the equipment is the setup cost."""
    k = norm(m["name"])
    if k not in _REL_MEMO:
        spell = bool({"instant", "sorcery"} & type_words(m))
        lines = [l.strip() for l in rules_text(m).split("\n")]
        eq = next((EQUIP_RX.search(l) for l in lines if EQUIP_RX.search(l)), None)
        out = {}
        for line in lines:
            rep = not spell and not ONCE_RX.search(line)
            setup = ("equip " + eq.group(2) + " per creature" if eq and re.search(r"\b(equipped|attached) creature", line)
                     else "costs mana each time" if ACT_COST_RX.search(line) else None)
            for i, (_, pr, _, co) in enumerate(_ENG_RX):
                for side, rx in (("enable", pr), ("reward", co)):
                    if rx.search(OPP_GETS.sub("", line) if side == "enable" and not _ENG_RX[i][0].startswith("opponents") else line):
                        old = out.get((i, side))
                        new = (rep, "pays each trigger" if side == "reward" and COST_RX.search(line) else setup)
                        if old is None or (bool(new[0]), new[1] is None) > (bool(old[0]), old[1] is None): out[(i, side)] = new
        p, c = card_engines(m)
        for i in p:
            out.setdefault((i, "enable"), (None, None))        # only by its card type (an artifact, a creature, a land)
        for i, repeats in doubler_rep(m).items():
            out[(i, "reward")] = (repeats, None)
        for i in c:
            out.setdefault((i, "reward"), (True, None))
        _REL_MEMO[k] = out
    return _REL_MEMO[k]

def commander_relation(cmdr, m):
    """How card m works with what the commander does by itself: (fit bonus, label) or (0, "").
    Two directions: m rewards what the commander does (Doom connives -> "whenever you discard"), or m enables what the
    commander rewards (Doom drains when you discard a land <- lands with cycling). The bonus is FIT_ENGINE when both
    sides repeat for free, FIT_CMDR when it repeats but someone pays each time (per trigger, or to set it up again:
    an activation, granted cycling, equip), FIT_ONCE when one side happens once. The best link counts; the label says
    which and why, with the cost in words (the numbers stay internal)."""
    if card_kind(m) == "land": return 0.0, ""
    rc, rm = card_relations(cmdr), card_relations(m)
    best = (0.0, "")
    for (i, side), (rep, cost) in rm.items():
        other = ("enable" if side == "reward" else "reward")
        if (i, other) not in rc: continue
        crep, ccost = rc[(i, other)]
        cost = cost or ccost
        lab = _ENG_RX[i][0]
        if rep is None or crep is None: v, how = FIT_CMDR, "by card type"
        elif rep and crep and not cost: v, how = FIT_ENGINE, "repeats"
        elif rep and crep: v, how = FIT_CMDR, "repeats, " + cost
        else: v, how = FIT_ONCE, "once"
        txt = f"{lab} ({'pays off' if side == 'reward' else 'feeds'} the commander, {how})"
        if v > best[0] or (v == best[0] and v and lab not in best[1]):
            best = (v, txt if v > best[0] else best[1] + ", " + txt)
    return best

def commander_link(cmdr, m):
    """Engines where card m consumes what the commander provides, or provides what it consumes
    (e.g. Doom: connive = discard -> Captain Howler, Brallin), as labels; [] when none."""
    cp, cc = card_engines(cmdr)
    p, c = card_engines(m)
    return sorted({_ENG_RX[i][0] for i in (cp & c) | (cc & p) if i < len(_ENG_RX)})

def cmdr_fit(cmdr, m, profile, bracket):
    """card_fit + the commander_relation bonus when the card works with the commander's own engine."""
    f, why = card_fit(m, profile, bracket)
    v, lab = commander_relation(cmdr, m)
    if v:
        f += v
        why = "with commander: " + lab + (" · " + why if why else "")
    return f, why

GEM_FLOOR = 0.35       # hidden gem hitting all the commander's mechanics: valued like a card in 35% of decks
GEM_MAX = 3             # hidden gems per deck that get the floor (best first)

def hidden_gems(cmdr, profile, pool, play_of, bracket):
    """Owned cards EDHREC rarely plays here (< OFF_LIST) that work with the commander's own engine
    (commander_link) and hit 2+ of its mechanics, e.g. Brallin for Doom (discard + drain + +1/+1).
    Low play can mean nobody tried it, a new card or a pricey one, so fit decides: the best GEM_MAX get
    an EDHREC-part floor of GEM_FLOOR x share of the commander's mechanics they hit.
    {key: (floor, [mechanics hit])}."""
    cm = profile[1] & card_mechanics(cmdr)      # what the commander's own text does, not theme names
    if len(cm) < 2: return {}
    cands = []
    for k, m, _, kd in pool:
        if kd == "land" or play_of(k) >= OFF_LIST: continue
        hit = card_mechanics(m) & cm
        if len(hit) >= 2 and commander_link(cmdr, m):
            cands.append((-len(hit), -fit_cached(cmdr, m, profile, bracket)[0], k, sorted(hit)))
    return {k: (GEM_FLOOR * len(hit) / len(cm), hit) for _, _, k, hit in sorted(cands)[:GEM_MAX]}

def fit_cached(cmdr, m, profile, bracket):
    """cmdr_fit, remembered per commander (it only depends on the bracket through Game Changers)."""
    if _FIT_MEMO["who"] != (cmdr["name"], id(profile)):
        _FIT_MEMO.clear(); _FIT_MEMO["who"] = (cmdr["name"], id(profile))
    key = (norm(m["name"]), bracket in ("optimized", "cedh"))
    if key not in _FIT_MEMO: _FIT_MEMO[key] = cmdr_fit(cmdr, m, profile, bracket)
    return _FIT_MEMO[key]

def built_around(profile, cards):
    """How many of the deck's non-land cards hit each thing the commander cares about:
    [[label, count]], biggest first (e.g. [["connive", 9], ["discard", 14]])."""
    tribe, mechs, _, kws = profile
    out = [[t.title(), sum(1 for m in cards if t in type_words(m) or is_changeling(m))] for t in sorted(tribe)]
    out += [[k, sum(1 for m in cards if k in card_mechanics(m))] for k in sorted(mechs)]
    out += [[k, sum(1 for m in cards if has_keyword(m, k))] for k in sorted(kws)]
    return sorted((x for x in out if x[1]), key=lambda x: -x[1])[:6]

def strength(m):
    """0-1: how widely the card is played across all Commander decks (Scryfall's EDHREC rank, 1 = Sol Ring):
    1 - log10(rank)/4, so rank 1 -> 1.0, 100 -> 0.5, 1,000 -> 0.25, 10,000+ -> 0. Commander-independent: it lets
    a bomb your commander's EDHREC page under-plays (Craterhoof 299, Elspeth 809) compete with weak filler."""
    rank = m.get("edhrec_rank")
    return max(0.0, 1 - math.log10(rank) / 4) if rank else 0.0

def card_fit(m, profile, bracket):
    """(fit score, short reason) of an owned non-land card for this commander. Rule-based and
    explainable: shared types/mechanics, useful roles, overall popularity, Game Changer, curve."""
    tribe, mechs, troles, kws = profile
    f, why = 0.0, []
    hit = type_words(m) & tribe
    if hit or (tribe and is_changeling(m) and card_kind(m) == "creature"):
        f += FIT_TRIBE; why.append("/".join(sorted(t.title() for t in hit)) or "changeling")
    shared = sorted(card_mechanics(m) & mechs) + sorted(k for k in kws if has_keyword(m, k))
    if shared:
        f += FIT_MECH * min(3, len(shared)); why.append(", ".join(shared[:3]))
    rs = roles_of(m) & USEFUL_ROLES
    f += FIT_ROLE[min(2, len(rs))]
    if rs & troles: f += FIT_THEME_ROLE
    f += STRENGTH_W * strength(m)
    if m["gc"] and bracket in ("optimized", "cedh"): f += FIT_GC     # B4/B5: no Game Changer cap
    if "win" not in roles_of(m): f -= FIT_MV * max(0, m["cmc"] - 4)  # finishers are allowed to cost a lot
    return max(0.0, f), " · ".join(why)

# ------------------------------------------------------- card-to-card synergy
# What cards do for each other, read from Oracle text (reminder text included, both faces): each
# engine pairs PROVIDERS (a discard outlet, a token maker, a sac outlet...) with CONSUMERS (a discard
# payoff, a token payoff, a death trigger...). A card earns deck synergy for every card already in the
# deck on the other side of an engine; the commander counts SYN_CMDR times. Rules interactions
# (combos) stay Spellbook's job; this is about engines and payoffs.
# Each engine: (label, provider pattern, card types that provide, consumer pattern)
ENGINES = [
    ("discard",
     r"(?<!they )(?<!that player )(?<!opponent )(?<!target player )(?<!each opponent )(?<!whenever you )(?<!if you )"
     r"(?<!causes you to )(?<!cycle or )\bdiscards? (a|an|one|two|three|x|that|those|this|any number of|up to \w+|your hand|cards?)\b|"
     r"\bthen discards?\b|\bconnives?\b|\bcycling\b|by discarding|as an additional cost to cast this spell, discard|"
     r"\beach player discards\b",                                     # wheels: you discard too
     (), r"whenever you (cycle or )?discard|whenever (a player|one or more players) discards|\bmadness\b|"
         r"if you discarded|for each card discarded|causes you to discard|discarded this way"),
    ("graveyard",
     r"\bmills?\b|\bsurveil\b|\bdiscard|\bconnives?\b|put [^.]{0,40}into your graveyard|\bdredge\b",
     (), r"from your graveyard|(put|return)s? [^.]{0,40}from a graveyard (onto|to)|creature card in a graveyard|\bflashback\b|\bescape\b|\bunearth\b|\bdelve\b|\bthreshold\b|\bjump-start\b|"
         r"\bretrace\b|\bembalm\b|\beternalize\b|\bdisturb\b|cards? in your graveyard|\bdescend\b"),
    ("sacrifice",
     r"sacrifice (a|an|another|one or more|any number of|x) [^.:]{0,30}:|, sacrifice (a|an|another) (creature|artifact|permanent)",
     (), r"whenever (a|an|another|one or more) [^.]{0,40}(creatures?|permanents?|artifacts?)[^.]{0,25}\b(dies|die|is put into a graveyard)|"
         r"whenever you sacrifice"),
    ("fodder",
     r"creates? [^.]{0,60}creature tokens?|when [^.]{0,15}~ dies|\bpersist\b|\bundying\b|return ~ from your graveyard",
     (), r"sacrifice (a|an|another|one or more|any number of|x) (creature|nontoken creature|permanent)s?[^.:]{0,20}:|"
         r", sacrifice (a|an|another) creature|whenever (equipped|enchanted) creature dies"),
    ("go wide",
     r"creates? [^.]{0,60}creature tokens?|creates? [^.]{0,30}\b(x|two|three|four|five|that many)\b[^.]{0,30}tokens?|\bpopulate\b",
     ("creature",), r"creatures you control (gain [^.]{0,40}? and )?get \+|for each creature you control|number of creatures you control|"
         r"other creatures you control get \+|creatures you control have|\bconvoke\b|whenever one or more creatures you control attack"),
    ("tokens",
     r"creates? [^.]{0,60}\btokens?\b|\bpopulate\b|\bamass\b|\bincubate\b",
     (), r"tokens? you control|whenever (a|one or more|another) [^.]{0,40}\btokens?\b[^.]{0,20}enters?|\bpopulate\b|"
         r"for each (creature|token) you control|creatures you control get \+"),
    ("+1/+1 counters",
     r"put (a|an|one|two|three|x|that many|\w+) \+1/\+1 counters?|\bconnives?\b|\bproliferate\b|\bbolster\b|\badapt\b|"
     r"\bsupport\b|\bmodular\b|\boutlast\b|\bevolve\b|\bmentor\b|\btraining\b|enters with [^.]{0,20}\+1/\+1 counter",
     (), r"with (a|one or more) \+1/\+1 counters? on (it|them)|for each \+1/\+1 counter|whenever one or more \+1/\+1 counters|"
         r"\bproliferate\b|double the number of [^.]{0,20}counters|counters? on it, put|\bmoves? [^.]{0,20}counters"),
    ("lifegain",
     r"\byou gain \w+ life|\bgain \w+ life|\blifelink\b|you gain life equal",
     (), r"whenever you gain life|if you('ve| have) gained|whenever you gain one or more life"),
    ("spells",
     r"$^", ("instant", "sorcery"),
     r"whenever you cast (an?|your first|your second) (instant|sorcery|noncreature)|instant (and|or) sorcery spells? you cast|"
     r"\bmagecraft\b|\bprowess\b|whenever you cast a noncreature|whenever you cast or copy"),
    ("artifacts",
     r"create[^.]{0,40}\b(treasure|clue|food|blood|map|powerstone|gold|junk|artifact)\b", ("artifact",),
     r"whenever (an?|one or more|another) [^.]{0,25}artifacts? [^.]{0,25}enters|artifacts? you control|for each artifact|"
     r"\baffinity for artifacts\b|\bimprovise\b|\bmetalcraft\b|sacrifice an artifact|artifact creatures? you control|whenever you cast an artifact"),
    ("enchantments",
     r"$^", ("enchantment",),
     r"whenever you cast an enchantment|enchantments? you control|\bconstellation\b|for each enchantment|whenever (an?|another) enchantment [^.]{0,25}enters"),
    ("enter triggers",
     r"when (~|this creature) enters", (),
     r"exile [^.]{0,60}(you control|target creature)[^.]{0,30}\. return (it|that card|them|those cards)|"
     r"then return (it|that card|them|those cards) to the battlefield|triggers an additional time|\bblink\b"),
    ("landfall",
     r"search your library for [^.]{0,40}land cards?[^.]{0,60}onto the battlefield|play an additional land|"
     r"put (a|up to \w+) land cards? [^.]{0,40}onto the battlefield|return [^.]{0,30}land[^.]{0,30}to (its owner's|your) hand",
     (), r"\blandfall\b|whenever a land (you control )?enters|whenever one or more lands (you control )?enter"),
    ("card draw",
     r"\bdraws? (a|an|one|two|three|x|that many|\w+) cards?\b", (),
     r"whenever you draw|draw your second card"),
    # opponents drawing is its own engine: your draw spells don't feed "whenever an opponent draws" punishers
    ("opponents draw",
     r"\beach (other )?(player|opponent) draws|\bthat player draws|\btarget (player|opponent) draws|\bdraws? (an|\w+) additional cards?", (),
     r"whenever (a player|an opponent) draws"),
    # opponents discarding is its own engine: your outlets don't feed "whenever an opponent discards"
    ("opponents discard",
     r"\b(each opponent|target opponent|each player|target player|that player) discards?\b|\bunless they discard\b", (),
     r"whenever (an opponent|a player|one or more players) discards"),
    # discarding land cards is an event of its own (Doom drains on it); land cards themselves feed "lands in hand"
    ("land discard",
     r"land cards? in your hand (have|has) [^.]{0,30}cycling|(?<!whenever you )discard (a|one or more|any number of|x|two) land cards?",
     (), r"whenever you discard (one or more )?land cards?|whenever you discard (one or more )?lands?\b"),
    # Trigger doublers are providers for the same event / permanent scope as their Oracle wording.
    ("doubles enter triggers (any permanent)", r"\bif a permanent entering( the battlefield)? causes? a triggered ability of (a permanent|this creature|a creature|an? \w+) you (control|own) to trigger, that ability triggers an additional time", (), r"$^"),
    ("doubles enter triggers (artifact or creature)", r"\bif an artifact or creature entering( the battlefield)? causes? a triggered ability of (a permanent|this creature|a creature|an? \w+) you (control|own) to trigger, that ability triggers an additional time", (), r"$^"),
    ("doubles enter triggers (land)", r"\bif a land( or bird you control)? entering( the battlefield)? causes? a triggered ability of (a permanent|this creature|a creature|an? \w+) you (control|own) to trigger, that ability triggers an additional time", (), r"$^"),
    ("doubles enter triggers (Bird)", r"\bif a land or bird you control entering( the battlefield)? causes? a triggered ability of (a permanent|this creature|a creature|an? \w+) you (control|own) to trigger, that ability triggers an additional time", (), r"$^"),
    ("doubles enter triggers (Wizard)", r"\bif a wizard you control entering( the battlefield)? causes? a triggered ability of (a permanent|this creature|a creature|an? \w+) you (control|own) to trigger, that ability triggers an additional time", (), r"$^"),
    ("doubles enter/leave triggers (legendary or artifact)", r"\bif a legendary permanent or an artifact entering or leaving the battlefield causes? a triggered ability of (a permanent|this creature|a creature|an? \w+) you (control|own) to trigger, that ability triggers an additional time", (), r"$^"),
    ("doubles death triggers", r"\bif a creature dying causes? a triggered ability of (a permanent|this creature|a creature|an? \w+) you (control|own) to trigger, that ability triggers an additional time", (), r"$^"),
    ("doubles attack triggers", r"\bif a creature attacking causes? a triggered ability of (a permanent|this creature|a creature|an? \w+) you (control|own) to trigger, that ability triggers an additional time", (), r"$^"),
    ("doubles draw triggers", r"\bif a player drawing a card causes? a triggered ability of (a permanent|this creature|a creature|an? \w+) you (control|own) to trigger, that ability triggers an additional time", (), r"$^"),
    ("doubles spell triggers", r"\bif you casting or copying an instant or sorcery spell causes? a triggered ability of (a permanent|this creature|a creature|an? \w+) you (control|own) to trigger, that ability triggers an additional time", (), r"$^"),
    ("doubles lifegain triggers", r"\bif you gaining life causes? a triggered ability of (a permanent|this creature|a creature|an? \w+) you (control|own) to trigger, that ability triggers an additional time", (), r"$^"),
    ("doubles Shaman triggers", r"if a triggered ability of a shaman or another wizard you control triggers", (), r"$^"),
    ("doubles Wizard triggers", r"if a triggered ability of a shaman or another wizard you control triggers", (), r"$^"),
    ("doubles Elemental triggers", r"if a triggered ability of another elemental you control triggers", (), r"$^"),
    ("lands in hand",
     r"$^", (), r"discard (one or more )?land cards?|whenever you discard (one or more )?lands?"),
]
_ENG_RX = [(lab, re.compile(pr), set(ty), re.compile(co)) for lab, pr, ty, co in ENGINES]
SYN_CMDR = 3            # the commander counts as this many cards on each side of its engines
SYN_CAP = 12            # linked cards per engine that count (a 40th discard outlet adds nothing new)
SYN_TOP = 2             # engines counted per card (its strongest links; the reason shows the same two)
SYN_DECK_W = 0.05       # score per unit of deck synergy (sum over engines of sqrt(linked cards))
SWAP_MAX = 30           # synergy swaps per deck at most
SWAP_MARGIN = 0.04      # a swap must gain at least this much (keeps the deck from churning)
SWAP_KEEP = {"removal", "wipe", "counter", "ramp", "tutor", "win"}   # a card doing one of these jobs only
                        # leaves for a card doing the same job (synergy must not eat the interaction)
SWAP_SLACK = 2          # ...but only while that role is at most this many above its ROLE_TARGETS (a surplus can go)
BENCH_SHOW = 8          # "next in line" cards listed per deck
SWAP_POOL = 60          # candidates re-checked per swap (best by score + synergy at the start)
_ENG_MEMO = {}
# a clause where an opponent gets the thing ("Its controller creates a 2/2 Bird"): not something you provide
OPP_GETS = re.compile(r"\b(its controller|its owner|that player|target opponent|each opponent|an opponent|defending player)( then)? (creates?|draws?|gains?|puts?)\b[^.]*")
_DBL_MEMO, _DBL_REP = {}, {}
_TRIG_LINE = re.compile(r"^(when|whenever|at the beginning)\b|\b(when|whenever)\b")

def _repeat_trigger_line(line, m):
    """Own ETB/death triggers are one-time links; repeated events and other abilities can repeat."""
    first = m["name"].split(" // ")[0].split(",")[0].split()[0].lower()
    for match in re.finditer(r"\bwhen(ever)?\b([^.]{0,70}?)\b(enters?|leaves the battlefield|dies)\b", line):
        obj = match.group(2)
        self_ = (re.search(r"(^|\s)(~|this (creature|artifact|enchantment|land|permanent|planeswalker))($|\s)", obj)
                 or re.search(r"(^|\s)" + re.escape(first) + r"($|\s)", obj))
        if self_ and not re.search(r"\b(another|other)\b", obj):
            return False
    return True

def doubler_cons(m):
    """Trigger scopes this card consumes, once per scope; colourless scope awaits 5c mana checks."""
    k = norm(m["name"])
    if k in _DBL_MEMO: return _DBL_MEMO[k]
    idx = {e[0]: i for i, e in enumerate(_ENG_RX)}
    out, reps, tw = set(), {}, type_words(m)
    lines = [l.strip() for l in re.sub(r"\([^)]*\)", "", rules_text(m)).split("\n") if l.strip()]
    trig = [l for l in lines if _TRIG_LINE.search(l)]
    def add(name, repeats):
        i = idx[name]
        out.add(i)
        reps[i] = reps.get(i, False) or repeats
    for line in trig:
        repeats = _repeat_trigger_line(line, m)
        for match in re.finditer(r"\bwhen(ever)?\b([^.]{0,70}?)\b(enters?|leaves the battlefield)\b", line):
            obj = match.group(2)
            first = m["name"].split(" // ")[0].split(",")[0].split()[0].lower()
            self_ = (re.search(r"(^|\s)(~|this (creature|artifact|enchantment|land|permanent|planeswalker))($|\s)", obj)
                     or re.search(r"(^|\s)" + re.escape(first) + r"($|\s)", obj))
            types = tw if self_ else set(re.findall(r"[a-z]+", obj))
            if match.group(3) in ("enter", "enters"):
                add("doubles enter triggers (any permanent)", repeats)
                if types & {"artifact", "creature"}:
                    add("doubles enter triggers (artifact or creature)", repeats)
                if "land" in types: add("doubles enter triggers (land)", repeats)
                if "bird" in types: add("doubles enter triggers (Bird)", repeats)
                if "wizard" in types: add("doubles enter triggers (Wizard)", repeats)
            if types & {"artifact", "legendary"}:
                add("doubles enter/leave triggers (legendary or artifact)", repeats)
        if re.search(r"\blandfall\b", line):
            add("doubles enter triggers (any permanent)", repeats)
            add("doubles enter triggers (land)", repeats)
        if re.search(r"\bwhen(ever)?\b[^.]{0,70}\bdies\b", line):
            add("doubles death triggers", repeats)
        if re.search(r"\bwhen(ever)?\b[^.]{0,70}\battacks?\b", line):
            add("doubles attack triggers", repeats)
        if re.search(r"\bwhen(ever)?\s+(you|a player|any player|each player|an opponent|opponents?|each opponent|target (player|opponent)|that player)\s+draws?\b", line):
            add("doubles draw triggers", repeats)
        if re.search(r"\bmagecraft\b|whenever you cast or copy an instant or sorcery|"
                     r"whenever you cast (a|an|your first) (instant|sorcery|instant or sorcery|noncreature spell|spell)\b", line):
            add("doubles spell triggers", repeats)
        if re.search(r"\bwhen(ever)? you gain life\b", line):
            add("doubles lifegain triggers", repeats)
    if trig:
        repeats = any(_repeat_trigger_line(line, m) for line in trig)
        if "shaman" in tw: add("doubles Shaman triggers", repeats)
        if "wizard" in tw: add("doubles Wizard triggers", repeats)
        if "elemental" in tw: add("doubles Elemental triggers", repeats)
    _DBL_MEMO[k] = frozenset(out)
    _DBL_REP[k] = reps
    return _DBL_MEMO[k]

def doubler_rep(m):
    doubler_cons(m)
    return _DBL_REP[norm(m["name"])]

def card_engines(m):
    """(engines the card provides, engines it consumes), as sets of engine indices."""
    k = norm(m["name"])
    if k not in _ENG_MEMO:
        text, tw = rules_text(m), type_words(m)
        prov, cons, ptext = set(), set(), OPP_GETS.sub("", text)
        for i, (lab, pr, ty, co) in enumerate(_ENG_RX):
            if pr.search(text if lab.startswith("opponents") else ptext) or ty & tw: prov.add(i)
            if co.search(text): cons.add(i)
        cons |= doubler_cons(m)
        if "land" in tw: prov.add(len(_ENG_RX) - 1)          # land cards feed "discard a land card"
        _ENG_MEMO[k] = (frozenset(prov), frozenset(cons))
    return _ENG_MEMO[k]

class DeckSynergy:
    """Running count of providers / consumers per engine in a deck (commander weighted). The
    commander's tribe is one more engine: members feed cards that name the type (the commander
    included), e.g. Villains for Doctor Doom."""
    def __init__(self, cmdr, cards, tribe=()):
        n = len(_ENG_RX) + 1
        self.tribe, self.rx = set(tribe), None
        if self.tribe:
            forms = "|".join(re.escape(t) + "s?" for t in sorted(self.tribe))
            self.rx = re.compile(r"(" + forms + r")")
        self.prov, self.cons, self.memo = [0] * n, [0] * n, {}
        p, c = self.engines(cmdr)
        for i in p: self.prov[i] += SYN_CMDR
        for i in c | {n - 1} if self.tribe else c: self.cons[i] += SYN_CMDR
        for m in cards: self.add(m)
    def engines(self, m):
        k = norm(m["name"])
        if k not in self.memo:
            p, c = card_engines(m)
            if self.tribe:
                t = len(_ENG_RX)
                if type_words(m) & self.tribe or (is_changeling(m) and card_kind(m) == "creature"): p = p | {t}
                if self.rx.search(rules_text(m)): c = c | {t}
            self.memo[k] = (p, c)
        return self.memo[k]
    def add(self, m, sign=1):
        p, c = self.engines(m)
        for i in p: self.prov[i] += sign
        for i in c: self.cons[i] += sign
    def links(self, m, inside=False):
        """[(links, engine label)] for card m against the deck (inside=True: m is in the deck, don't
        count it against itself)."""
        p, c = self.engines(m)
        out = []
        for i in p | c:
            n = (self.cons[i] - (inside and i in c) if i in p else 0) + (self.prov[i] - (inside and i in p) if i in c else 0)
            lab = _ENG_RX[i][0] if i < len(_ENG_RX) else "/".join(sorted(self.tribe))
            if n > 0: out.append((n, lab))
        return out
    def score(self, m, inside=False):
        """The card's SYN_TOP strongest engine links only: touching many engines loosely (City Pigeon: tokens,
        Food, artifacts...) mustn't beat being great at the deck's main plan."""
        top = sorted((math.sqrt(min(n, SYN_CAP)) for n, _ in self.links(m, inside)), reverse=True)[:SYN_TOP]
        return SYN_DECK_W * sum(top)
    def why(self, m):
        ls = sorted(self.links(m), reverse=True)[:2]
        return "synergy: " + ", ".join(f"{lab} ×{n}" for n, lab in ls) if ls else ""

_SUB_MEMO = {}          # stand-in candidates per missing card, reused within one deck build (analyze clears it)

def sub_candidates(mm, rate_of, pool, by_role, tribe=(), ci="WUBRG"):
    """Every owned stand-in for missing card `mm` with its closeness before deck-specific filters:
    [(closeness, key, meta, reason)], best first."""
    key = (id(pool), norm(mm["name"]), frozenset(tribe), "".join(sorted(ci)), getattr(rate_of, "key", id(rate_of)))
    if key in _SUB_MEMO: return _SUB_MEMO[key]
    kind = card_kind(mm)
    mroles = roles_of(mm) - {"land"}
    mtypes = type_words(mm) & set(tribe)
    if kind == "land":
        need = set(mm.get("produced") or []) & set(ci)
        if len(need) < 2: _SUB_MEMO[key] = []; return []   # utility or mono-colour land: a basic does that job
        cands = [it for it in pool if it[3] == "land" and not restricted_mana(it[1])]
    elif mroles:
        seen, cands = set(), []
        for r in sorted(mroles):
            for it in by_role.get(r, []):
                if it[0] not in seen: seen.add(it[0]); cands.append(it)
    else:   # pure synergy piece: same card type, and played with this commander
        cands = [it for it in pool if it[3] == kind and rate_of(it[0]) > 0]
    sims = {}   # Oracle-text likeness (Jaccard of word pairs), via the pool's text index
    if kind != "land":
        sig, idx = text_sig(mm), by_role.get("_text") or {}
        hits = {}
        for bg in sig:
            for it in idx.get(bg, ()):
                h = hits.get(it[0]); hits[it[0]] = (it, (h[1] if h else 0) + 1)
        for k2, (it, cnt) in hits.items():
            sims[k2] = cnt / (len(sig) + len(text_sig(it[1])) - cnt)
        seen = {it[0] for it in cands}
        cands += [it for k2, (it, _) in hits.items() if k2 not in seen and sims[k2] >= TEXT_ALT]
    out = []
    for k, m, rs, kd in cands:
        rate, why = rate_of(k), []
        if kind == "land":
            hit = (set(m.get("produced") or []) & set("WUBRG")) & need
            if need and not hit: continue
            q = len(hit) / len(need) if need else 0.5
            if hit: why.append("makes " + "".join(c for c in "WUBRG" if c in hit))
        else:
            if kd == "land": continue
            shared = rs & mroles
            sim = min(1.0, sims.get(k, 0.0) / TEXT_FULL)
            q = (len(shared) / len(mroles) if mroles else 0.6) if (shared or not mroles) else 0.0
            q = min(1.0, max(q * (0.8 + 0.4 * sim), 0.85 * sim))   # reads alike: closer; reads like it: a candidate
            if kd != kind: q *= 0.6                         # creature vs non-creature
            elif type_group(m["type_line"]).replace("Sorcery", "Instant") != \
                 type_group(mm["type_line"]).replace("Sorcery", "Instant"):
                q *= 0.75                                   # e.g. an instant for an enchantment engine
            q *= max(0.3, 1 - 0.12 * abs(m["cmc"] - mm["cmc"]))
            if mtypes:
                both = type_words(m) & mtypes
                if both or is_changeling(m):
                    why.append(", ".join(sorted(t.title() for t in both)) or "changeling")
                else:
                    q *= OFF_TYPE
                    why.append("not a " + "/".join(sorted(t.title() for t in mtypes)))
            if shared: why.append("same role: " + ", ".join(sorted(shared)))
            if sim >= 0.5: why.append("similar text")
            why.append(f"{int(m['cmc'])} MV")
        if rate > 0: why.append(f"in {round(rate * 100)}% of these decks")
        if q >= SUB_MATCH_MIN:
            out.append((round(q, 4), k, m, " · ".join(why)))
    out.sort(key=lambda x: (-x[0], -rate_of(x[1]), x[1]))   # name breaks ties: same input, same deck
    _SUB_MEMO[key] = out
    return out

def find_subs(mm, rate_of, pool, by_role, used, allow_gc, n=3, penalize=(), tribe=(), ci="WUBRG"):
    """Closest owned stand-ins for missing card `mm`: [(closeness 0-1, key, meta, reason)].
    Closeness = shared roles x same card kind x mana value distance (x Oracle-text likeness), and
    x OFF_TYPE when `mm` has a type the commander cares about (`tribe`, e.g. Dragon) that the stand-in
    lacks. Cards in `used` are skipped; cards in `penalize` (already in the deck) lose 0.15."""
    out = []
    for q, k, m, why in sub_candidates(mm, rate_of, pool, by_role, tribe, ci):
        if k in used or (m["gc"] and not allow_gc): continue
        if k in penalize: q = round(q - 0.15, 4)        # already in the deck: prefer fresh cards
        if q < SUB_MATCH_MIN: continue
        out.append((q, k, m, why))
    if penalize: out.sort(key=lambda x: (-x[0], -rate_of(x[1]), x[1]))
    return out[:n]

def blended_rates(edh, base):
    """Play rate per card on this page. A bracket page with few decklists is pulled toward the
    all-decks page: rate = (n*bracket + SHRINK_DECKS*all) / (n + SHRINK_DECKS), so 56 cEDH lists
    can't outvote 22,000, while a 3,000-deck page mostly speaks for itself."""
    cards = edh["cards"]
    if not base or base is edh:
        return {k: v[1] for k, v in cards.items()}
    n, allc = edh.get("decks") or 0, base["cards"]
    return {k: (n * v[1] + SHRINK_DECKS * (allc.get(k) or (None, 0.0))[1]) / (n + SHRINK_DECKS)
            for k, v in cards.items()}

def role_text(mm):
    if not mm: return ""
    if card_kind(mm) == "land": return "land"
    return ", ".join(sorted(roles_of(mm)))

# ---------------------------------------------------- readiness + bracket fit
# Build Readiness: plain checks on the generated 99 (no invented score). Bracket Fit: the lowest
# bracket the 99 fits under the official Commander Brackets rules we can check from card data.
READY_MV = 3.5          # average mana value of non-land cards at most this
READY_WIN = 3           # win conditions (role "win", WIN_RX_CARD) at least this many; combos listed separately
READY_ODD = 16          # stand-ins + role fill: at most this many of the 64 non-land slots
MLD_RX = re.compile(r"destroy all [^.]*\blands\b|exile all [^.]*\blands\b|sacrifices? (all|each) [^.]*\blands?\b"
                    r"|lands don't untap|lands your opponents control don't untap")
XTURN_RX = re.compile(r"takes? an extra turn")
BRACKET_NUM = {"exhibition": 1, "core": 2, "upgraded": 3, "optimized": 4, "cedh": 5}

# Win plans (Phase C): how a deck means to win, read from the commander's mechanics; each plan has its own finisher test
# (Oracle text). Plan fill makes sure a deck holds READY_WIN of its plan's finishers (complete winning combos count too).
PLAN_MECHS = {"overrun": {"tokens", "+1/+1", "attacking"},          # go wide, then a team pump
              "drain": {"drain", "lifegain", "sacrifice"},  # repeatable life loss / damage to each opponent (spells: burn cards pass the test themselves)
              "voltron": {"equipment"}}                               # one big (commander) threat
# Tight tests: a team pump is one-shot ("until end of turn", Overrun, Craterhoof, Moonshaker), not a static anthem;
# drain/burn hits each opponent for 5+ or scales (X, "for each"/"equal to the number", or repeats: whenever / each upkeep);
# indestructible is not evasion; an evasive creature is a threat only with power 6+.
PLAN_RX = {
    "overrun": re.compile(r"creatures you control (gain [^.]{0,40}? and )?get \+(x|\d+)/\+(x|\d+)[^.]{0,60}until end of turn|"
                          r"until end of turn, creatures you control (gain [^.]{0,40}? and )?get \+(x|\d+)/\+(x|\d+)|"
                          r"creatures you control gain [^.]{0,40}double strike[^.]{0,40}until end of turn"),
    "drain": re.compile(r"(whenever|at the beginning of) [^.]{0,80}(\. if you do, )?(each opponent loses (x|\d+) life|deals? (x|\d+) damage to each opponent)|"
                        r"each opponent loses (x|[5-9]|\d\d) life|deals? (x|[5-9]|\d\d) damage to each opponent|"
                        r"(each opponent loses life|damage to each opponent) equal to|"
                        r"each opponent loses \w+ life for each|deals? \w+ damage to each opponent for each|"
                        r"repeat the following process x times[^.]*\. each opponent loses"),
    "voltron": re.compile(r"(equipped|enchanted) creature (gets \+([2-9x]|\d\d)/\+|has double strike|has [^.]{0,30}can't be blocked)|"
                          r"(equipped|enchanted) creature gets [^.]{0,20}and has [^.]{0,30}(double strike|can't be blocked)|"
                          r"target creature gains double strike"),
    "alt": re.compile(r"\byou win the game\b|(each opponent|target player|that player) loses the game|"
                      r"additional combat phase|double strike and trample"),
}
EVASION_RX = re.compile(r"\b(flying|trample|menace|shadow|horsemanship|fear|intimidate)\b|can't be blocked")
PLAN_KEEP = {"ramp", "removal", "draw", "wipe", "counter", "tutor"}   # plan fill never cuts these
COMBO_MAX_CREATURES = 0.42  # a deck whose non-land cards are more than this share creatures plays combo as backup only
PLAN_NAME = {"overrun": "overrun", "drain": "drain/burn", "voltron": "voltron", "threats": "big threats", "combo": "combo"}
_PLAN_MEMO = {}

def big_threat(m):
    """An evasive creature with power 6+ (indestructible alone isn't evasion)."""
    try: pw = int(m.get("power") or 0)
    except ValueError: return False                 # "*": depends on the game
    return pw >= 6 and "Creature" in m["type_line"].split(" // ")[0] and bool(EVASION_RX.search(rules_text(m)))

def plan_test(plan, m):
    """Is card m a finisher for this plan? "threats" (fallback, also the combo plan's backup) = any plan's finisher,
    an alternate win / extra combat, or a big evasive creature."""
    k = (plan, norm(m["name"]))
    if k not in _PLAN_MEMO:
        if plan in ("threats", "combo"):
            _PLAN_MEMO[k] = big_threat(m) or any(plan_test(p, m) for p in PLAN_RX)
        else:
            _PLAN_MEMO[k] = bool(PLAN_RX[plan].search(rules_text(m)))
    return _PLAN_MEMO[k]

def combo_counts(c, bnum):
    """A complete combo counts as one finisher when it wins by itself (Spellbook "rel": a standalone result;
    entries cached before rel count, as in early_combo) and the bracket allows it."""
    return bool(c.get("rel", 1)) and combo_ok(c, bnum)

def win_plan(cmdr, profile, focus, pool, deck, combo_win, combo_in):
    """(plan, backup). Evidence in order: the archetype's theme (a theme deck plays its theme's plan, whatever the
    commander's top theme says), the commander's own text, its top EDHREC themes; a plan needs READY_WIN owned
    finishers in the pool, ties go to the plan the pool supports best. Then a plan the deck already holds READY_WIN
    finishers for. No such plan: "combo" if a winning combo is complete in the deck and creatures are at most
    COMBO_MAX_CREATURES of its non-land cards, else "big threats".
    Backup = the next plan, else "combo" (if one is allowed here), else big threats."""
    support = {p: sum(1 for _, m, _, kd in pool if kd != "land" and plan_test(p, m)) for p in PLAN_MECHS}
    levels = [theme_profile(focus)[1] if focus else set(), profile[1] & card_mechanics(cmdr), profile[1]]
    order = []
    for lv in levels:
        for p in sorted((p for p in PLAN_MECHS if PLAN_MECHS[p] & lv and support[p] >= READY_WIN),
                        key=lambda p: -support[p]):
            if p not in order: order.append(p)
    held = {p: sum(1 for m in deck if plan_test(p, m)) for p in PLAN_MECHS}
    for p in sorted((p for p in PLAN_MECHS if held[p] >= READY_WIN), key=lambda p: -held[p]):
        if p not in order: order.append(p)
    if not order:
        crs = sum(1 for m in deck if "Creature" in m["type_line"].split(" // ")[0]) / max(1, len(deck))
        if combo_in and crs <= COMBO_MAX_CREATURES: return "combo", "threats"
        return "threats", ("combo" if combo_win else None)
    return order[0], order[1] if len(order) > 1 else ("combo" if combo_win else "threats")

def readiness(roles, avg_cmc, odd, sources, win=None):
    """[[check, value, target, passed]]; sources = {colour: lands making it} (empty for colourless).
    `win` = the win plan's finishers + complete winning combos (else every card with role "win")."""
    out = [[r, roles.get(r, 0), t, roles.get(r, 0) >= t] for r, t in ROLE_TARGETS.items()]
    out.append(["mv", avg_cmc, READY_MV, avg_cmc <= READY_MV])
    if len(sources) >= 2:
        need = max(8, 20 // len(sources))
        c, v = min(sources.items(), key=lambda kv: (kv[1], kv[0]))
        out.append(["src", f"{c} {v}", need, v >= need])
    out.append(["odd", odd, READY_ODD, odd <= READY_ODD])
    w = roles.get("win", 0) if win is None else win
    out.append(["win", w, READY_WIN, w >= READY_WIN])
    return out

# Official Commander Brackets rules on combos (Wizards, Feb 2025; unchanged by the Feb 2026 update):
#   B1-B2: no intentional two-card infinite combos.  B3: none in the early game.  B4-B5: anything.
# Three-card combos aren't restricted. "Early game" has no number in the rules; for B3/B4 we use
# Commander Spellbook's reading (estimate_bracket in commander-spellbook-backend, MIT): a two-card
# combo forces B4 when it is relevant (a standalone result, e.g. win the game / infinite damage), has
# no notable prerequisite, and its mana value needed (Spellbook's manaValueNeeded) is EARLY_MV or less
# (speed >= 4). B1-B2 still ban every two-card infinite.
EARLY_MV = 4
XTURN_CAP = 1          # B1-B3: extra turns "in low quantities, not chained": one extra-turn card can't chain
TAG_NAME = {"E": "Exhibition", "C": "Core", "O": "Oddball", "P": "Powerful", "S": "Spicy", "R": "Ruthless", "B": "Banned"}

def two_card_infinite(c):
    """The commander counts as one of the two; an extra condition ("an instant that untaps a
    creature") counts as a card too."""
    return bool(c.get("inf")) and len(c["cards"]) + len(c.get("req") or []) <= 2

def early_combo(c):
    """Spellbook's B4 combo: relevant, definitely two cards (a notable prerequisite counts as one more),
    speed >= 4. Entries cached before "rel"/"np" were stored count as relevant (the old, stricter rule).
    shortcut: Spellbook also adds 1 speed when its mana figure isn't an accurate minimum; the API doesn't expose that flag."""
    return (two_card_infinite(c) and c.get("rel", 1) and not c.get("np")
            and (c.get("mv") or 0) <= EARLY_MV)

def combo_ok(c, bnum):
    """May this combo be complete in a deck for bracket `bnum` (None = all decks: no rule)?
    Only called for combos known to be complete (conditions resolved via combo_done)."""
    if bnum is None or bnum >= 4 or not two_card_infinite(c): return True
    return bnum == 3 and not early_combo(c)

def combo_need(c):
    """Lowest bracket that allows this combo: B1-B2 official ban, B3/B4 by Spellbook's speed rule."""
    if not two_card_infinite(c): return 2
    return 4 if early_combo(c) else 3

def combo_text(c):
    sat = c.get("sat") or {}
    s = " + ".join(c["cards"] + [f"{r} ({', '.join(sat[r][:2])}{'…' if len(sat[r]) > 2 else ''})"
                                 if sat.get(r) else f"({r})" for r in c.get("req") or []])
    if two_card_infinite(c):
        s += f": two-card infinite, {c.get('mv') or 0} mana needed ({'B3: late or not game-winning' if combo_need(c) == 3 else 'early game, B4'})"
    if c.get("bt"): s += f" · Spellbook: {TAG_NAME.get(c['bt'], c['bt'])}"
    return s

def bracket_fit(x, deck_combos=(), possible=()):
    """Lowest bracket this deck fits under the official rules, with reasons. B1 and B2 differ by
    intent, not card rules, so the lowest answer is 2. B5 (cEDH) is about the field, so the
    highest answer is 4. `deck_combos` = combos complete in the deck; `possible` = two-card infinites
    whose condition can't be resolved to cards."""
    est, why = 2, []
    if x["gc"] > 3: est = 4; why.append(f"{x['gc']} Game Changers (B3 allows 3)")
    elif x["gc"]: est = 3; why.append(f"{x['gc']} Game Changer{'s' if x['gc'] > 1 else ''} (B1-2 allow none)")
    if x.get("mld"): est = 4; why.append("mass land denial: " + ", ".join(x["mld"]))
    if len(x.get("xt") or []) > XTURN_CAP: est = 4; why.append("extra turns could chain: " + ", ".join(x["xt"]))
    bad = sorted((c for c in deck_combos if two_card_infinite(c)), key=lambda c: (-combo_need(c), -c.get("pop", 0)))
    for c in bad: est = max(est, combo_need(c))
    why += [combo_text(c) for c in bad[:3]]
    if len(bad) > 3: why.append(f"+{len(bad) - 3} more two-card infinites")
    why += ["possible: " + combo_text(c) + " if the deck has " + " and ".join(c["req"]).lower()
            for c in possible][:2]
    return {"est": est, "why": why}

def enters_tapped(m):
    """Always enters tapped (Guildgates, Temples). Shocks, checklands, snarls... are conditional."""
    return bool(re.search(r"(^|\n|\. )(this land|~|it) enters (the battlefield )?tapped\.", rules_text(m)))

RESTRICTED_MANA = re.compile(r"spend (this|that) mana only|energy|devoid|colorless spells?|activate only|"
                             r"counter (on|from)|\{(\d|[wubrg]/[wubrg])\}, \{t\}|\{t\}, (pay \{|remove|sacrifice)")

def restricted_mana(m):
    """Colour mana with strings attached: creature-type or energy lands, filters, storage lands..."""
    return bool(RESTRICTED_MANA.search(rules_text(m)))

def owned_duals(pool, ci, used, n_lands, n_tapped):
    """Your lands that make 2+ of the commander's colours, best first (more colours, untapped),
    up to LAND_TARGET - MIN_BASICS non-basic lands and TAPPED_MAX always-tapped ones."""
    if len(ci) < 2: return []
    room = LAND_TARGET - MIN_BASICS - n_lands
    cands = []
    for k, m, _, kd in pool:
        hits = len(set(m.get("produced") or []) & ci)
        if kd != "land" or k in used or hits < 2 or restricted_mana(m): continue
        tapped = enters_tapped(m)
        cands.append((-(min(hits, 3) + (0 if tapped else 2)), k, m, tapped))
    out = []
    for _, k, m, tapped in sorted(cands, key=lambda x: x[:2]):
        if len(out) >= room: break
        if tapped and n_tapped >= TAPPED_MAX: continue
        out.append(m); n_tapped += tapped
    return out

UNLISTED = 0.5          # an owned card EDHREC doesn't list: valued at this x the page's lowest listed rate

def card_values(edh, base, owned, name_meta, ew=1.0):
    """(rate_of, play_of, value_of) for one EDHREC page: the play rate as EDHREC shows it, the rate
    used for choosing (non-lands blended with the all-decks page; lands keep the page's own rate, they
    only compete with lands), and play rate + SYN_W x EDHREC synergy (lands: rate only), x `ew`
    (EDH_WEIGHT) for non-lands."""
    cards = edh["cards"]
    rate_of = lambda k: (cards.get(k) or (None, 0.0))[1]
    rate_of.key = id(cards)
    blend = blended_rates(edh, base)
    kind_of = lambda k: card_kind(owned.get(k) or name_meta.get(k) or {"type_line": ""})
    def syn_of(k):          # EDHREC synergy from this page, else the all-decks page (v3 pages have none)
        for page in (edh, base or edh):
            v = page["cards"].get(k)
            if v and len(v) > 2 and v[2] is not None: return v[2]
        return 0.0
    play_of = lambda k: rate_of(k) if kind_of(k) == "land" else blend.get(k, 0.0)
    # EDHREC lists a commander's cards down to ~5% of decks (median lowest listed rate 4.8%), so an owned card
    # missing from both pages is played somewhere below that: valued at UNLISTED x the lowest listed rate, not 0
    allc = (base or edh)["cards"]
    floor = UNLISTED * min((v[1] for v in allc.values() if v[1] > 0), default=0.0)
    est = lambda k: floor if k in owned and k not in cards and k not in allc else play_of(k)
    value_of = lambda k: play_of(k) if kind_of(k) == "land" else ew * (est(k) + SYN_W * syn_of(k))
    return rate_of, play_of, value_of

# ------------------------------------------------------------ unused cards
HOME_MIN = 0.12         # a commander is a "home" for a card if the card scores at least this there
HOMES = 3               # homes shown per card

def find_homes(cmdrs, owned, name_meta, used, T):
    """Where every card you own (commander-legal, no basics) would fit best, best home first. The page decides live which
    cards are unused (copies you own vs your saved decks, or the suggested 99s when you have none); `used` (your decks at
    build time, else the suggested 99s) only sets the counts printed by the run.
    cmdrs = [(DATA index, commander meta, all-decks EDHREC page, names in its suggested 99)].
    Score is the deck builder's own (play rate + synergy + fit), on the all-decks page."""
    cand = {k: m for k, m in owned.items() if m["commander_legal"]
            and m["name"] not in BASIC_NAMES and m["layout"] not in ("token", "emblem")}
    homes = {k: [] for k in cand}
    for i, m, page, names in cmdrs:
        ci, me = set(m["ci"]), norm(m["name"])
        prof = commander_profile(m, page.get("tags") or [])
        rate_of, _, value_of = card_values(page, page, owned, name_meta)
        for k, c in cand.items():
            if k == me or not set(c["ci"]) <= ci: continue
            f, why = (0.0, "") if card_kind(c) == "land" else cmdr_fit(m, c, prof, "all")
            sc = value_of(k) + f
            if sc >= HOME_MIN: homes[k].append((sc, i, rate_of(k), why, k in names))
    rows = []
    for k, L in homes.items():
        L.sort(key=lambda h: (-h[0], h[1]))
        rows.append((L[0][0] if L else -1.0, k, L[:HOMES]))
    rows.sort(key=lambda r: (-r[0], r[1]))
    in_any = set().union(*(names for _, _, _, names in cmdrs)) if cmdrs else set()
    unused = set(cand) - used
    return {"n_unused": len(unused), "n_home": sum(1 for _, k, L in rows if L and k in unused), "n_sugg": len(unused & in_any),
            "cards": [[T.add(cand[k]["name"], cand[k]), [[i, round(r * 100), why, int(ind)] for _, i, r, why, ind in L]]
                      for _, k, L in rows]}

# --------------------------------------------------------------- analysis
def power_profile(roles, gc, avg_cmc):
    clamp = lambda v: max(0, min(10, int(v)))
    return {"speed": clamp(10 - avg_cmc),
            "interaction": clamp(roles.get("removal", 0) + roles.get("wipe", 0) + roles.get("counter", 0)),
            "ramp": clamp(roles.get("ramp", 0)), "draw": clamp(roles.get("draw", 0)),
            "tutor": clamp(roles.get("tutor", 0) * 3), "gc": clamp(gc * 3), "combo": 0}

def analyze(cmdr, edh, owned, name_meta, pool_info, bracket, T, base=None, combos=None, focus=None,
            want_gaps=True, profile=None, show=None, ew=1.0, pins=None, optc=None):
    """`base` = the commander's all-decks page, used to steady small bracket pages.
    `combos` = combos you own in these colours (combos_for_commander()["own"]).
    `focus` = a theme name ("Discard"): cards matching it score FOCUS_W more (theme decks).
    `want_gaps` = False skips the gaps list (theme decks show the overview's). `profile` = the
    commander's profile (computed once per commander by the caller; else from the page's themes).
    `show` = real play rates (average decks): order and label the gaps instead of the page's rates.
    `ew` = EDHREC weight (EDH_WEIGHT[level]): how much EDHREC's numbers count against fit and synergy.
    `pins` = (keys always included, keys never used) for this commander (pins.json): excluded cards leave the
    pool (no pick, substitute, option or combo uses them); included ones go in first, kind "k", unless a bracket
    rule forbids them (then listed in x["pinx"] with the reason) and synergy swaps never take them out.
    `optc` = a dict shared by the decks of one commander + bracket: each card's swap options are built once (by the
    overview deck, built first) and reused by its theme / average decks (display only; the 99 never depends on it)."""
    ci, me = set(cmdr["ci"]), norm(cmdr["name"])
    _SUB_MEMO.clear()
    tribe = commander_types(cmdr)
    profile = profile or commander_profile(cmdr, (base or edh).get("tags") or [])
    tprof = theme_profile(focus) if focus else None
    pool, by_role = pool_info
    pin_in, pin_out = pins or ((), ())
    if pin_out:                         # "never use": out of this deck's pool everywhere
        keep = lambda L: [it for it in L if it[0] not in pin_out]
        pool = keep(pool)
        by_role = {r: ({bg: keep(L2) for bg, L2 in L.items()} if r == "_text" else keep(L)) for r, L in by_role.items()}
    legal = {it[0] for it in pool}      # owned, commander-legal, inside the color identity
    gc_cap = GC_CAP.get(bracket)        # None = no cap
    chosen, lands = [], []
    def gc_room():
        return gc_cap is None or sum(1 for m, _, _ in chosen + lands if m["gc"]) < gc_cap
    cards = edh["cards"]
    rate_of, play_of, value_of = card_values(edh, base, owned, name_meta, ew)
    gems = hidden_gems(cmdr, profile, pool, play_of, bracket)
    fits = {}
    def score(k):           # an owned card: EDHREC value (a hidden gem's has a floor) + how well it fits this commander
        if k not in fits:
            m = owned[k]
            fits[k] = (0.0, "") if card_kind(m) == "land" else fit_cached(cmdr, m, profile, bracket)
            if tprof and card_kind(m) != "land" and hits_theme(m, tprof):
                fits[k] = (fits[k][0] + FOCUS_W, ("theme: " + focus.lower() + (" · " + fits[k][1] if fits[k][1] else "")))
            if k in gems:
                fits[k] = (fits[k][0], "hidden gem: " + " + ".join(gems[k][1]) + " · " + fits[k][1])
        return (max(value_of(k), gems[k][0]) if k in gems else value_of(k)) + fits[k][0]
    rec = [(k, v[0], v[1]) for k, v in cards.items() if k != me and v[0] not in BASIC_NAMES]
    rec.sort(key=lambda x: -x[2])
    template = [x for x in rec if x[2] >= 0.10][:99] or rec[:99]
    tot_w = sum(x[2] for x in template) or 1
    own_w = sum(x[2] for x in template if x[0] in owned)
    own_n = sum(1 for x in template if x[0] in owned)
    missing = [x for x in template if x[0] not in owned]
    if show:
        missing = sorted(((k, nm, show.get(k, 0.0)) for k, nm, _ in missing), key=lambda x: -x[2])

    # 1+2) One ranked list: cards you own at their own play rate, and popular cards you don't own at
    # (their play rate x how close your best stand-in is x STANDIN). A close copy of a 75% card
    # beats a real 26% card; a loose copy of a 32% card doesn't. Missing cards start at their full rate (an upper bound) and get
    # their exact value the first time they reach the top, so the closest stand-in is only searched
    # for cards that could win a slot.
    nonland = 99 - LAND_TARGET
    used, sub_for, heap, n_combos = {me}, {}, [], 0
    for i, (k, name, _) in enumerate(rec):
        if k in legal:
            heapq.heappush(heap, (-score(k), i, k, None))
        elif k not in owned and play_of(k) >= SUB_MIN and name_meta.get(k):
            heapq.heappush(heap, (-value_of(k), i, k, None))
    # owned cards EDHREC doesn't list compete too, if they share a type or mechanic with the
    # commander (cards that only have a role wait for the role fill below)
    i = len(rec)
    for k, m, _, kd in pool:
        if k in cards or kd == "land": continue
        score(k)
        if fits[k][1]:
            heapq.heappush(heap, (-score(k), i, k, None)); i += 1
    # bracket rules on the cards themselves: combos too strong for the bracket never get completed,
    # B1-B3 get no mass land denial and at most one extra-turn card
    bnum = BRACKET_NUM.get(bracket)
    ok_card = lambda x: x == me or x in legal
    live = [c for c in combos or [] if all(ok_card(norm(x)) for x in c["cards"])
            and all((c.get("sat") or {}).get(r) and any(ok_card(norm(y)) for y in c["sat"][r])
                    for r in c.get("req") or [])]
    by_card = {}                 # named pieces and cards that meet a condition -> combos they're part of
    for c in live:
        for x in set(map(norm, c["cards"])) | {norm(y) for r in c.get("req") or [] for y in c["sat"][r]}:
            if ok_card(x): by_card.setdefault(x, []).append(c)
    state = {"xt": 0}
    def blocked(k):
        """Would adding owned card k break this bracket's rules?"""
        if bnum is None: return False
        m = owned[k]
        if bnum <= 3 and (is_mld(m) or (is_xturn(m) and state["xt"] >= XTURN_CAP)): return True
        have = used | {k}
        return any(not combo_ok(c, bnum) for c in by_card.get(k, [])     # k would complete a combo
                   if combo_done(c, have) and not combo_done(c, used))   # the rules forbid
    def note(k):            # call after adding k
        if bnum is None: return
        state["xt"] += is_xturn(owned[k])

    # your pins first: "always include" cards, as long as the bracket's rules allow them
    pin_miss = []
    for k in sorted(pin_in):
        m = owned.get(k)
        why = ("not in your collection" if not m else "not legal or outside the commander's colours" if k not in legal
               else "Game Changer limit for this bracket" if m["gc"] and not gc_room()
               else "breaks this bracket's rules (combo, land denial or extra turns)" if blocked(k) else "")
        if k == me: continue
        if why: pin_miss.append([T.add(m["name"], m) if m else T.add(k), T.s(why)]); continue
        (lands if card_kind(m) == "land" else chosen).append((m, "k", "pinned by you")); used.add(k); note(k)
    # combos you own go in whole, valued at their weakest piece + COMBO_W: every piece must earn a
    # slot on its own synergy/fit, and the combo must be allowed in this bracket
    if bracket in COMBO_BRACKETS:
        for c in live:
            ks, req = [norm(x) for x in c["cards"]], c.get("req") or []
            if len(req) > 1 or len(ks) + len(req) > 3 or not combo_ok(c, bnum): continue
            pieces = [x for x in ks if x != me]
            extra = None         # the best card you own that meets the condition (e.g. a persist creature)
            if req:
                sat = [norm(y) for y in c["sat"][req[0]]]
                if me not in sat:
                    extra = max((y for y in sat if y in legal), key=lambda y: (score(y), y), default=None)
                    if extra is None: continue
            low = min([score(x) for x in pieces + ([extra] if extra else [])] or [0])
            if low < COMBO_PIECE_MIN: continue
            v = low + COMBO_W[bracket]
            heapq.heappush(heap, (-v, i, "combo:" + c["id"], (tuple(pieces), extra, c))); i += 1
    while heap and (len(chosen) < nonland or len(lands) < MAX_LANDS):
        v, i, k, sk = heapq.heappop(heap)
        v = -v
        if k.startswith("combo:"):                       # a combo package
            pieces, extra, c = sk
            new = [x for x in pieces if x not in used]
            if extra and extra not in used and not combo_done(c, used | set(new)): new.append(extra)
            if not new or len(new) > COMBO_NEW or n_combos >= COMBO_MAX: continue
            nl = [x for x in new if card_kind(owned[x]) == "land"]
            gcs = sum(1 for x in new if owned[x]["gc"])
            if len(chosen) + len(new) - len(nl) > nonland or len(lands) + len(nl) > MAX_LANDS: continue
            if gc_cap is not None and sum(1 for m, _, _ in chosen + lands if m["gc"]) + gcs > gc_cap: continue
            trial, fine = [], True
            for x in new:                                # check the pieces in order, as if added
                if blocked(x): fine = False; break
                used.add(x); trial.append(x)
            used.difference_update(trial)
            if not fine: continue
            for x in new:
                (lands if x in nl else chosen).append((owned[x], "c", None)); used.add(x); note(x)
            n_combos += 1
            continue
        if k in owned:                                   # a card you own, on its own merit
            m = owned[k]
            if k in used or (m["gc"] and not gc_room()) or blocked(k): continue
            kind, why = ("p", None) if rate_of(k) >= OFF_LIST else ("y", fits[k][1] or None)
            if card_kind(m) == "land":
                if len(lands) < MAX_LANDS and v >= 0.15:
                    lands.append((m, "p", None)); used.add(k); note(k)
            elif len(chosen) < nonland:
                chosen.append((m, kind, why)); used.add(k); note(k)
            continue
        mm = name_meta[k]                                # a card you're missing
        is_land = card_kind(mm) == "land"
        if (is_land and len(lands) >= MAX_LANDS) or (not is_land and len(chosen) >= nonland): continue
        if sk is None or sk in used or (owned[sk]["gc"] and not gc_room()) or blocked(sk):
            subs = [x for x in find_subs(mm, rate_of, pool, by_role, used, gc_room(), 3, tribe=tribe, ci=ci)
                    if not blocked(x[1])][:1]
            if not subs: continue
            # lands only compete with lands, and making the right colours is the whole job
            exact = value_of(k) * subs[0][0] * (1 if is_land else STANDIN)
            if exact >= (0.15 if is_land else 0):
                heapq.heappush(heap, (-exact, i, k, subs[0][1]))
            continue
        used.add(sk); sub_for[k] = sk                    # still the top offer at its exact value
        (lands if is_land else chosen).append((owned[sk], "s", mm)); note(sk)

    # 3) still short: fill by role need (ramp, draw, removal, wipes), then best leftovers
    if len(chosen) < nonland:
        counts = {r: 0 for r in ROLE_TARGETS}
        for m, _, _ in chosen:
            for r in roles_of(m):
                if r in counts: counts[r] += 1
        fill = [(k, m, rs) for k, m, rs, kd in pool
                if k not in used and kd != "land" and (gc_cap != 0 or not m["gc"])]
        fill.sort(key=lambda it: (-score(it[0]), it[1]["cmc"], it[0]))
        def take(it, role=None):
            chosen.append((it[1], "f", role)); used.add(it[0]); note(it[0])
            for r in it[2]:
                if r in counts: counts[r] += 1
        ok = lambda it: it[0] not in used and (not it[1]["gc"] or gc_room()) and not blocked(it[0])
        for role, target in ROLE_TARGETS.items():
            for it in fill:
                if len(chosen) >= nonland or counts[role] >= target: break
                if ok(it) and role in it[2]: take(it, role)
        for it in fill:
            if len(chosen) >= nonland: break
            if ok(it): take(it, "99 cards")        # no role short: the best leftover, to reach 99

    # 3b) synergy swaps: an owned card that feeds (or is fed by) many cards already in the deck replaces
    # the weakest pick, popular card or role fill, by score + deck synergy. Role counts that are at or
    # below their target are protected; combo pieces and substitutes stay.
    swaps = []
    syn = DeckSynergy(cmdr, [m for m, _, _ in chosen], profile[0])
    rcount = {r: sum(1 for m, _, _ in chosen if r in roles_of(m)) for r in ROLE_TARGETS}
    def total(m, inside):
        return score(norm(m["name"])) + syn.score(m, inside)
    cands = sorted(((k, m) for k, m, _, kd in pool if kd != "land" and k not in used),
                   key=lambda it: -total(it[1], False))[:SWAP_POOL]
    def weakest_for(m, skip=()):
        """The weakest card candidate m may replace: (index in chosen, its total) or (None, None).
        A card doing a SWAP_KEEP job is kept while that role is short or near its target (+SWAP_SLACK);
        a surplus (e.g. 16 ramp for a target of 10) can make room for anything."""
        rs, out, ov = roles_of(m), None, None
        for j, (dm, kind, _) in enumerate(chosen):
            if j in skip or kind not in "pyf" or (dm["gc"] and not m["gc"]): continue
            dk = norm(dm["name"])
            if dk in swapped_in: continue                                        # no churn: swaps stay
            if any(combo_done(c, used) for c in by_card.get(dk, [])): continue    # completes a combo here
            drs = roles_of(dm)
            kept = {r for r in drs & SWAP_KEEP if r not in ROLE_TARGETS or rcount[r] <= ROLE_TARGETS[r] + SWAP_SLACK}
            if "ramp" in drs: kept.discard("tutor")      # land fetchers (Cultivate) are ramp, not tutors
            if kept and not kept & rs: continue
            jobs = drs & SWAP_KEEP - ({"tutor"} if "ramp" in drs else set())
            # a job card goes only if it's the weakest of its job in the deck (a ramp surplus loses its weakest rock, never Sol Ring)
            if any(score(dk) > min(score(norm(c["name"])) for c, _, _ in chosen if r in roles_of(c)) for r in jobs): continue
            if any(rcount[r] <= ROLE_TARGETS[r] and r not in rs for r in drs if r in rcount): continue
            v = total(dm, True)
            if ov is None or v < ov: out, ov = j, v
        return out, ov
    skip, swapped_in = set(), set()     # skip: no room or breaks the rules; also cards swapped out (no return)
    def do_swap(out, k, m, why):
        """Put owned card k in place of chosen[out]; (card out, why) or None if k then breaks the bracket rules."""
        dm = chosen[out][0]
        dk = norm(dm["name"])
        used.discard(dk); syn.add(dm, -1)
        if bnum is not None: state["xt"] -= is_xturn(dm)
        if blocked(k):                               # without dm the rules still hold for k?
            used.add(dk); syn.add(dm); state["xt"] += is_xturn(dm) if bnum is not None else 0
            skip.add(k); return None
        rs, w = roles_of(m), why()
        chosen[out] = (m, "y", w); used.add(k); note(k); syn.add(m)
        for r in rcount: rcount[r] += (r in rs) - (r in roles_of(dm))
        swapped_in.add(k); skip.add(dk)
        return dm, w
    for _ in range(SWAP_MAX):
        # best candidates first; one that finds no room doesn't stop the others from trying
        order = sorted(((total(m, False), k, m) for k, m in cands if k not in used and k not in skip
                        and not (m["gc"] and not gc_room()) and not blocked(k)), key=lambda t: (-t[0], t[1]))
        swapped, room = False, {}          # weakest_for depends only on the candidate's roles + GC flag this round
        for bv, k, m in order:
            rk = (frozenset(roles_of(m)), m["gc"])
            if rk not in room: room[rk] = weakest_for(m)
            out, ov = room[rk]
            if out is None or bv < ov + SWAP_MARGIN: continue
            done = do_swap(out, k, m, lambda: syn.why(m))
            if not done: continue
            swaps.append([T.add(m["name"], m), T.add(done[0]["name"], done[0]), T.s(done[1])])
            swapped = True
            break
        if not swapped: break

    # 3c) win plan: the deck needs READY_WIN finishers for its plan (complete winning combos count). Short: the best
    # plan finishers (score + deck synergy) replace the weakest unprotected card, like the swaps (same rules, (a2) too).
    plan, backup = win_plan(cmdr, profile, focus, pool, [m for m, _, _ in chosen], any(combo_counts(c, bnum) for c in live),
                            any(combo_counts(c, bnum) and combo_done(c, used) for c in live))
    is_fin = lambda m: plan_test(plan, m)
    def win_count():        # (plan finishers, total incl. complete winning combos)
        n = sum(1 for m, _, _ in chosen if is_fin(m))
        return n, n + sum(1 for c in live if combo_counts(c, bnum) and combo_done(c, used))
    def combo_partner(dk):  # dk is a piece of an allowed combo and another named piece is already in the deck
        return any(combo_ok(c, bnum) and any(norm(x) in used and norm(x) != dk for x in c["cards"])
                   for c in by_card.get(dk, []))
    plan_fill = []
    nf, have = win_count()
    if have < READY_WIN or nf < 1:        # also: at least one finisher that isn't a combo, as the backup
        for _, k, m in sorted(((total(m, False), k, m) for k, m, _, kd in pool
                               if kd != "land" and k not in used and is_fin(m)), key=lambda t: (-t[0], t[1])):
            if have >= READY_WIN and nf >= 1: break
            if k in used or blocked(k) or (m["gc"] and not gc_room()): continue
            # it must belong here, like an unlisted pick: EDHREC plays it here, it shares a type / mechanic / engine with
            # the commander, or it links to cards in the deck (a colourless drain artifact alone doesn't qualify)
            score(k)
            if play_of(k) < OFF_LIST and not fits[k][1] and not syn.why(m): continue
            # never a finisher, a card doing a core job (a finisher doesn't replace interaction or mana), a piece of a
            # combo this bracket allows whose other piece is already here (complete or not), or in a theme deck a card
            # matching the theme
            out = weakest_for(m, {j for j, (dm, _, _) in enumerate(chosen)
                                  if is_fin(dm) or roles_of(dm) & PLAN_KEEP or combo_partner(norm(dm["name"]))
                                  or (tprof and hits_theme(dm, tprof))})[0]
            if out is None: continue
            done = do_swap(out, k, m, lambda: "finisher: " + PLAN_NAME[plan])
            if not done: continue
            plan_fill.append([T.add(m["name"], m), T.add(done[0]["name"], done[0])])
            nf, have = win_count()
    # still short (no owned finisher fits): never a stand-in; the most played missing finishers are named as upgrades
    plan_up = []
    if have < READY_WIN:
        plan_up = [T.add(name_meta[k]["name"], name_meta[k]) for k, _, _ in sorted(
            ((k, v, play_of(k)) for k, v in cards.items() if k not in owned and name_meta.get(k)
             and set(name_meta[k]["ci"]) <= ci and card_kind(name_meta[k]) != "land" and is_fin(name_meta[k])),
            key=lambda t: (-t[2], t[0]))[:3]]
    # next in line: the owned cards that came closest, with why (so a near miss is visible, not silent)
    bench = sorted(((total(m, False), k, m) for k, m in cands if k not in used and not blocked(k)
                    and (not m["gc"] or gc_room())), key=lambda t: (-t[0], t[1]))[:BENCH_SHOW]
    taken_out = {j for j, (dm, _, _) in enumerate(chosen) if is_fin(dm)}
    def swap_out(m):        # the card this one would replace (weakest_for: same protections as the swaps; each a different card), or -1
        j = weakest_for(m, taken_out)[0]
        if j is None: return -1
        taken_out.add(j)
        return T.add(chosen[j][0]["name"], chosen[j][0])
    bench = [[T.add(m["name"], m), T.s(syn.why(m) or fits[k][1] or role_text(m)), swap_out(m)] for _, k, m in bench]

    # 4) owned dual lands in the commander's colours replace basics (EDHREC lists few of them)
    for m in owned_duals(pool, ci, used, len(lands), sum(1 for m, _, _ in lands if enters_tapped(m))):
        if blocked(norm(m["name"])): continue
        lands.append((m, "y", "makes " + "".join(c for c in "WUBRG" if c in set(m["produced"]) & ci)
                      + ("" if enters_tapped(m) else " · untapped")))
        used.add(norm(m["name"]))

    n_basics = 99 - len(chosen) - len(lands)
    colors = [c for c in "WUBRG" if c in ci]
    tally = {}
    for i in range(n_basics):
        b = BASICS[colors[i % len(colors)]] if colors else "Wastes"
        tally[b] = tally.get(b, 0) + 1
    arena = ["Commander", f"1 {cmdr['name'].split(' // ')[0]}", "", "Deck"]
    arena += [f"1 {m['name'].split(' // ')[0]}" for m, _, _ in chosen + lands]
    arena += [f"{c} {b}" for b, c in tally.items()]

    # every card you could swap (popular, good fit, filler, combo piece; lands too): up to PICK_ALTS owned cards to swap
    # in (a similar job by roles, type and Oracle text, or the next best owned cards), ranked by the builder's value +
    # links with this deck, within the Game Changer cap and the bracket rules (blocked), and the most played EDHREC card
    # for the same job that you'd have to buy. Display only: the 99 above is final. Pinned cards and basics get none.
    pick_opts = {}
    near = [k for _, k, m in sorted(((total(m, False), k, m) for k, m, _, kd in pool if kd != "land" and k not in used),
                                    key=lambda t: (-t[0], t[1]))[:PICK_ALTS * 2]]
    for m, kind, _ in chosen + lands:
        if kind not in "pyfc": continue
        k0 = norm(m["name"])
        if optc is not None and k0 in optc:
            if optc[k0]: pick_opts[id(m)] = optc[k0]
            continue
        island = card_kind(m) == "land"
        roles, (pv, cs) = roles_of(m), card_engines(m)
        close = {k: (q, w) for q, k, _, w in find_subs(m, rate_of, pool, by_role, used, True, 10, tribe=tribe, ci=ci)}
        opts = []
        val = lambda k: (-((score(k) if island else total(owned[k], False)) + PICK_CLOSE * close.get(k, (0, ""))[0]), k)
        for k in sorted(close, key=val) + ([] if island else sorted(set(near) - set(close), key=val)):   # a similar job first
            m2 = owned[k]
            if (card_kind(m2) == "land") != island: continue
            if (m2["gc"] and not m["gc"] and not gc_room()) or blocked(k): continue
            why = close[k][1] if island else (syn.why(m2) or fits.get(k, (0, ""))[1] or role_text(m2))
            opts.append([T.add(m2["name"], m2), T.s(why + (" · similar job" if k in close and not island else ""))])
            if len(opts) >= PICK_ALTS: break
        buy, bwhy = -1, -1
        mine = set(m.get("produced") or []) & ci
        for k, name, rate in missing:
            mm = name_meta.get(k)
            if not mm or k in sub_for or card_kind(mm) != card_kind(m) or (mm.get("gc") and not m["gc"] and not gc_room()):
                continue
            if island:                      # a land: makes at least the colours yours makes here
                same = mine and mine <= set(mm.get("produced") or [])
            else:
                p2, c2 = card_engines(mm)   # the same job: a shared role, or (no roles) same card type + engine
                same = (roles_of(mm) & roles) if roles else \
                    (type_group(mm["type_line"]) == type_group(m["type_line"]) and (p2 | c2) & (pv | cs))
            if same:
                buy, bwhy = T.add(mm["name"], mm), T.s(f"EDHREC: in {round(rate * 100)}% of these decks · {role_text(mm)}")
                break
        o = (opts, buy, bwhy) if opts or buy >= 0 else None
        if optc is not None: optc[k0] = o
        if o: pick_opts[id(m)] = o

    # each substitute slot: why the advised card, and up to 3 other owned cards you could use instead
    # (not already in the deck, within the Game Changer cap and the bracket's combo rules)
    slot_alts = {}
    n_gc = sum(1 for m, _, _ in chosen + lands if m["gc"])
    for m, kind, mm in chosen + lands:
        if kind != "s": continue
        sk = norm(m["name"])
        used.discard(sk)
        cands = find_subs(mm, rate_of, pool, by_role, used, True, 8, tribe=tribe, ci=ci)
        why, alts = "", []
        for _, k2, m2, w in cands:
            if k2 == sk: why = w; continue
            if len(alts) >= 3 or (m2["gc"] and gc_cap is not None and n_gc - m["gc"] >= gc_cap) or blocked(k2): continue
            alts.append([T.add(m2["name"], m2), T.s(w)])
        used.add(sk)
        slot_alts[id(mm)] = (T.s(why), alts)

    # gaps: top missing cards with up to 3 owned alternatives
    gaps = []
    for k, name, rate in (missing[:GAP_SHOW] if want_gaps else []):
        mm = name_meta.get(k)
        subs = find_subs(mm, rate_of, pool, by_role, {me}, gc_cap != 0, 3, used, tribe, ci) if mm else []
        rows = [[T.add(sm["name"], sm), T.s(why)] for _, sk, sm, why in subs]
        used_sub = sub_for.get(k)
        if used_sub and used_sub not in [s[1] for s in subs]:
            sm = owned[used_sub]
            rows = ([[T.add(sm["name"], sm), T.s("swapped into your deck")]] + rows)[:3]
        gaps.append([T.add(name, mm), round(rate * 100), rows,
                     T.add(owned[used_sub]["name"], owned[used_sub]) if used_sub else -1, T.s(role_text(mm))])

    roles = {r: 0 for r in ROLE_NAMES}
    for m, _, _ in chosen:
        for r in roles_of(m):
            if r in roles: roles[r] += 1
    gc_names = [m["name"] for m, _, _ in chosen + lands if m["gc"]]
    cmcs = [m["cmc"] for m, _, _ in chosen]
    avg_cmc = round(sum(cmcs) / max(len(cmcs), 1), 2)
    allc = chosen + lands
    sources = {c: sum(cnt for b, cnt in tally.items() if b == BASICS[c])
                  + sum(1 for m, _, _ in lands if c in (m.get("produced") or [])) for c in colors}
    odd = sum(1 for c in chosen if c[1] in "sf")
    fin = {me} | {norm(m["name"]) for m, _, _ in allc}
    n_fin = sum(1 for m, _, _ in chosen if is_fin(m))
    win_combos = [c for c in live if combo_counts(c, bnum) and combo_done(c, fin)]
    cname = {}
    for m, kind, _ in allc:
        if kind != "c": continue
        c = next((c for c in by_card.get(norm(m["name"]), []) if combo_done(c, fin)), None)
        if c: cname[id(m)] = " + ".join(c["cards"] + (c.get("req") or []))
    return {
        "decks": edh["decks"], "pct": round(100 * own_w / tot_w, 1),
        "own_n": own_n, "tmpl_n": len(template), "n_miss": len(missing),
        "rec": sum(1 for c in allc if c[1] == "p"),
        "subs": sum(1 for c in allc if c[1] == "s"),
        "fill": sum(1 for c in allc if c[1] == "f"),
        "pick": sum(1 for c in allc if c[1] == "y"),
        "pin": sum(1 for c in allc if c[1] == "k"), "pinx": pin_miss,
        "cpc": sum(1 for c in allc if c[1] == "c"),
        "gc": len(gc_names), "gcn": gc_names, "cmc": avg_cmc,
        "pw": power_profile(roles, len(gc_names), avg_cmc),
        "rd": readiness(roles, avg_cmc, odd, sources, n_fin + len(win_combos)),
        # win plan: name, backup, finishers in the deck, complete winning combos, plan fill [[card in, card out]],
        # missing finishers worth getting when the plan is still short (most played first; never priced)
        "plan": {"n": plan, "b": backup, "f": [T.add(m["name"], m) for m, _, _ in chosen if is_fin(m)],
                 "k": len(win_combos), "fill": plan_fill, "up": plan_up},
        "core": built_around(profile, [m for m, _, _ in chosen]),
        "mld": [m["name"] for m, _, _ in allc if is_mld(m)],
        "xt": [m["name"] for m, _, _ in allc if is_xturn(m)],
        "tut": roles.get("tutor", 0),
        "sw": swaps,            # synergy swaps: [card in, card out, why]
        "bench": bench,         # next in line from your collection: [card, why, card it would replace or -1]
        # third field: the missing card a substitute stands in for, or why you picked it ("y")
        # substitutes also carry [why the advised card, [[alternative, why] x up to 3]]
        # other entries: [card, kind, why (good fit) / role (filler) / the combo (combo piece) or -1, options]
        # options (p, y, f, c; none for pinned) = index into T.opts: [[[alternative, why] x up to 3], card to buy, why]
        "deck": [[T.add(m["name"], m), kind, T.add(f["name"], f), *slot_alts.get(id(f), (-1, []))] if kind == "s"
                 else [T.add(m["name"], m), kind, T.s(cname[id(m)]) if id(m) in cname else T.s(f) if isinstance(f, str) else -1,
                       *([T.o(list(pick_opts[id(m)]))] if id(m) in pick_opts else [])]
                 for m, kind, f in allc],
        "basics": [[T.add(b), c] for b, c in tally.items()],
        "gaps": gaps,
        "arena": "\n".join(arena) + "\n",
        "_names": {me} | {norm(m["name"]) for m, _, _ in allc},
    }

# -------------------------------------------------------- Commander Spellbook
def csb_find(commanders, main):
    """POST a deck to find-my-combos, following pagination. None if any page fails
    (partial results must not be cached as complete)."""
    body = {"commanders": [{"card": c} for c in commanders],
            "main": [{"card": c} for c in main]}
    merged, url, pages = {}, CSB + "?limit=100", 0
    while url and pages < 15:
        resp = http_json(url, body, retries=5)
        if not resp: return None
        for k, v in (resp.get("results") or {}).items():
            if isinstance(v, list): merged.setdefault(k, []).extend(v)
        url = resp.get("next"); pages += 1
        time.sleep(CSB_DELAY)
    return merged if pages else None

def fetch_combo_cards(cache_path, refresh=False):
    """{normalized name: number of combos} for every card in at least one Spellbook combo.
    Downloaded once a month (most-used first, stopping at the first card in no combo)."""
    cache = {} if refresh else load_json(cache_path)
    if cache.get("cards") and (OFFLINE or time.time() - cache.get("_ts", 0) < 30 * 86400):
        return cache["cards"]
    if OFFLINE: return {}
    print("Combo cards: downloading the list from Commander Spellbook (once a month, ~1-2 min)")
    cards, url = {}, CSB_CARDS + "?limit=100&ordering=-variant_count"
    while url:
        resp = http_json(url, retries=5)
        if not resp:
            print("  ! download failed; commanders with big card pools skip combos this run")
            return {}
        page = resp.get("results") or []
        cards.update({norm(c["name"]): c["variantCount"] for c in page if c.get("variantCount")})
        if not page or not page[-1].get("variantCount"): break
        url = resp.get("next"); time.sleep(0.3)
    save_json(cache_path, {"_ts": time.time(), "cards": cards})
    print(f"  {len(cards)} cards appear in at least one combo")
    return cards

def fetch_card_flags(owned, cache_path, refresh=False):
    """Spellbook's own Game Changer / mass land denial / extra turn flags for your cards, from
    /estimate-bracket (it classifies every card it's sent). Only cards not cached yet are sent, in
    chunks; everything is re-checked once a month (the Game Changer list changes). Fills CARD_FLAGS
    and marks Spellbook Game Changers in `owned`."""
    cache = {} if refresh else load_json(cache_path)
    flags = cache.get("cards") or {}
    if time.time() - cache.get("_ts", 0) > 30 * 86400 and not OFFLINE: flags = {}
    names = {norm(m["name"]): m["name"] for m in owned.values()}
    todo = sorted(k for k in names if k not in flags)
    if todo and not OFFLINE and not CSB_DOWN[0]:
        print(f"Card flags: asking Commander Spellbook about {len(todo)} cards")
        fresh = not flags
        for i in range(0, len(todo), 400):
            batch = todo[i:i + 400]
            res = http_json(CSB_BRACKET, {"commanders": [], "main": [{"card": names[k]} for k in batch]}, retries=5)
            time.sleep(CSB_DELAY)
            if not res:
                print("  ! Spellbook didn't answer; text matching for the rest this run"); break
            got = {norm(c["card"]["name"]): [int(bool(c.get(f))) for f in ("gameChanger", "massLandDenial", "extraTurn")]
                   for c in res.get("cards", []) if isinstance(c.get("card"), dict)}
            for k in batch: flags[k] = got.get(k)        # None: Spellbook doesn't know the card
        save_json(cache_path, {"_ts": time.time() if fresh else cache.get("_ts", time.time()), "cards": flags})
    CARD_FLAGS.clear(); CARD_FLAGS.update({k: v for k, v in flags.items() if v})
    for k, m in owned.items():
        if CARD_FLAGS.get(k, [0])[0]: m["gc"] = True
    print(f"Card flags: {len(CARD_FLAGS)} known ({sum(v[1] for v in CARD_FLAGS.values())} mass land denial,"
          f" {sum(v[2] for v in CARD_FLAGS.values())} extra turn, {sum(v[0] for v in CARD_FLAGS.values())} Game Changers)")

def fetch_templates(names, cache_path, refresh=False):
    """Spellbook combo conditions ("Persist Creature", "Haste Enabler"...) resolved to cards. Spellbook
    gives each condition a Scryfall search (keyword:persist t:creature); we run it once and keep the
    card names (monthly recheck). Conditions without a Scryfall search stay unknown."""
    cache = {} if refresh else load_json(cache_path)
    t = cache.get("t") or {}
    if time.time() - cache.get("_ts", 0) > 30 * 86400 and not OFFLINE: t = {}
    todo = sorted(n for n in names if n not in t)
    if todo and not OFFLINE and not CSB_DOWN[0]:
        print(f"Combo conditions: resolving {len(todo)} with Spellbook + Scryfall")
        fresh = not t
        for name in todo:
            res = http_json(CSB_TEMPLATES + "?limit=20&q=" + urllib.parse.quote(name), retries=5)
            time.sleep(CSB_DELAY)
            if res is None: print("  ! Spellbook didn't answer; rest stay unknown this run"); break
            hit = next((x for x in res.get("results", []) if x.get("name") == name), None)
            api = (hit or {}).get("scryfallApi")
            if not api: t[name] = None; continue          # no Scryfall search for this condition
            cards, url, pages = set(), api + "&unique=cards", 0
            while url and pages < 12:
                r = http_json(url); time.sleep(0.11)
                if r is None: break                 # 404 = no card matches (or a failure)
                cards |= {norm(c["name"]) for c in r.get("data", [])}
                url = r.get("next_page") if r.get("has_more") else None; pages += 1
            t[name] = sorted(cards)
        save_json(cache_path, {"_ts": time.time() if fresh else cache.get("_ts", time.time()), "t": t})
    TEMPLATES.clear(); TEMPLATES.update({k: set(v) for k, v in t.items() if v is not None})
    known = [n for n in names if n in TEMPLATES]
    if todo: print(f"Combo conditions: {len(known)}/{len(set(names))} resolved to cards")

def annotate_combos(combos, owned, ci):
    """Copies of the combos with, for this colour identity:
    tmv = Scryfall mana value of the named pieces + mana the combo needs (how early it can happen),
    sat = {condition: your legal cards that meet it} (None = condition can't be resolved)."""
    if not combos: return combos
    mine = {k: m for k, m in owned.items() if m["commander_legal"] and set(m["ci"]) <= ci}
    out = {k: v for k, v in combos.items() if k not in ("own", "near")}
    for part in ("own", "near"):
        out[part] = []
        for c in combos[part]:
            c = dict(c)
            named = {norm(x) for x in c["cards"]}
            c["tmv"] = int(sum((owned.get(x) or {}).get("cmc", 0) for x in named) + (c.get("mv") or 0))
            c["sat"] = {r: (sorted(mine[k]["name"] for k in TEMPLATES[r] & set(mine) if k not in named)
                            if r in TEMPLATES else None) for r in c.get("req") or []}
            out[part].append(c)
    return out

def combo_done(c, have):
    """Is combo c complete among the normalized names `have`? None = depends on a condition that
    can't be resolved to cards."""
    if not all(norm(x) in have for x in c["cards"]): return False
    for r in c.get("req") or []:
        sat = (c.get("sat") or {}).get(r)
        if sat is None: return None
        if not any(norm(x) in have for x in sat): return False
    return True

def is_mld(m):
    f = CARD_FLAGS.get(norm(m["name"]))
    return bool(f[1]) if f else bool(MLD_RX.search(rules_text(m)))

def is_xturn(m):
    f = CARD_FLAGS.get(norm(m["name"]))
    return bool(f[2]) if f else bool(XTURN_RX.search(rules_text(m)))

def combo_pool(ci, owned, combo_cards):
    """Your legal cards in these colours that are part of some combo, split in two: what fits in one
    find-my-combos request (CSB_MAX_MAIN, the cards in most combos first) and the rest, which
    combos_for_commander looks up card by card so no combo is missed."""
    pool = [x["name"] for x in owned.values() if set(x["ci"]) <= ci and x["commander_legal"]
            and (not combo_cards or norm(x["name"]) in combo_cards)]
    if len(pool) <= CSB_MAX_MAIN or not combo_cards: return sorted(pool), []
    pool = sorted(pool, key=lambda n: (-combo_cards.get(norm(n), 0), n))
    return sorted(pool[:CSB_MAX_MAIN]), sorted(pool[CSB_MAX_MAIN:])

def csb_card_combos(name, legal):
    """Combos using `name` whose pieces are all in `legal` (normalized names), via /variants/ search.
    None if Spellbook doesn't answer."""
    url, out, pages = (CSB.replace("find-my-combos", "variants/") + "?limit=100&q="
                       + urllib.parse.quote(f'card="{name}" legal:commander')), [], 0
    while url and pages < 10:
        r = http_json(url, retries=5); time.sleep(CSB_DELAY)
        if r is None: return None
        out += [v for v in r.get("results", [])
                if all(isinstance(u.get("card"), dict) and norm(u["card"]["name"]) in legal for u in v.get("uses", []))]
        url = r.get("next"); pages += 1
    return out

def compact_combos(variants, have, keep):
    out, seen = [], set()
    for v in variants:
        vid = str(v.get("id", ""))
        if not vid or vid in seen: continue
        seen.add(vid)
        cards = [u["card"]["name"] for u in v.get("uses", []) if isinstance(u.get("card"), dict)]
        req = [r["template"]["name"] for r in v.get("requires", []) if isinstance(r.get("template"), dict)]
        feats = [p["feature"] for p in v.get("produces", []) if isinstance(p.get("feature"), dict)]
        out.append({"id": vid, "cards": cards, "req": req[:3], "prod": [f["name"] for f in feats][:3],
                    "pop": v.get("popularity") or 0,
                    "miss": [c for c in cards if norm(c) not in have],
                    "bt": v.get("bracketTag") or "",                       # Spellbook's bracket tag
                    "inf": int(any(f.get("uncountable") for f in feats)),  # infinite (uncountable) result
                    "rel": int(any(f.get("status") == "S" for f in feats)),  # standalone result (Spellbook "relevant")
                    "np": int(bool(v.get("notablePrerequisites"))),
                    "mv": v.get("manaValueNeeded") or 0})
    out.sort(key=lambda c: -c["pop"])
    return {"n": len(out), "list": out[:keep]}

def combos_current(entry):
    """Cached before "rel" (Spellbook feature status) was stored? Then refetch when online."""
    return entry is None or all("rel" in c for c in entry["own"] + entry["near"])

def combos_for_commander(m, owned, cache, combo_cards):
    """Combos among your cards in this commander's colours (the commander included). The answer
    only depends on the colours, so commanders sharing an identity share one cached query."""
    ci = set(m["ci"])
    pool, extra = combo_pool(ci, owned, combo_cards)
    if len(pool) > CSB_MAX_MAIN: return None   # no combo-card list to trim with
    key = "ci2:" + ("".join(c for c in "WUBRG" if c in ci) or "C") + ":" \
          + hashlib.md5("\n".join(pool + extra).encode()).hexdigest()[:10]
    if key in cache and (combos_current(cache[key]) or OFFLINE or CSB_DOWN[0]):
        return cache[key]                     # (--refresh starts from an empty cache)
    if OFFLINE or CSB_DOWN[0]: return None
    res = csb_find([], pool)
    if res is None:                           # don't cache failures; stop asking for this run
        CSB_DOWN[0] = True
        print("  ! Commander Spellbook isn't answering: the remaining commanders skip combos this run."
              " Rerun later; finished colour identities are cached.")
        return None
    have = set(owned)
    if extra:                                 # cards that didn't fit: their combos, one card at a time
        legal = {k for k, x in owned.items() if set(x["ci"]) <= ci and x["commander_legal"]}
        print(f"  {len(extra)} cards over Spellbook's {CSB_MAX_MAIN}-card limit: looking them up one by one")
        for n in extra:
            got = csb_card_combos(n, legal)
            if got is None:
                CSB_DOWN[0] = True; print("  ! Commander Spellbook isn't answering; rerun later"); return None
            res.setdefault("included", []).extend(got)
    own = compact_combos(res.get("included", []), have, 10 ** 6)        # all: the builder checks them
    near = compact_combos(res.get("almostIncluded", []), have, 150)     # ranked per commander later
    out = {"own": own["list"], "n_own": own["n"], "near": near["list"], "n_near": near["n"]}
    cache[key] = out
    return out

WIN_RX = re.compile(r"win the game|loses the game|infinite damage|infinite lifeloss|infinite combat|"
                    r"infinite mill|infinite turns", re.I)

def combo_wins(c):
    return bool(WIN_RX.search(" ".join(c.get("prod") or [])))

class ComboTable:
    """One shared combo list for the report (combos repeat across commanders of the same colours)."""
    def __init__(self): self.rows, self.idx = [], {}
    def add(self, c):
        if c["id"] not in self.idx:
            sat = c.get("sat") or {}
            self.rows.append({"id": c["id"], "cards": c["cards"], "req": c.get("req") or [],
                              "sat": [(sat.get(r) or [])[:3] for r in c.get("req") or []],
                              "prod": c.get("prod") or [], "miss": c.get("miss") or [], "bt": c.get("bt", ""),
                              "inf": c.get("inf", 0), "tmv": c.get("tmv", 0), "mv": c.get("mv") or 0,
                              "two": int(two_card_infinite(c)),
                              "need": combo_need(c), "win": int(combo_wins(c))})
            self.idx[c["id"]] = len(self.rows) - 1
        return self.idx[c["id"]]

def best_combos(own, names, legal_names, bnum, n=10):
    """Most effective combos you own that this bracket allows, in a fixed order: already in the deck,
    then ones that win the game, then fewer pieces, then cheaper, then more popular.
    [(combo, 2 = in this deck / 1 = you own every piece)]"""
    out = []
    for c in own:
        if not combo_done(c, legal_names) or not combo_ok(c, bnum): continue
        st = 2 if combo_done(c, names) else 1
        out.append((st, c))
    out.sort(key=lambda t: (-t[0], -combo_wins(t[1]), len(t[1]["cards"]) + len(t[1].get("req") or []),
                            t[1].get("tmv", 0), -t[1].get("pop", 0)))
    return [(c, st) for st, c in out[:n]]

def finish_deck(x, b, own, legal_names, CT):
    """Combos in a finished deck: best ones, the ones inside it, combo bar, Bracket Fit."""
    names = x.pop("_names")
    x["cl"] = [[CT.add(c), st] for c, st in best_combos(own, names, legal_names, BRACKET_NUM.get(b))]
    inside = [c for c in own if combo_done(c, names)]
    maybe = [c for c in own if combo_done(c, names) is None and two_card_infinite(c)]
    x["cin"] = [c["id"] for c in inside]
    x["c2"] = sum(1 for c in inside if two_card_infinite(c))
    x["pw"]["combo"] = max(0, min(10, len(inside) * 3))
    x["bf"] = bracket_fit(x, inside, maybe)
    return x

def danger_zone(own, legal_names):
    """Two-card infinite combos you can assemble for this commander (commander + one card counts, and so
    does one card + a card meeting its condition). Earliest first."""
    out = [c for c in own if two_card_infinite(c) and combo_done(c, legal_names)]
    return sorted(out, key=lambda c: (c.get("tmv", 0), -c.get("pop", 0)))[:12]

def rank_combos(combos, deck_names, keep_own=30, keep_near=20):
    """The report's combo lists for one commander: combos whose pieces are in its deck first (they
    fit what it does), then by popularity. The colour-identity query is shared; this ranking isn't."""
    if not combos: return combos
    inn = lambda c: sum(1 for x in c["cards"] if norm(x) in deck_names) / max(1, len(c["cards"]))
    pick = lambda L, n: sorted(L, key=lambda c: (-inn(c), -c["pop"]))[:n]
    return {"own": pick(combos["own"], keep_own), "n_own": combos["n_own"],
            "near": pick(combos["near"], keep_near), "n_near": combos["n_near"]}

# ---------------------------------------------------------- imported decks
def parse_decklist(path, text=None):
    """Reads Moxfield / Archidekt / Arena style text exports (a file, or pasted `text`)."""
    cmdrs, main, section = [], [], "main"
    if text is None:
        with open(path, encoding="utf-8-sig") as f: text = f.read()
    for line in text.lstrip("\ufeff").splitlines():
        s = line.strip()
        if not s: continue
        low = s.lower().strip("/# :")
        if low in ("commander", "commanders"): section = "cmd"; continue
        if low in ("deck", "main", "mainboard", "companion"): section = "main"; continue
        if low in ("sideboard", "maybeboard", "considering", "tokens"): section = "skip"; continue
        if s.startswith(("//", "#")): continue
        mt = re.match(r"^(\d+)\s*x?\s+(.+)$", s)
        qty, name = (int(mt.group(1)), mt.group(2)) if mt else (1, s)
        is_cmd = "*CMDR*" in name.upper()
        name = re.sub(r"\s*\*[A-Za-z]+\*", "", name)
        name = re.sub(r"\s+\([A-Za-z0-9]{2,6}\)(\s+\S+)?$", "", name).strip()
        if section == "skip" or not name: continue
        (cmdrs if section == "cmd" or is_cmd else main).append((qty, name))
    return cmdrs, main

ANALYSIS_ADD = 8        # deck analysis: owned cards suggested (after the ones filling a failed check)
ANALYSIS_BUY = 8        # ...EDHREC cards worth buying
ANALYSIS_CUT = 6        # ...cuts to consider

def deck_analysis(cm, cmdrs, main, meta, owned, name_meta, base, ap, pool, inside, T):
    """A saved deck, graded with the same rules and measures the builder uses (nothing invented):
    bracket (bracket_fit: Game Changers, mass land denial, extra turns, two-card infinites in the deck), Build Readiness
    checks (roles vs ROLE_TARGETS, average mana value, weakest colour's sources, win conditions), the deck's shape vs
    EDHREC's average deck of this commander (`ap`), what it's built around (commander profile) and its engines
    (DeckSynergy links), owned cards to add (first those filling a failed check, then the best by the builder's score),
    EDHREC cards worth buying, and cuts to consider (the lowest-scoring cards no check, combo or hidden gem depends on)."""
    deck = [(q, meta(n), n) for q, n in main]
    keys = {norm(n) for _, n in cmdrs + main}
    ci = set(cm["ci"]) if cm else set().union(*(set((m or {}).get("ci", [])) for _, m, _ in deck)) if deck else set()
    nl = [(q, m) for q, m, _ in deck if m and card_kind(m) != "land"]
    nonland = [m for _, m in nl]
    roles = {r: 0 for r in ROLE_NAMES}
    for q, m in nl:
        for r in roles_of(m):
            if r in roles: roles[r] += q
    n_nl = sum(q for q, _ in nl)
    avg_cmc = round(sum(q * (m.get("cmc") or 0) for q, m in nl) / max(n_nl, 1), 2)
    sources, n_lands = {c: 0 for c in "WUBRG" if c in ci}, 0
    for q, m, n in deck:
        nm = n.split(" // ")[0]
        if nm in BASIC_NAMES:
            n_lands += q
            c = next((c for c, b in BASICS.items() if nm.endswith(b)), None)
            if c in sources: sources[c] += q
        elif m and card_kind(m) == "land":
            n_lands += q
            for c in set(m.get("produced") or []) & set(sources): sources[c] += q
    rd = [r for r in readiness(roles, avg_cmc, 0, sources) if r[0] != "odd"]
    allm = [m for _, m, _ in deck if m] + ([cm] if cm else [])
    for c in inside:                                       # two-card infinites need the mana total (combo_need)
        c["tmv"] = int(sum((meta(x) or {}).get("cmc", 0) for x in c["cards"]) + (c.get("mv") or 0))
    gcn = sorted({m["name"] for m in allm if m.get("gc")})
    bf = bracket_fit({"gc": len(gcn), "mld": sorted({m["name"] for m in allm if is_mld(m)}),
                      "xt": sorted({m["name"] for m in allm if is_xturn(m)})}, inside)
    mv, ty = [0] * 8, {}
    for q, m, n in deck:
        g = "Land" if n.split(" // ")[0] in BASIC_NAMES else type_group(m["type_line"]) if m else None
        if not g: continue
        ty[g] = ty.get(g, 0) + q
        if g != "Land": mv[min(int(m.get("cmc") or 0), 7)] += q
    out = {"bf": bf, "gcn": gcn, "tut": roles.get("tutor", 0), "rd": rd, "cmc": avg_cmc, "lands": n_lands,
           "mv": mv, "ty": ty, "ref": avg_shape(ap, owned, name_meta) if ap and ap.get("cards") else None,
           "adecks": (ap or {}).get("decks", 0), "core": [], "eng": [], "add": [], "buy": [], "cut": []}
    if not cm: return out
    profile = commander_profile(cm, (base or {}).get("tags") or [])
    out["core"] = built_around(profile, nonland)
    syn = DeckSynergy(cm, nonland, profile[0])
    eng = {}
    for m in nonland:
        for _, lab in syn.links(m, True): eng[lab] = eng.get(lab, 0) + 1
    out["eng"] = sorted(([lab, n] for lab, n in eng.items()), key=lambda x: (-x[1], x[0]))[:6]
    _, play_of, value_of = card_values(base, base, owned, name_meta) if base else (None, lambda k: 0.0, lambda k: 0.0)
    rate_of = (lambda k: (base["cards"].get(k) or (None, 0.0))[1]) if base else (lambda k: 0.0)
    gems = hidden_gems(cm, profile, pool, play_of, "all") if base else {}    # the builder's own floor (e.g. Brallin for Doom)
    def score(k, m, inside_=False):
        f, why = cmdr_fit(cm, m, profile, "all")
        if k in gems: why = "hidden gem: " + " + ".join(gems[k][1]) + (" · " + why if why else "")
        return (max(value_of(k), gems[k][0]) if k in gems else value_of(k)) + f + syn.score(m, inside_), why
    def reason(k, m, fit_why):
        r = rate_of(k)
        parts = [f"in {round(r * 100)}% of these decks" if r else "", syn.why(m), fit_why]
        return " · ".join(x for x in parts if x)[:140] or role_text(m) or ""
    # owned cards to add: first those doing a job the deck is short of, then the best by the builder's score
    cand = [(k, m) for k, m, _, kd in pool if kd != "land" and k not in keys]
    scored = sorted(((score(k, m), k, m) for k, m in cand), key=lambda t: (-t[0][0], t[1]))
    added = set()
    for r, val, tgt, ok in rd:
        if ok or r not in ROLE_TARGETS: continue
        for (sc, why), k, m in [t for t in scored if r in roles_of(t[2]) and t[1] not in added][:3]:
            out["add"].append([T.add(m["name"], m), T.s(f"fills {r}: the deck has {val}, the checks want {tgt}")]); added.add(k)
    src = next((r for r in rd if r[0] == "src" and not r[3]), None)
    if src:                                                # a weak colour: owned lands that make it
        c = src[1].split(" ")[0]
        lands = sorted(((k, m) for k, m, _, kd in pool if kd == "land" and k not in keys and c in (m.get("produced") or [])
                        and not restricted_mana(m)),
                       key=lambda t: (enters_tapped(t[1]), -len(set(t[1].get("produced") or []) & ci), t[0]))[:2]
        for k, m in lands:
            out["add"].append([T.add(m["name"], m), T.s(f"fixes {c}: the deck has {src[1].split(' ')[1]} {c} sources, the checks want {src[2]}")]); added.add(k)
    for (sc, why), k, m in [t for t in scored if t[1] not in added][:ANALYSIS_ADD]:
        out["add"].append([T.add(m["name"], m), T.s(reason(k, m, why))])
    # EDHREC cards worth buying: the most played cards for this commander you don't own and the deck doesn't run
    if base:
        miss = sorted(((value_of(k), k, v[0]) for k, v in base["cards"].items() if k not in owned and k not in keys
                       and v[0].split(" // ")[0] not in BASIC_NAMES), key=lambda t: (-t[0], t[1]))[:ANALYSIS_BUY]
        for _, k, nm in miss:
            mm = name_meta.get(k)
            out["buy"].append([T.add(mm["name"] if mm else nm, mm), T.s(f"in {round(rate_of(k) * 100)}% of these decks"
                                                                       + (f" · {role_text(mm)}" if mm and role_text(mm) else ""))])
    # cuts: the lowest-scoring cards no failed check, kept role or combo in the deck depends on
    in_combo = {norm(x) for c in inside for x in c["cards"]}
    short = {r for r, v, t, ok in rd if r in ROLE_TARGETS and v <= t}
    cuts = []
    for q, m in nl:
        k = norm(m["name"])
        if k == norm(cm["name"]) or k in in_combo or k in gems or (roles_of(m) & short) or m.get("gc"): continue
        (sc, why) = score(k, m, True)
        parts = [f"in {round(rate_of(k) * 100)}% of these decks" if rate_of(k) else "not on EDHREC's list for this commander"]
        if not syn.links(m, True): parts.append("no links with the rest of the deck")
        if not roles_of(m): parts.append("no tracked job (ramp, draw, removal…)")
        if (m.get("cmc") or 0) >= 6: parts.append(f"mana value {int(m['cmc'])}")
        if k not in owned: parts.append("you don't own it")
        cuts.append((sc, k, m, " · ".join(parts)))
    for _, k, m, why in sorted(cuts, key=lambda t: (t[0], t[1]))[:ANALYSIS_CUT]:
        out["cut"].append([T.add(m["name"], m), T.s(why)])
    return out

def deck_combo_key(cmdrs, main):
    """Cache key of a decklist's combos: its commanders and cards, order and copies ignored."""
    return hashlib.sha1(json.dumps([sorted({n for _, n in cmdrs}), sorted({n for _, n in main})]).encode("utf-8")).hexdigest()

def analyze_imported(path, owned, name_meta, do_combos, edh_cache, T, combo_cache=None):
    """One of your decklists (decks_in): % owned, missing cards with your stand-ins, combos (Spellbook, cached in
    `combo_cache` by the deck's card list so a deck is only sent once per version)."""
    cmdrs, main = parse_decklist(path)
    meta = lambda n: owned.get(norm(n)) or name_meta.get(norm(n))
    if not cmdrs:   # guess: legendary creature whose colors cover the whole deck
        deck_ci = set()
        for _, n in main: deck_ci |= set((meta(n) or {}).get("ci", []))
        for _, n in main:
            mm = meta(n) or {}
            front = mm.get("type_line", "").split(" // ")[0]
            if "Legendary" in front and "Creature" in front and set(mm.get("ci", [])) >= deck_ci:
                cmdrs = [(1, n)]; main = [x for x in main if x[1] != n]; break
    allc = cmdrs + main
    ci = set()
    for _, n in allc: ci |= set((meta(n) or {}).get("ci", []))
    nonbasic = [(q, n) for q, n in allc if n.split(" // ")[0] not in BASIC_NAMES]
    own_n = sum(q for q, n in nonbasic if norm(n) in owned)
    tot_n = sum(q for q, _ in nonbasic) or 1

    base = edh_cache.get(slugify(cmdrs[0][1])) if cmdrs else None
    rate_of = (lambda k: (base["cards"].get(k) or (None, 0.0))[1]) if base else (lambda k: 0.0)
    pool, by_role = build_pool(ci, owned, norm(cmdrs[0][1]) if cmdrs else "")
    tribe = commander_types(meta(cmdrs[0][1])) if cmdrs and meta(cmdrs[0][1]) else set()
    deck_keys = {norm(n) for _, n in allc}
    cards_out, gaps = [], []
    for q, n in main:
        m = meta(n)
        have = n.split(" // ")[0] in BASIC_NAMES or norm(n) in owned
        cards_out.append([T.add(m["name"] if m else n, m), 1 if have else 0, q])
    for _, n in sorted(nonbasic, key=lambda x: (-rate_of(norm(x[1])), x[1])):
        if norm(n) in owned: continue
        mm = meta(n)
        subs = find_subs(mm, rate_of, pool, by_role, deck_keys, True, 3, tribe=tribe) if mm else []
        gaps.append([T.add(mm["name"] if mm else n, mm), round(rate_of(norm(n)) * 100),
                     [[T.add(sm["name"], sm), T.s(why)] for _, _, sm, why in subs], -1, T.s(role_text(mm))])
    combos, ck = None, deck_combo_key(cmdrs, main)
    if combo_cache is not None and ck in combo_cache and (
            combos_current(combo_cache[ck]) or OFFLINE or CSB_DOWN[0] or not do_combos):
        combos = combo_cache[ck]
    elif do_combos and not OFFLINE and not CSB_DOWN[0]:
        res = csb_find([n for _, n in cmdrs], [n for _, n in main])
        if res is not None:
            own = compact_combos(res.get("included", []), deck_keys, 30)
            near = compact_combos(res.get("almostIncluded", []), deck_keys, 20)
            combos = {"own": own["list"], "n_own": own["n"], "near": near["list"], "n_near": near["n"]}
            if combo_cache is not None: combo_cache[ck] = combos
    cm = meta(cmdrs[0][1]) if cmdrs else None
    ap = edh_cache.get("avg:" + slugify(cmdrs[0][1])) if cmdrs else None
    an = deck_analysis(cm, cmdrs, main, meta, owned, name_meta, base, ap, pool, [dict(c) for c in (combos or {}).get("own") or []], T)
    an["combos_checked"] = combos is not None
    return {"title": os.path.splitext(os.path.basename(path))[0], "an": an,
            "cmdr": [n for _, n in cmdrs], "cidx": [T.add((meta(n) or {}).get("name", n), meta(n)) for _, n in cmdrs],
            "ci": [c for c in "WUBRG" if c in ci], "img": (cm or {}).get("img", ""),
            "own": own_n, "total": tot_n, "pct": round(100 * own_n / tot_n, 1),
            "cards": cards_out, "gaps": gaps, "combos": combos}

# ------------------------------------------------------------------ report
HTML = r"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Deck Wizard v5</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=IBM+Plex+Mono:wght@400;500;700&family=Courier+Prime:wght@400;700&display=swap">
<script>try{document.documentElement.dataset.mode=localStorage.getItem("dw:mode")||"neg";}catch(e){document.documentElement.dataset.mode="neg";}</script>
<style>
:root{--bg:#111827;--ink:#e5e7eb;--mut:#9ca3af;--line:#374151;--acc:#2dd4bf;--card:#1f2937;--bar:#374151}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
h1{font:700 2.2rem/1.1 Georgia,serif;margin:0 0 2px;color:#fff}
h2{font:700 1.3rem Georgia,serif;margin:8px 0 12px;color:#fff}
.sub{color:var(--mut);margin:0 0 20px;font-size:.95rem}
.stats{display:flex;gap:28px;flex-wrap:wrap;margin:0 0 20px;padding:0;list-style:none}
.stats li{font-size:.9rem;color:var(--mut)}.stats strong{font:700 1.6rem/1.2 Georgia,serif;display:block;color:#fff}
.tools{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;align-items:center}
.slider{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin-bottom:12px}
.slider input{flex:1;accent-color:var(--acc)}#bv{font-weight:700;color:var(--acc);min-width:120px}
input[type=search],select{padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);font:inherit}
#count{color:var(--mut);font-size:.85rem;margin:4px 0 12px}#imp{margin-bottom:24px}
#coll{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin:-8px 0 16px;font-size:.88rem;display:flex;gap:6px 14px;flex-wrap:wrap;align-items:center}
#coll details{flex-basis:100%;font-size:.8rem;color:var(--mut)}#coll summary{display:inline;padding:0;cursor:pointer;color:var(--acc)}
.up{padding:6px 14px;border:1px solid var(--acc);color:var(--acc);border-radius:6px;cursor:pointer}.up:hover{background:var(--acc);color:var(--bg)}
#ups{color:var(--mut);font-size:.82rem;overflow-wrap:anywhere}.add{color:#4ade80}.rem{color:#f87171}
.row{background:var(--card);border:1px solid var(--line);border-radius:10px;margin-bottom:8px;overflow:hidden}
summary{display:grid;grid-template-columns:auto 1fr 100px 56px 70px 44px;gap:10px;align-items:center;padding:12px 14px;cursor:pointer;list-style:none}
summary::-webkit-details-marker{display:none}
summary:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.pips{display:flex;gap:3px}.pip{font:700 .65rem/1 system-ui;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;color:#1b2430;font-style:normal}
.nm{font-weight:600;overflow-wrap:anywhere}.mini{display:flex;gap:4px;flex-wrap:wrap;margin-top:3px}.mini .tag{font-size:.68rem;padding:1px 7px}
.bar{height:8px;background:var(--bar);border-radius:4px;overflow:hidden}.bar b{display:block;height:100%;background:var(--acc)}
.pct{text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:var(--acc)}
.dk{text-align:right;font-size:.8rem;color:var(--mut);font-variant-numeric:tabular-nums}
.cb{text-align:right;font-weight:600;color:#fbbf24;font-variant-numeric:tabular-nums}
.body{padding:12px 16px 16px;border-top:1px solid var(--line)}
.top{display:flex;gap:16px;margin-bottom:12px}
.cimg{width:200px;height:auto;border-radius:10px;flex-shrink:0;align-self:flex-start}
.info{flex:1;min-width:0}
.tags,.bks{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.tag{font-size:.78rem;padding:3px 10px;border-radius:12px;background:var(--bar);color:var(--acc);text-decoration:none}
a.tag:hover{background:var(--acc);color:var(--bg)}.tag.dim{color:var(--mut)}
.bk{font-size:.75rem;padding:3px 8px;border:1px solid var(--line);border-radius:6px;color:var(--mut);background:transparent;cursor:pointer}.bk:hover{border-color:var(--acc);color:var(--ink);background:transparent}.bk.on{border-color:var(--acc);color:var(--ink);background:rgba(45,212,191,.12)}
.nums{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0}.num{border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:.8rem;color:var(--mut)}
.num b{display:block;font-size:1.25rem;color:var(--ink)}.num .t{font-weight:600;color:var(--ink);font-size:.8rem}.num ul{padding-left:16px;margin:4px 0 0}.num .bad{color:#fbbf24}.num .ok{color:#34d399}
@media(max-width:700px){.nums{grid-template-columns:1fr}}
.vbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0 4px;padding-top:12px;border-top:1px solid var(--line)}
.vbar h3{margin:0 8px 0 0;font-size:1rem}
.grp h5{margin:14px 0 6px;font-size:.85rem;color:var(--mut);font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px}
.ct{position:relative;display:block;line-height:0;border-radius:6px}
img.c{width:100%;aspect-ratio:488/680;border-radius:4.75%/3.5%;background:var(--bar);object-fit:cover}
.badge{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.8);color:#fff;font:700 .75rem/1 system-ui;padding:4px 6px;border-radius:4px}
.note{position:absolute;left:4px;right:4px;bottom:6px;background:rgba(0,0,0,.82);color:#fff;font:600 .65rem/1.25 system-ui;padding:3px 5px;border-radius:4px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gap{display:flex;gap:10px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line);flex-wrap:wrap}
.alt{width:122px;display:flex;flex-direction:column;gap:4px}.alt small{font-size:.72rem;line-height:1.3;color:var(--mut)}
.arrow{align-self:center;font-size:1.4rem;color:var(--mut)}
.adv{flex:1;min-width:180px;align-self:center;color:var(--mut);font-size:.85rem;margin:0}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.danger{border:1px solid #f87171;background:rgba(248,113,113,.08);border-radius:8px;padding:10px 12px;margin:10px 0}.danger h4{color:#f87171;margin-top:0}
.tag.thm{cursor:pointer;background:transparent;border:1px solid var(--line)}.tag.thm.on{border-color:var(--acc);background:rgba(45,212,191,.18);color:var(--ink)}
.tnote{font-size:.85rem;margin:4px 0 8px}.thinw{font-size:.85rem;margin:4px 0;color:#fbbf24}.srcb.thin{border-style:dashed}.tnote .tag{cursor:pointer}
.srcsel{display:flex;gap:4px}.srcsel .srcb{font-size:.85rem;padding:4px 12px}
table.st{font-size:.75rem;border-collapse:collapse}table.st td,table.st th{padding:2px 10px;text-align:right;border-bottom:1px solid var(--line)}table.st td:first-child{text-align:left}
.srcs{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;font-size:.8rem}
.srcb{font-size:.75rem;padding:3px 8px;border:1px solid var(--line);border-radius:6px;color:var(--mut);background:transparent;cursor:pointer}.srcb:hover{border-color:var(--acc);color:var(--ink);background:transparent}.srcb.on{border-color:var(--acc);color:var(--ink);background:rgba(45,212,191,.12)}.srcb:disabled{opacity:.5;cursor:default}
.slotw{display:flex;flex-direction:column;gap:4px}.swap{font-size:.72rem;padding:3px 6px}
.pins{font-size:.85rem;margin:6px 0;display:flex;flex-wrap:wrap;gap:6px;align-items:center}.pins .tag{display:inline-flex;gap:4px;align-items:center}
.pinx,.pinb{border:0;background:none;color:var(--mut);cursor:pointer;padding:0 3px;font-size:.75rem}.pinx:hover,.pinb:hover{color:var(--ink)}
.pinq{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:3px 8px;width:14em}

.shopl{font-size:.75rem;white-space:nowrap}.bub .shopl{display:block;margin:-2px 0 6px 4px}
.cw{position:relative}
.bub{display:none;position:absolute;top:100%;left:0;margin-top:-8px;z-index:30;width:max-content;max-width:min(560px,94vw);padding:8px;background:var(--card);border:1px solid var(--acc);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.55);line-height:1.3}
.bub.r{left:auto;right:0}.cw:hover .bub,.cw:focus-within .bub{display:block}
.bub h6{margin:0 0 6px;font-size:.78rem;color:var(--ink);font-weight:600}
.bub .orow{display:flex;gap:6px;align-items:stretch;margin-bottom:6px}
.bub .opt{flex-direction:column;align-items:stretch;gap:3px;width:104px;margin:0;padding:4px;font-size:.7rem;text-align:left}
.bub .opt img.c{width:100%}.bub .opt b{font-size:.72rem;line-height:1.2}
.bub .opt small{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;line-height:1.25}
.bub .opt.want{border:2px dashed var(--ink);background:transparent}
.bub .acts{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}.bub .acts button{font-size:.72rem;padding:3px 7px}.bub small{font-size:.7rem;color:var(--mut)}
.flip{position:absolute;top:6px;left:6px;z-index:2;width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,.78);color:#fff;font:700 16px/26px system-ui;text-align:center;cursor:pointer}
.chooser{border:1px solid var(--acc);border-radius:8px;padding:10px 12px;margin:10px 0;background:rgba(45,212,191,.06)}
.opts{display:flex;gap:8px;flex-wrap:wrap}.opt{display:flex;gap:8px;align-items:flex-start;text-align:left;width:250px;padding:6px;color:var(--ink);border-color:var(--line)}
.opt img.c{width:70px;flex:none}.opt.on{border-color:var(--acc);background:rgba(45,212,191,.15);color:var(--ink)}.opt:disabled{opacity:.45;cursor:not-allowed}
.opt.mini{width:auto;padding:3px 8px;font-size:.75rem}
.shop{margin:8px 0;padding:8px 10px;border:1px dashed #f87171;border-radius:8px;font-size:.85rem}.shop button{margin-left:8px;font-size:.75rem;padding:3px 8px}
details.more{margin-top:10px}details.more>summary{display:block;padding:4px 0;cursor:pointer;color:var(--acc)}
.cl li{margin-bottom:6px}.cl a{text-decoration:none}.cl a:hover{text-decoration:underline}b.miss{color:#f87171}
#pv{position:fixed;width:300px;border-radius:14px;pointer-events:none;z-index:50;display:none;box-shadow:0 10px 30px rgba(0,0,0,.6)}
@media(max-width:700px){.cols{grid-template-columns:1fr}.top{flex-direction:column;align-items:center}.cimg{width:160px}
 summary{grid-template-columns:auto 1fr 52px 60px 40px}.bar{display:none}.grid{grid-template-columns:repeat(auto-fill,minmax(92px,1fr))}.alt{width:96px}.legend{margin-left:0}}
h4{margin:12px 0 6px;font-size:.9rem}ul{margin:0;padding-left:18px}small{color:var(--mut)}.dim{color:var(--mut)}
textarea{width:100%;font:12px/1.4 ui-monospace,Consolas,monospace;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:8px;resize:vertical}
button{padding:6px 14px;border:1px solid var(--acc);background:transparent;color:var(--acc);border-radius:6px;font:inherit;cursor:pointer}
button:hover,button.on{background:var(--acc);color:var(--bg)}a{color:var(--acc)}
/* ===================== Zine theme (design/ZINE_UI_SPEC.md, phase 1: tokens, fonts, modes, texture, controls) ===================== */
:root,:root[data-mode="neg"]{--bg:#141414;--ink:#F0EBDD;--mute:#BDB8AC;--card:#1C1C1B;--bar:#2B2A27;--line:rgba(240,235,221,.32);--grid:rgba(240,235,221,.08);--gridm:rgba(240,235,221,.03)}
:root[data-mode="pos"]{--bg:#F0EBDD;--ink:#141414;--mute:#4A4740;--card:#E7E1D1;--bar:#D6CFBD;--line:rgba(20,20,20,.32);--grid:rgba(20,20,20,.10);--gridm:rgba(20,20,20,.04)}
:root[data-mode="sepia"]{--bg:#E4DDD0;--ink:#2B241C;--mute:#5C5247;--card:#DBD3C5;--bar:#CBC2B2;--line:rgba(43,36,28,.32);--grid:rgba(62,52,42,.12);--gridm:rgba(62,52,42,.05)}
:root{--y:#FFE600;--c:#00AEEF;--m:#EC008C;--onacc:#141414;--mut:var(--mute);--acc:var(--c);--g:#A8A397;
  --band:inset 0 -3px 0 var(--y),inset 0 -6px 0 var(--m),inset 0 -9px 0 var(--c);
  --head:"Archivo","Arial Narrow",sans-serif;--body:"IBM Plex Mono","Courier New",monospace;--serial:"Courier Prime","Courier New",monospace}
body{background:var(--bg);color:var(--ink);font:14px/1.55 var(--body)}
main{position:relative;z-index:1}
/* texture: one fixed overlay (toner specks + graph paper), never on body, so sticky elements keep working */
#zt{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:0}
#zt svg{position:absolute;inset:0;width:100%;height:100%;opacity:.35}
:root[data-mode="neg"] #zt svg{filter:invert(1)}
#zt::before{content:"";position:absolute;inset:0;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px),linear-gradient(var(--gridm) 1px,transparent 1px),linear-gradient(90deg,var(--gridm) 1px,transparent 1px);background-size:48px 48px,48px 48px,12px 12px,12px 12px}
/* type */
h1,h2,h3,h4,h5,.stats strong{font-family:var(--head);font-weight:900;text-transform:uppercase;color:var(--ink);letter-spacing:.01em}
h1{font-size:2.6rem;font-stretch:62%;line-height:1;text-shadow:2px 0 0 rgba(0,174,239,.85),-2px 1px 0 rgba(236,0,140,.85)}
h2{font-size:1.5rem;font-stretch:75%}h3,h4,h5{font-stretch:75%;font-weight:800}
.stats strong{font-size:1.7rem;font-stretch:75%}.sub,#count,small,.dim{color:var(--mute)}
#count,.sub{font-family:var(--serial)}
a,.pct,#bv,.tag,details.more>summary,#coll summary{color:var(--ink)}a{text-decoration-thickness:2px;text-underline-offset:3px}
/* header with the print-mode toggle */
.zh{display:flex;flex-wrap:wrap;align-items:center;gap:10px 24px;margin-bottom:4px}.zh h1{margin:0}
.modes{display:flex;border:2px solid var(--ink);margin-left:auto}
.modes button{border:0;min-height:36px}.modes button+button{border-left:2px solid var(--ink)}
/* CMYK band dividers between the main sections */
.cmyk,#imp:not(:empty)::before,#unused:not(:empty)::before{content:"";display:block;height:9px;margin:18px 0;background:linear-gradient(var(--y) 0 3px,var(--m) 3px 6px,var(--c) 6px 9px)}
/* controls: square, 2px ink border, band on hover, inverted + band when on */
button,.up,.bk,.srcb,.tag.thm{border:2px solid var(--ink);border-radius:0;color:var(--ink);background:transparent;font-family:var(--head);font-weight:800;text-transform:uppercase;letter-spacing:.04em}
button:hover,.up:hover,.bk:hover,.srcb:hover,a.tag:hover,.tag.thm:hover{background:transparent;color:var(--ink);box-shadow:var(--band)}
button.on,.bk.on,.srcb.on,.tag.thm.on,.modes button[aria-pressed="true"]{background:var(--r);color:#FFFFFF;border-color:#0B0B0B;box-shadow:inset 0 -4px 0 #0B0B0B}
.srcb:disabled,button:disabled{opacity:.45;box-shadow:none}
.opt,.pinx,.pinb,.cps,.reset-ch{font-family:var(--body);text-transform:none;letter-spacing:0}
.pinx,.pinb{border:0}.opt{border:2px solid var(--line);color:var(--ink)}.opt.on{border-color:var(--ink);background:var(--card);box-shadow:var(--band)}
.tag{border-radius:0;background:transparent;border:1.5px solid var(--ink);font-family:var(--body)}
input[type=search],select,.pinq,textarea{border:2px solid var(--ink);border-radius:0;background:var(--bg);color:var(--ink);font-family:var(--body)}
.slider input{accent-color:var(--m)}
.slider,#coll,.row,.num,.chooser,.shop,.danger{border:2px solid var(--ink);border-radius:0;background:var(--card)}
.bub{border:2px solid var(--ink);border-radius:0;background:var(--card);box-shadow:5px 5px 0 var(--ink)}
.bub .opt.want{border:2px dashed var(--ink);background:var(--card)}.bub .opt.want b::before{content:"🛒 "}
.body,.vbar,.gap{border-top-color:var(--line)}
.bar{border-radius:0}.bar b{background:var(--ink)}
/* colours that were dark-only: readable on paper too (text on accents is always #141414) */
.add{color:#2A8443;font-weight:700}.rem,b.miss{color:#D23B26;font-weight:700}.cb{color:var(--ink)}
.num .ok{color:var(--ink)}.num .bad{color:var(--onacc);background:var(--y);padding:0 4px}
.thinw{color:var(--ink);border-left:5px solid var(--y);padding-left:8px}
.danger{border-color:var(--m)}.danger h4{display:inline-block;color:var(--onacc);background:var(--m);padding:2px 6px}
.shop{border:2px dashed var(--m)}
.ks,.kf,.kp,.kc{color:var(--ink);font-weight:700}.ks{box-shadow:inset 0 -.45em 0 var(--c)}.kf{box-shadow:inset 0 -.45em 0 var(--g)}
.kp{box-shadow:inset 0 -.45em 0 var(--y)}.kc{box-shadow:inset 0 -.45em 0 var(--m)}
:root[data-mode="neg"] .ks,:root[data-mode="neg"] .kf,:root[data-mode="neg"] .kp,:root[data-mode="neg"] .kc{box-shadow:none;text-decoration:underline 3px;text-underline-offset:3px}
:root[data-mode="neg"] .ks{text-decoration-color:var(--c)}:root[data-mode="neg"] .kf{text-decoration-color:var(--g)}
:root[data-mode="neg"] .kp{text-decoration-color:var(--y)}:root[data-mode="neg"] .kc{text-decoration-color:var(--m)}
/* ===================== Zine phase 2: Discover (commander cards, colour chips, battery, sticky filters) ===================== */
:root,:root[data-mode="neg"]{--shadow:#2A2A2A}:root[data-mode="pos"]{--shadow:#141414}:root[data-mode="sepia"]{--shadow:#332B23}
main{max-width:1400px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.stats{display:inline-flex;flex-wrap:wrap;gap:0;border:2px solid var(--ink)}.stats li{padding:8px 16px;color:var(--mute);font-size:.72rem;text-transform:uppercase}
.stats li+li{border-left:2px solid var(--ink)}.stats li.hl{background:var(--y);color:var(--onacc)}.stats li.hl strong{color:var(--onacc)}
/* mana colours: identity boxes and colour chips share them */
.mb-W{--mc:#F4EDCF;--mt:#141414}.mb-U{--mc:#2470BE;--mt:#FFFFFF}.mb-B{--mc:#2B2530;--mt:#F0EBDD}.mb-R{--mc:#D23B26;--mt:#FFFFFF}.mb-G{--mc:#2A8443;--mt:#FFFFFF}.mb-C{--mc:#A8A397;--mt:#141414}
.pip{width:22px;height:22px;border-radius:0;border:1.5px solid var(--ink);background:var(--mc);color:var(--mt);font:900 13px/1 var(--head);display:grid;place-items:center;font-style:normal}
/* battery: 10 cells, lit = round(pct/10); green 80+, yellow 60-79, red under 60 */
.bat{display:inline-flex;align-items:flex-end;gap:3px;width:110px;height:20px;padding:0 3px}
.bat i{display:block;flex:1 1 0;transform:skewX(-20deg);border:1.5px solid currentColor;background:repeating-linear-gradient(-45deg,currentColor 0 1px,transparent 1px 4px);opacity:.3}
.bat i.on{background:var(--bc);border-color:#0B0B0B;box-shadow:2px 0 0 #0B0B0B;opacity:1}
.bat.b10 i:nth-child(1){height:40%}.bat.b10 i:nth-child(2){height:47%}.bat.b10 i:nth-child(3){height:53%}.bat.b10 i:nth-child(4){height:60%}.bat.b10 i:nth-child(5){height:67%}
.bat.b10 i:nth-child(6){height:73%}.bat.b10 i:nth-child(7){height:80%}.bat.b10 i:nth-child(8){height:87%}.bat.b10 i:nth-child(9){height:93%}.bat.b10 i:nth-child(10){height:100%}
.bat.hi{--bc:#2A8443}.bat.mid{--bc:var(--y)}.bat.lo{--bc:#D23B26}
.bat.b5{width:40px;height:13px;gap:2px}.bat.b5 i:nth-child(1){height:40%}.bat.b5 i:nth-child(2){height:55%}.bat.b5 i:nth-child(3){height:70%}.bat.b5 i:nth-child(4){height:85%}.bat.b5 i:nth-child(5){height:100%}
/* two columns: sticky filters + the cards (static on small screens) */
.disc{display:flex;gap:32px;align-items:flex-start}
.filt{flex:0 0 260px;position:sticky;top:calc(var(--hh,0px) + 14px);max-height:calc(100vh - var(--hh,0px) - 28px);overflow-y:auto;background:var(--bg);border:2px solid var(--ink);box-shadow:6px 6px 0 var(--shadow)}
.fh{margin:0;padding:6px 12px;font-size:1.1rem;font-stretch:75%;font-weight:900;background:var(--ink);color:var(--bg)}
.fb{padding:14px 12px}.fb input[type=search]{width:100%;min-height:42px;border:0;border-bottom:2px dashed var(--ink);background:transparent}
.cchips{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.cc{min-height:44px;font:900 20px/1 var(--head);box-shadow:inset 0 -5px 0 var(--mc)}
.cc[aria-pressed="true"]{background:var(--mc);color:var(--mt);box-shadow:3px 3px 0 var(--ink);transform:translate(-1px,-1px)}
.mins{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.mins button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:52px;padding:4px;font:700 13px/1 var(--body)}
.mins button[aria-pressed="true"]{background:var(--r);color:#FFFFFF;border-color:#0B0B0B;box-shadow:inset 0 -4px 0 #0B0B0B}
.more{display:flex;flex-direction:column;gap:12px}.more label{display:flex;flex-direction:column;gap:4px;font-size:.72rem;text-transform:uppercase;color:var(--mute)}
.more select{min-height:40px;text-transform:none}
.lst{flex:1;min-width:0}#count{text-transform:uppercase;font-size:.75rem;margin:0 0 12px}
/* commander cards; an opened card spans the whole row so its panel keeps the full width */
#list{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr));gap:40px 22px;padding-top:22px;grid-auto-flow:dense;align-items:start}
.row{overflow:visible;margin:0;border-radius:14px;background:var(--bg);box-shadow:6px 6px 0 var(--shadow)}
.row[open]{grid-column:1/-1;border-radius:0}
.cmd{position:relative;display:flex;flex-direction:column;gap:6px;padding:14px 14px 10px;aspect-ratio:488/680}
.cmh{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.cmd .nm{font:800 1.15rem/1.05 var(--head);font-stretch:75%;text-transform:uppercase;overflow-wrap:anywhere}
.cmd .pips{flex:none}.ctype{font-size:.7rem;margin-top:-2px;color:var(--mute)}
.art{flex:1 1 0;min-height:0;width:100%;object-fit:cover;border:2px solid var(--ink);background:var(--bar);border-radius:0;display:block}
.facts{font-size:.75rem;line-height:1.35}
.cap{align-self:flex-start;padding:1px 5px;font:700 .62rem/1.3 var(--head);border:1.5px solid var(--ink)}.cap.go{background:var(--c);color:var(--onacc);border-color:#141414}
.foot{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;gap:10px}
.serial{font:400 .62rem/1.25 var(--serial);text-transform:uppercase;min-width:0}
.score{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:4px}.score b{font:900 1.75rem/.9 var(--head);font-stretch:75%;color:var(--ink)}
/* above the selected bracket: CMYK misregistration bands across the card */
.row.above .cmd::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.85;mix-blend-mode:multiply;
  background:linear-gradient(transparent 18%,var(--y) 18% 21%,var(--c) 21% 23%,transparent 23% 63%,var(--m) 63% 65%,var(--y) 65% 68%,transparent 68%)}
:root[data-mode="neg"] .row.above .cmd::after{mix-blend-mode:screen}
.row[open] .cmd{aspect-ratio:auto;flex-direction:row;flex-wrap:wrap;align-items:center;gap:6px 18px}
.row[open] .cmd .art,.row[open] .cmd .cap,.row[open] .cmd .facts{display:none}.row[open] .foot{margin:0 0 0 auto;gap:18px;align-items:center}
.row[open] .cmh{gap:12px}
@media(max-width:900px){.disc{flex-direction:column;align-items:stretch}.filt{position:static;max-height:none;overflow:visible;flex-basis:auto}}
/* ===================== Zine x P5, phase 3: commander panel (design/zine/P5Commander.dc.html) ===================== */
.row[open] .body{padding:20px 18px 28px}
.hero{display:flex;flex-wrap:wrap;gap:32px;align-items:flex-start}
.hcol{position:relative;flex:none;width:260px;display:flex;flex-direction:column;gap:10px}
.cslash{position:absolute;left:-60px;right:-60px;top:24%;height:120px;background:var(--r);clip-path:polygon(0 30%,100% 0,100% 70%,0 100%);transform:rotate(-14deg)}
.himg{position:relative}.himg .cimg{width:100%;border-radius:14px;border:2px solid var(--ink);box-shadow:8px 8px 0 var(--shadow);transform:rotate(-1.5deg)}
:root[data-img="copy"] .himg .cimg,:root[data-img="copy"] .mimg{filter:grayscale(1) contrast(1.4)}
.imgmode{position:relative;display:flex;border:2px solid var(--ink);background:var(--bg)}.imgmode button{flex:1;border:0;min-height:34px;font-size:.68rem}.imgmode button+button{border-left:2px solid var(--ink)}
.imgmode button[aria-pressed="true"]{background:var(--r);color:#FFFFFF;box-shadow:inset 0 -4px 0 #0B0B0B}
.hmain{flex:999 1 520px;min-width:0;display:flex;flex-direction:column;gap:14px}
.hmain .ttl.pname{margin:0}
.hmeta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:.75rem;text-transform:uppercase;color:var(--mute)}.hmeta .pip{width:28px;height:28px;border-width:2px}
.around{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}.around .lab{font-size:.7rem;font-weight:700;text-transform:uppercase}
.ar{padding:3px 10px;font:900 1.15rem/1.1 var(--head);font-stretch:75%;text-transform:uppercase;border:2px solid var(--ink)}.ar.top{background:var(--y);color:var(--onacc);border-color:var(--y)}
.mixl{margin:0;font-size:.78rem}
.sheet{display:flex;flex-direction:column;border:2px solid var(--ink);background:var(--bg)}
.srow{display:flex;flex-wrap:wrap;align-items:stretch}.srow+.srow{border-top:2px solid var(--ink)}
.slab{display:flex;align-items:center;width:120px;padding:0 12px;font:900 1.05rem/1 var(--head);font-stretch:75%;text-transform:uppercase;background:var(--ink);color:var(--bg)}
.scell{flex:1;display:flex;flex-direction:column;gap:8px;padding:10px 12px;min-width:0}.scell .srcs,.scell .tags{margin:0}
.sheet .bks{margin:0;gap:0;flex:1}
.sheet .bk{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:76px;min-height:58px;padding:0 10px;border:0;border-right:2px solid var(--ink)}
.sheet .bk b{font:900 1.2rem/1 var(--head)}.sheet .bk span{font:400 .66rem/1 var(--body);text-transform:none}
.srcb.thm b{font-weight:800}.srcb.thm span{font:400 .66rem var(--body);text-transform:none}
.tnote{font-size:.78rem;color:var(--mute);margin:0}.tnote a{color:var(--ink)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:20px;margin:26px 0 30px}
.tile{position:relative;overflow:hidden;display:flex;flex-direction:column;gap:8px;padding:18px 20px;border-radius:14px!important;background:var(--bg);border:2px solid var(--ink);box-shadow:6px 6px 0 var(--shadow);color:var(--ink);font-size:.8rem}
.tile .t{position:relative;font-weight:700;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase}
.tile .tbig{position:relative;font:900 4.6rem/.85 var(--head);font-stretch:62%;color:inherit}
.tile ul{margin:0;padding-left:16px;font-size:.75rem;line-height:1.45}.tile small{color:inherit;opacity:.8}
.tile.inv{background:var(--ink);color:var(--bg)}.tile.inv small,.tile.inv .t{color:var(--bg)}
.mburst{position:absolute;z-index:-1;right:-46px;top:-46px;width:190px;height:190px;background:var(--r);opacity:.9}
.bat.big{width:150px;height:31px}.bat.sm{width:100px;height:20px}
.cap{align-self:flex-start;padding:1px 5px;font:800 .68rem/1.3 var(--head);border:1.5px solid #141414;color:var(--onacc)}.cap.y{background:var(--y)}.cap.c{background:var(--c)}.cap.m{background:var(--m)}
.stk{align-self:flex-start;padding:1px 6px;font:900 .9rem/1.25 var(--head);color:#FFFFFF;background:var(--r);border:2px solid #0B0B0B;transform:skewX(-10deg) rotate(-3deg)}.stk.m{background:var(--m);color:#141414}
.slim{position:sticky;top:var(--hh,0px);z-index:20;display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;margin:0 -18px 26px;padding:10px 18px;background:var(--bg);border-top:4px solid var(--r);border-bottom:2px solid var(--ink);box-shadow:0 3px 0 var(--y),0 6px 0 var(--m),0 9px 0 var(--c)}
.ondeck{padding:3px 14px 1px;font:900 .72rem/1.3 var(--head);font-style:italic;letter-spacing:.08em;color:#FFFFFF;background:var(--r);clip-path:polygon(8% 0,100% 0,92% 100%,0 100%)}
.mimg{width:34px;border-radius:4px;border:2px solid var(--ink)}
.sname{font:900 1.7rem/1 var(--head);font-stretch:62%;text-transform:uppercase}
.sbat{display:flex;align-items:center;gap:8px}.sbat b{font:900 1.2rem/1 var(--head);font-stretch:75%}
.sfit{font-size:.72rem;text-transform:uppercase}.sp{flex:1 1 0}
.mbks{display:flex;border:2px solid var(--ink)}.mbk{border:0;min-width:38px;min-height:32px;padding:0 8px;font-size:.78rem}.mbk+.mbk{border-left:2px solid var(--ink)}
.slab2{display:flex;align-items:center;gap:6px;font-size:.66rem;text-transform:uppercase;color:var(--mute)}.tsel{min-height:34px;font-size:.75rem}
.tobuy{padding:4px 8px;font:700 .75rem/1 var(--serial);color:#141414;background:#F0EBDD;transform:rotate(-1deg)}
.d99{display:flex;flex-wrap:wrap;gap:32px;align-items:flex-start}
.dmain{flex:999 1 620px;min-width:0}.daside{flex:1 1 280px;max-width:360px;display:flex;flex-direction:column;gap:22px}
.dmain .grp h5{font-size:1.2rem;font-stretch:75%;font-weight:900;border-bottom:2px solid var(--ink);padding-bottom:2px}
.dmain .grid{grid-template-columns:repeat(auto-fill,minmax(124px,1fr));gap:18px 14px}
.cw{display:flex;flex-direction:column;gap:5px}
.cw .ct img.c{outline:0!important;border:2px solid var(--ink);box-shadow:5px 5px 0 var(--shadow)}
.cw.k-y .ct img.c{box-shadow:5px 5px 0 var(--y)}.cw.k-k .ct img.c{box-shadow:5px 5px 0 var(--r)}.cw.k-c .ct img.c{box-shadow:5px 5px 0 var(--m)}
.cw.k-s .ct img.c{box-shadow:5px 5px 0 var(--c)}.cw.k-f .ct img.c{box-shadow:5px 5px 0 var(--g)}.cw.k-y2 .ct img.c,.cw.k-s2 .ct img.c{box-shadow:5px 5px 0 #F0EBDD}
.cw.k-buy .ct img.c{outline:3px dashed var(--ink);outline-offset:2px}
.cw.wpin .ct img.c{outline:4px solid var(--r)!important;outline-offset:2px}
.tape{align-self:flex-start;max-width:100%;padding:1px 5px;font:700 .62rem/1.3 var(--head);text-transform:uppercase;border:1.5px solid var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tape.y{background:var(--y);color:#141414;border-color:var(--y)}.tape.m{background:var(--m);color:#141414;border-color:var(--m)}.tape.c{background:var(--c);color:#141414;border-color:var(--c)}
.tape.g{background:var(--g);color:#141414;border-color:var(--g)}.tape.r{background:var(--r);color:#FFFFFF;border-color:var(--r)}
.tape.w{background:#F0EBDD;color:#141414;border-color:#141414}.tape.d{border-style:dashed}
.ct{position:relative}.was{position:absolute;right:-7px;bottom:-7px;z-index:2;width:42%;display:block;transform:rotate(5deg)}
.was img{display:block;width:100%;aspect-ratio:488/680;object-fit:cover;border:2px solid var(--ink);border-radius:5px;filter:grayscale(1) contrast(1.15)}
.was i{position:absolute;left:-4px;top:-8px;padding:0 4px;font:900 .6rem/1.3 var(--head);font-style:normal;text-transform:uppercase;color:#141414;background:#F0EBDD;border:1.5px solid #141414}
.tlg{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin:4px 0 10px;font-size:.7rem;color:var(--mute)}.tlg .tape{cursor:help}
.cwarn{margin:0 0 6px;padding:2px 6px;font-size:.72rem;font-weight:700;color:#141414;background:var(--m)}
.ct.nown img.c{outline:2px dashed var(--ink);outline-offset:2px}
.tapew{font-size:.62rem;line-height:1.25;color:var(--mute);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.whyhint{font-size:.7rem;text-transform:uppercase;margin:12px 0 0}
.pnl{display:flex;flex-direction:column;gap:10px;padding:0 14px 14px;border:2px solid var(--ink);background:var(--bg);font-size:.8rem}
.pnl.pc{border-top:6px solid var(--c);box-shadow:5px 5px 0 var(--c)}.pnl.py{border-top:6px solid var(--y);box-shadow:5px 5px 0 var(--y)}
.ptl{align-self:flex-start;margin:-4px 0 0 -6px;padding:2px 8px;font-size:1.2rem;font-stretch:75%;color:#141414;transform:rotate(-1.5deg)}.pc .ptl{background:var(--c)}.py .ptl{background:var(--y);transform:rotate(1deg)}
.pnl.why{padding:0 16px 16px;box-shadow:7px 7px 0 var(--r)}
.wtl{align-self:flex-start;margin:-14px 0 0 -8px;padding:3px 12px 1px;font-size:1.25rem;font-stretch:75%;color:#FFFFFF;background:var(--r);border:2px solid #0B0B0B;transform:skewX(-10deg) rotate(-2deg)}
.whead{display:flex;gap:12px;align-items:flex-start}.why img.c.wthumb{width:74px;flex:none;border:2px solid var(--ink)}
.wtxt{display:flex;flex-direction:column;gap:4px;min-width:0}.wname{font:900 1.3rem/1 var(--head);font-stretch:75%;text-transform:uppercase}
.wline{font-size:.72rem}.wmode{align-self:flex-start;font:700 .62rem/1.3 var(--head);text-transform:uppercase;padding:1px 5px;border:1.5px dashed var(--ink)}
.wmode.on{background:var(--r);color:#FFFFFF;border:1.5px solid #0B0B0B}
.wparts{margin:0;display:flex;flex-direction:column}.wparts div{display:flex;flex-direction:column;gap:1px;padding:6px 0;border-top:1.5px dashed var(--ink)}
.wparts dt{font-weight:700;font-size:.62rem;text-transform:uppercase;color:var(--mute)}.wparts dd{margin:0;font-size:.8rem}
.wbtn{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.wbtn .pinb{flex:1;min-height:36px;padding:0 8px;border:2px solid var(--ink)!important;color:#141414;font:800 .7rem var(--head);text-transform:uppercase}
.wbtn .pa{background:var(--y)}.wbtn .pn{background:var(--m)}.wsf{font-size:.72rem}
.swp{display:flex;flex-direction:column;gap:2px}.swp .in{align-self:flex-start;padding:0 4px;background:var(--c);color:#141414}.swp s{text-decoration-color:var(--m);text-decoration-thickness:2px}.swp small{font-size:.66rem}
.pins{margin:0}.pchips{display:flex;flex-wrap:wrap;gap:6px}
.pchip{display:inline-flex;align-items:center;gap:4px;padding:2px 4px 2px 8px;font-size:.72rem;font-weight:700;color:#141414}.pchip.in{background:var(--y)}.pchip.out{background:var(--m)}.pchip .pinx{color:#141414}
.padd{display:flex;gap:6px}.padd .pinq{flex:1;min-width:0;width:auto;border:0;border-bottom:2px dashed var(--ink);background:transparent}
.padd .pa,.padd .pn{min-height:36px;padding:0 10px;font-size:.68rem;color:#141414;border:2px solid var(--ink)}.padd .pa{background:var(--y)}.padd .pn{background:var(--m)}
.rcpt{display:flex;flex-direction:column;gap:6px;padding:16px 16px 24px;margin:0;font:400 .85rem/1.35 var(--serial);color:#141414!important;background:#F0EBDD!important;border:0!important;transform:rotate(1deg);box-shadow:6px 6px 0 var(--shadow);
  clip-path:polygon(0 0,100% 0,100% calc(100% - 8px),95% 100%,90% calc(100% - 8px),85% 100%,80% calc(100% - 8px),75% 100%,70% calc(100% - 8px),65% 100%,60% calc(100% - 8px),55% 100%,50% calc(100% - 8px),45% 100%,40% calc(100% - 8px),35% 100%,30% calc(100% - 8px),25% 100%,20% calc(100% - 8px),15% 100%,10% calc(100% - 8px),5% 100%,0 calc(100% - 8px))}
.rcpt .rh{text-align:center;letter-spacing:.1em}.rcpt .rl{border-top:2px dashed #141414}.rcpt .rr{display:flex;justify-content:space-between;gap:8px}.rcpt .rr a{color:#141414;text-transform:uppercase}
.rcpt small,.rcpt .dim{color:#4A4740}.rcpt .rbtn{display:flex;gap:8px;margin-top:4px}.rcpt button{flex:1;min-height:36px;font:700 .75rem var(--serial);color:#141414;border-color:#141414}
.gh{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:12px}.gh p{margin:0;font-size:.75rem}
.gslot{display:flex;flex-wrap:wrap;gap:18px;align-items:stretch;padding:16px 0 22px;border-bottom:2px dashed var(--ink)}
.gmiss{position:relative;width:150px;aspect-ratio:488/680;padding:12px;display:flex;flex-direction:column;justify-content:space-between;border-radius:12px;border:2px dashed var(--ink);overflow:hidden;
  background:linear-gradient(to top right,transparent calc(50% - 1px),var(--m) 50%,transparent calc(50% + 1px)),linear-gradient(to top left,transparent calc(50% - 1px),var(--m) 50%,transparent calc(50% + 1px))}
.gname{position:relative;font:800 17px/1.1 var(--head)}.nib{position:relative;align-self:flex-start;padding:1px 4px;font:700 10px/1.3 var(--head);color:var(--bg);background:var(--ink)}.gmeta{position:relative;font-size:11px;text-transform:uppercase}
.gmc{display:flex;flex-direction:column;gap:6px}.gmc .shopl{font-size:11px}
.garr{display:flex;align-items:center;font:900 40px var(--head)}
.gopts{flex:1 1 520px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px}
.gopt{display:flex;flex-direction:column;gap:4px;text-align:left;min-height:120px;padding:12px 14px;border:2px solid var(--ink);border-radius:10px;background:transparent;color:var(--ink);font:400 12px/1.4 var(--body);text-transform:none;letter-spacing:0}
.gopt .gk{font:700 11px var(--body);text-transform:uppercase}.gopt b{font:800 17px/1.15 var(--head)}
.gopt.on{background:var(--r);color:#FFFFFF;border-color:var(--ink);box-shadow:6px 6px 0 var(--ink);transform:skewX(-4deg) rotate(-1.5deg)}
.gopt .stk{margin-top:auto;padding:1px 5px;font:800 11px/1.3 var(--head);transform:skewX(-10deg) rotate(-4deg);animation:p5drop .35s cubic-bezier(.2,1.6,.4,1) both}
.gsec,.ssec{display:flex;flex-direction:column;gap:20px}.gsec h3.p5-slab,.ssec h3.p5-slab{margin:0;font-size:clamp(2.2rem,4.6vw,3.5rem);line-height:.9}
.gsec>details.more>summary{display:inline;align-self:flex-start;font-size:12px;text-transform:uppercase;border-bottom:2px solid var(--r)}
@media(max-width:760px){.slim .wide{display:none}.hcol{width:200px}.slab{width:100%;padding:6px 12px}.sheet .bk{min-width:60px}.garr{display:none}.daside{max-width:none}}
/* ===================== Zine x P5, phase 2b: red, slants, ransom letters, motion (from design/zine/P5Discover.dc.html) ===================== */
:root{--r:#E5191C}:root[data-mode="sepia"]{--r:#A6402B}
/* ===== Persona-5 energy: red slabs, ransom letters, slashes, snap motion ===== */
@keyframes p5in{from{opacity:0;transform:translateX(-70px) skewX(-18deg)}60%{opacity:1;transform:translateX(6px) skewX(3deg)}}
@keyframes p5drop{from{opacity:0;transform:translateY(-46px) rotate(-14deg) scale(1.35)}}
@keyframes p5tick{to{transform:translateX(-50%)}}
@keyframes p5spin{to{transform:rotate(360deg)}}
@keyframes p5slash{from{clip-path:polygon(0 12%,0 0,0 88%,0 100%)}}
.p5-in{animation:p5in .6s cubic-bezier(.2,.9,.25,1) both}
.p5-card{isolation:isolate;transition:transform .18s cubic-bezier(.3,1.6,.5,1),box-shadow .18s}
.p5-card:hover{transform:rotate(-2deg) translateY(-8px) scale(1.03);box-shadow:12px 12px 0 var(--r) !important}
.p5-slab{align-self:flex-start;display:inline-block;padding:8px 26px 2px 14px;color:var(--bg);background:var(--ink);transform:skewX(-10deg) rotate(-2deg);box-shadow:10px 8px 0 var(--r)}
.p5-slab>span{display:inline-block;transform:skewX(10deg)}
.p5-slash{position:absolute;inset:0 -70px 0 -90px;background-color:var(--r);background-image:radial-gradient(circle,rgba(0,0,0,.28) 0 2px,transparent 2.4px);background-size:8px 8px;clip-path:polygon(4% 14%,100% 0,93% 86%,0 100%);transform:rotate(-3deg);animation:p5slash .45s cubic-bezier(.2,.9,.3,1) both}
.p5-ticker{margin:0 -40px;transform:rotate(-1deg);border-block:3px solid #0B0B0B;color:#FFFFFF;font-family:"Archivo",sans-serif;font-weight:900;font-stretch:75%;font-size:18px;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
.p5-track{display:flex;width:max-content;animation:p5tick 32s linear infinite}
.p5-track span{padding:6px 2em 4px 0}
.p5-head{clip-path:polygon(0 0,100% 0,95% 100%,0 100%);border-left:8px solid var(--r)}
.p5-burst{clip-path:polygon(50% 0,61% 30%,93% 15%,73% 43%,100% 55%,69% 63%,80% 96%,52% 74%,27% 98%,33% 66%,0 62%,27% 44%,7% 14%,39% 29%);animation:p5spin 40s linear infinite}
.p5-h1{font-size:96px}.p5-h1c{font-size:78px}
@media (max-width:760px){.p5-h1{font-size:54px}.p5-h1c{font-size:46px}.p5-slash{inset:0 -20px 0 -30px}}
/* buttons skew on hover (the mockup's [data-band] rule, on the report's own controls) */
.modes button,.bk,.srcb,.mins button,.cc,.vt,.cp,.cps,.reset-ch,.up{transition:transform .14s cubic-bezier(.3,1.7,.5,1),box-shadow .08s steps(2)}
.modes button:hover,.bk:hover,.srcb:not(:disabled):hover,.mins button:hover,.cc:hover,.vt:hover,.cp:hover,.cps:hover,.reset-ch:hover,.up:hover{transform:skewX(-8deg) translateY(-2px)}
/* the chosen substitute in a card's bubble: red too */
.bub .opt.on{background:var(--r);color:#FFFFFF;border-color:#0B0B0B;box-shadow:inset 0 -4px 0 #0B0B0B}.bub .opt.on small{color:#FFFFFF}
/* header brand + ransom-note titles over a red halftone slash */
.brand{font:900 2.2rem/1 var(--head);font-stretch:62%;text-transform:uppercase;text-shadow:2px 0 0 rgba(0,174,239,.85),-2px 1px 0 rgba(236,0,140,.85)}
.ttl{position:relative;align-self:flex-start;display:inline-block;padding:18px 30px 22px 10px;margin:8px 0 6px 6px}
.ttl h1,.ttl h2{position:relative;margin:0;display:flex;flex-direction:column;gap:8px;line-height:1;text-shadow:none;letter-spacing:0}
.ttl h1>span,.ttl h2>span{display:flex;flex-wrap:wrap;align-items:flex-end}
.pname h2.p5-h1c{font-size:clamp(34px,5.4vw,64px)}
.rl{display:inline-block;margin:0 .03em;padding:.04em .09em 0;line-height:.95;text-transform:uppercase;font-size:var(--sz);transform:rotate(var(--rot));box-shadow:4px 4px 0 rgba(0,0,0,.45);animation:p5drop .5s cubic-bezier(.2,1.5,.4,1) both;animation-delay:var(--d)}
.rl0{background:var(--ink);color:var(--bg);font-family:var(--head);font-weight:900;font-stretch:62%}
.rl1{background:var(--r);color:#FFFFFF;font-family:var(--head);font-weight:900;font-stretch:100%}
.rl2{background:#F0EBDD;color:#0B0B0B;font-family:var(--serial);font-weight:700}
.rl3{background:transparent;color:var(--ink);font-family:var(--head);font-weight:900;font-stretch:75%;font-style:italic;outline:3px solid var(--ink);outline-offset:-3px}
.rl4{background:#0B0B0B;color:#F0EBDD;font-family:Georgia,"Times New Roman",serif;font-weight:700;font-style:italic}
.rl5{background:var(--y);color:#0B0B0B;font-family:var(--head);font-weight:800;font-stretch:125%}
.rsp{display:inline-block;width:.32em}
/* ticker: a red slanted strip of real numbers */
.tickw{position:relative;overflow:hidden;padding:12px 0;margin:4px 0}.tickw .p5-ticker{background:var(--r)}
/* section titles */
h3.p5-slab{margin:22px 0 14px;font:900 clamp(1.6rem,3.4vw,2.6rem)/1 var(--head);font-stretch:62%;text-transform:uppercase}
/* Discover cards: tilt + red shadow on hover (closed cards only), entry stagger, #1-#3 tags */
.row.p5-card:not([open]):hover{transform:rotate(-2deg) translateY(-8px) scale(1.03)}
.row[open].p5-card{transform:none}.row[open].p5-card:hover{box-shadow:6px 6px 0 var(--shadow) !important}
.rank{position:absolute;z-index:3;left:-12px;top:-34px;padding:0 14px;font:900 34px/1.15 var(--head);font-stretch:75%;color:#FFFFFF;background:var(--r);border:2px solid #0B0B0B;box-shadow:4px 4px 0 #0B0B0B;transform:skewX(-12deg) rotate(-7deg)}
.rank.r2{font-size:30px}.rank.r3{font-size:26px}.row[open] .rank{display:none}
/* deck cards slide in when they reach the screen (IntersectionObserver; Firefox-safe, no view() timelines) */
/* ---------- views: nav, Collection page (phase 3b) ---------- */
.vnav{display:flex;border:2px solid var(--ink)}
.vnav a{padding:10px 16px;font:800 14px/1 var(--head);letter-spacing:.04em;text-transform:uppercase;text-decoration:none;color:var(--ink)}
.vnav a+a{border-left:2px solid var(--ink)}.vnav a[aria-current="page"]{color:#FFFFFF;background:var(--r);box-shadow:inset 0 -4px 0 #0B0B0B}
.hfile{margin-left:auto;font-size:12px;text-transform:uppercase;color:var(--mute);overflow-wrap:anywhere}.hfile b{color:#141414;background:var(--y);padding:0 4px}.hfile~.modes{margin-left:0}
.chero{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:24px;margin:8px 0 34px}
.cstats{margin:0;display:flex;flex-wrap:wrap;border:2px solid var(--ink);box-shadow:8px 8px 0 var(--r);background:var(--bg)}
.cstats div{display:flex;flex-direction:column-reverse;padding:10px 20px}.cstats div+div{border-left:2px solid var(--ink)}
.cstats dt{font-size:11px;text-transform:uppercase}.cstats dd{margin:0;font:900 40px/1 var(--head);font-stretch:75%}.cstats .u{color:#FFFFFF;background:var(--r)}
#coll{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(440px,100%),1fr));gap:28px;align-items:stretch;margin:0;padding:16px 0 0;border:0;background:none;font-size:inherit}
.ccard{position:relative;display:flex;flex-direction:column;gap:14px;padding:0 20px 20px;border:2px solid var(--ink);background:var(--bg);box-shadow:8px 8px 0 var(--shadow)}.ccard+.ccard{animation-delay:90ms}
.ccard>h2{align-self:flex-start;margin:-16px 0 0 -10px;padding:4px 14px 2px;font-size:24px;font-stretch:75%;color:var(--bg);background:var(--ink);transform:skewX(-10deg) rotate(-2deg);box-shadow:6px 5px 0 var(--r)}
.cfile{display:flex;flex-direction:column;gap:2px}.cfile b{font:700 18px var(--serial);overflow-wrap:anywhere}.cfile span{font-size:12px;text-transform:uppercase;color:var(--mute)}
.drop{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:170px;padding:18px;cursor:pointer;text-align:center;border:3px dashed var(--ink);background-image:repeating-linear-gradient(-45deg,transparent 0 14px,var(--grid) 14px 16px)}
.drop.over,.drop:focus-within{border-color:var(--r);background-color:rgba(229,25,28,.1)}.drop small{font-size:11px;text-transform:uppercase}
.drop input{position:absolute;width:1px;height:1px;opacity:0}
.dlab{padding:6px 18px 4px;font:900 26px/1.1 var(--head);font-stretch:75%;text-transform:uppercase;color:#FFFFFF;background:var(--r);border:2px solid #0B0B0B;box-shadow:5px 5px 0 #0B0B0B;transform:skewX(-10deg) rotate(-2deg)}
#ups{font-weight:700;color:var(--ink)}#ups:empty{display:none}
.chg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.chg div{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border:2px solid #0B0B0B;box-shadow:5px 5px 0 #0B0B0B;transform:skewX(-6deg) rotate(-2deg);animation-delay:200ms}
.chg b{font:900 46px/.95 var(--head);font-stretch:75%}.chg span{font-weight:700;font-size:12px;text-transform:uppercase}
.chg .add{color:#FFFFFF;background:#2A8443}.chg .rem{color:#FFFFFF;background:var(--r);transform:skewX(-6deg) rotate(1.5deg);animation-delay:290ms}
.chg .ncm{color:#0B0B0B;background:var(--y);transform:skewX(-6deg) rotate(-1deg);animation-delay:380ms}
.ncs{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.lbl{font-size:11px;font-weight:700;text-transform:uppercase}
.nc{padding:4px 10px;font:800 14px/1.2 var(--head);text-decoration:none;color:#0B0B0B !important;background:var(--y);border:2px solid #0B0B0B}
#coll .clist{font-size:.8rem}#coll .clist>summary{display:inline;padding:0;font-size:12px;text-transform:uppercase;border-bottom:2px solid var(--r)}
.shead{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:22px}
.shead h2.p5-slab,#unused>h2.p5-slab{margin:0;font-size:clamp(2rem,5vw,3.25rem);font-stretch:62%;line-height:.9}
.irow{margin:0 0 22px 14px}.irow:nth-of-type(2){animation-delay:90ms}.irow:nth-of-type(3){animation-delay:180ms}.irow:nth-of-type(4){animation-delay:270ms}
.irow>summary{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:14px 28px;padding:16px 22px 16px 70px}
.ino{position:absolute;left:-14px;top:50%;translate:0 -50%;display:grid;place-items:center;width:64px;height:64px;font:900 30px/1 var(--head);color:#FFFFFF;background:#0B0B0B;border:2px solid var(--ink);transform:skewX(-10deg) rotate(-6deg)}.ino.first{background:var(--r)}
.inm{flex:1 1 260px;display:flex;flex-direction:column;gap:2px;min-width:0}.inm b{font:900 30px/1 var(--head);font-stretch:75%;text-transform:uppercase}.inm span{font-size:12px;text-transform:uppercase;color:var(--mute)}
.iown{display:flex;align-items:center;gap:12px}.iown>span:last-child{display:flex;flex-direction:column;line-height:1.1}.iown b{font:900 30px/1 var(--head);font-stretch:75%}.iown small{font-size:11px;text-transform:uppercase}
.icb{padding:3px 10px;font-weight:700;font-size:12px;text-transform:uppercase;color:#0B0B0B;background:var(--m);transform:skewX(-8deg)}
.iopen{display:inline-flex;align-items:center;min-height:44px;padding:0 18px;font:900 14px/1 var(--head);text-transform:uppercase;color:#FFFFFF;background:var(--r);border:2px solid var(--ink)}
.iopen::before{content:"Open"}.irow[open] .iopen{color:var(--bg);background:var(--ink)}.irow[open] .iopen::before{content:"Close"}
#unused{display:flex;flex-direction:column;gap:20px}
.ulead{margin:0;max-width:80ch;font-size:16px;line-height:1.6}.ulead .big{padding:0 6px;font:900 22px var(--head);color:#FFFFFF;background:var(--r)}.ulead .hy{padding:0 4px;color:#0B0B0B;background:var(--y)}
.uhs{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.uh{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 14px;font:800 15px var(--head);color:var(--ink);background:transparent;border:2px solid var(--ink);transform:skewX(-8deg);cursor:pointer}
.uh.first{color:#FFFFFF;background:var(--r);box-shadow:5px 5px 0 var(--ink)}.uh b{padding:0 6px;font-size:18px;color:#0B0B0B;background:var(--y)}.uh.first b{background:#FFFFFF}
.uh[aria-pressed="true"]{outline:3px solid var(--y);outline-offset:3px}
.ugrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:24px 20px}
.ucard{display:flex;gap:16px;padding:16px;color:var(--ink);background:var(--bg);border:2px solid var(--ink);box-shadow:6px 6px 0 var(--shadow)}
.ucard:nth-child(2){animation-delay:80ms}.ucard:nth-child(3){animation-delay:160ms}.ucard:nth-child(4){animation-delay:240ms}
.ucard .c{display:block;align-self:flex-start;width:86px;height:auto;flex:none;aspect-ratio:488/680;border-radius:6px;border:2px solid var(--ink);background:var(--bar);transform:rotate(-3deg);box-shadow:4px 4px 0 var(--r)}
:root[data-img="copy"] .ucard img.c{filter:grayscale(1) contrast(1.3)}
.uinfo{display:flex;flex-direction:column;gap:6px;min-width:0}.uinfo>b{font:900 22px/1 var(--head);font-stretch:75%;text-transform:uppercase}
.bh{align-self:flex-start;padding:1px 8px;font-weight:700;font-size:10px;text-transform:uppercase;color:#FFFFFF;background:#0B0B0B;transform:skewX(-10deg)}
.uinfo>a{align-self:flex-start;font:800 15px var(--head);text-decoration:none;border-bottom:3px solid var(--r)}.uinfo small{font-size:12px}
.umore{align-self:flex-start;padding:8px 14px;font:900 14px var(--head);text-transform:uppercase;color:var(--bg);background:var(--ink);border:0;cursor:pointer}
/* ---------- Deck stats & combos: post-it pile (Phase 4); note text is always #141414 ---------- */
.pile{position:relative;max-width:1120px;margin-top:6px}.n-curve{--nc:var(--y)}.n-types{--nc:var(--c)}.n-power{--nc:var(--m)}.n-combos{--nc:#F0EBDD}
.ptabs{position:relative;z-index:3;display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px;padding-left:28px}
.ptab{position:relative;cursor:pointer;padding:9px 18px 10px;font:900 16px/1.1 var(--head);font-stretch:75%;text-transform:uppercase;color:#141414;background:var(--nc);border:2px solid #141414;border-radius:6px 6px 0 0;box-shadow:3px -2px 0 rgba(0,0,0,.35);opacity:.92}
.ptab.n-curve{transform:rotate(-2deg)}.ptab.n-types{transform:rotate(1.5deg)}.ptab.n-power{transform:rotate(-1deg)}.ptab.n-combos{transform:rotate(2deg)}
.ptab[aria-selected="true"]{padding:14px 22px 18px;margin-bottom:-8px;font-size:20px;border-bottom:0;transform:none;box-shadow:none;opacity:1}
.pstack{position:relative}.pback{position:absolute;inset:0;background:var(--nc);border:2px solid #141414;box-shadow:6px 6px 0 rgba(0,0,0,.35)}
.pback.b2{transform:translate(14px,12px) rotate(2.2deg)}.pback.b1{transform:translate(-8px,8px) rotate(-1.6deg)}
.pnote{position:relative;z-index:2;min-height:560px;display:flex;flex-direction:column;gap:16px;padding:34px 36px 30px;color:#141414;border:2px solid #141414;box-shadow:8px 8px 0 var(--shadow);
  background:var(--nc) linear-gradient(transparent 31px,rgba(0,0,0,.07) 32px) 0 0/100% 32px}
.pnote[hidden]{display:none}.pnote a{color:#141414}.pnote small,.pnote .dim{color:#141414}
.ptape{position:absolute;top:-14px;left:46%;width:120px;height:28px;background:rgba(255,255,255,.45);border:1px solid rgba(0,0,0,.08);transform:rotate(-3deg)}
.nh{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:10px}.pnote h4{margin:0;font:900 48px/.9 var(--head);font-stretch:62%;text-transform:uppercase;color:#141414}
.nlg{display:flex;flex-wrap:wrap;gap:8px;font-size:13px;font-weight:700;text-transform:uppercase}.nlg>span{display:inline-flex;align-items:center;gap:8px;padding:4px 10px}
.nlg .ly{color:#FFFFFF;background:#141414}.nlg .ly i{width:16px;height:16px;background:#FFFFFF}.nlg .lr{background:#FFFFFF;border:2px solid #141414}.nlg .lr i{width:16px;height:16px}
.hatch{background-color:#FFFFFF;background-image:repeating-linear-gradient(45deg,#141414 0 2px,transparent 2px 7px);border:2px solid #141414;box-sizing:border-box}
.nsay{margin:0;padding:10px 14px;font-size:15px;line-height:1.45;background:rgba(255,255,255,.55);border-left:6px solid #141414}
.nfacts{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}.nfacts div{display:flex;flex-direction:column;padding:8px 10px;border:2px solid #141414}
.nfacts span{font-size:11px;text-transform:uppercase}.nfacts b{font:900 26px/1.05 var(--head);font-stretch:75%}
.ncurve{display:flex;align-items:flex-end;gap:14px;height:300px;padding-top:30px;border-bottom:3px solid #141414}
.cpair{flex:1;height:100%;display:flex;align-items:flex-end;justify-content:center;gap:4px}
.cy,.ca{flex:1;max-width:46px;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px}
.cy i,.ca i{display:block;width:100%;box-sizing:border-box}.cy i{background:#141414;border:2px solid #141414}.cy b{font:900 22px/1 var(--head)}.ca span{font-size:14px;line-height:1}
.nmv{display:flex;gap:14px}.nmv div{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px}.nmv b{font:900 18px var(--head);text-transform:uppercase;white-space:nowrap}
.vd{justify-self:start;padding:2px 8px;font:900 13px var(--head);white-space:nowrap;border:2px solid #141414}.vd.d1{color:#FFFFFF;background:#141414}
.vd.d2{color:#FFFFFF;background:var(--r);transform:skewX(-8deg)}.nfoot{margin:0;font-size:12px}
.trow{display:grid;grid-template-columns:150px 1fr 120px;gap:6px 14px;align-items:center;padding:8px 0;border-bottom:1.5px dashed #141414}
.tn{font:900 20px var(--head);font-stretch:75%;text-transform:uppercase}.tb{display:flex;flex-direction:column;gap:4px}.tb div{display:flex;align-items:center;gap:8px}
.tb i{display:block;height:18px;box-sizing:border-box}.tb div:first-child i{background:#141414;border:2px solid #141414}.tb b{font-size:15px}.tb span{font-size:13px}
.prow{display:grid;grid-template-columns:170px 1fr 40px;gap:4px 14px;align-items:center;padding-bottom:10px;border-bottom:1.5px dashed #141414}
.pk{font:800 16px var(--head);text-transform:uppercase}.prow>b{text-align:right;font:900 22px var(--head)}.pw{grid-column:2/4;font-size:12px}
.pcells{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:4px}.pcells i{height:20px;border:2px dashed #141414;opacity:.5}
.pcells i.on{border-style:solid;opacity:1;background:rgba(255,255,255,.35) radial-gradient(circle,#141414 0 1.6px,transparent 1.9px) 0 0/4px 4px}
.ncount{font-size:12px;text-transform:uppercase}.nbest{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border:2px solid #141414;background:rgba(255,255,255,.35)}
.nbest .lbl{font-size:11px;font-weight:700;text-transform:uppercase}.nbest>b{font:800 20px var(--head)}.nbest>b a{text-decoration:none}.nbest>span{font-size:12px}
.ntags{display:flex;gap:6px}.ntags span{padding:1px 6px;font-weight:700;font-size:11px;text-transform:uppercase;border:1.5px solid #141414}.ntags .inv{color:#F0EBDD;background:#141414}
.ndz{display:flex;flex-direction:column}.dzh{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;padding-bottom:6px;border-bottom:3px solid #141414}
.dzh b{font:900 24px var(--head);font-stretch:75%;text-transform:uppercase}.dzh span{font-size:11px}
.dzr{display:grid;grid-template-columns:1fr auto;gap:4px 12px;padding:9px 0;border-bottom:1.5px dashed #141414}.dzr b{font:800 15px var(--head)}.dzr b a{text-decoration:none}
.dzr>span{font-size:11px;text-transform:uppercase}.dzr>span.bad{padding:0 5px;color:#F0EBDD;background:#141414}
.pnote details.more>summary{display:inline;align-self:flex-start;font-size:12px;text-transform:uppercase;color:#141414;border-bottom:2px solid #141414}
.pnote .tag{color:#141414;border-color:#141414}.pnote b.miss{color:#B3161A}
@media(max-width:760px){.trow{grid-template-columns:1fr}.prow{grid-template-columns:1fr 34px}.prow .pcells{grid-column:1/3}.pw{grid-column:1/3}.ncurve{gap:4px;height:220px}.nmv{gap:4px}.nmv b{font-size:12px}.pnote{padding:28px 16px 20px}}
/* ---------- autocomplete dropdown (every search box) ---------- */
.acl{position:fixed;z-index:80;margin:0;padding:0;list-style:none;max-width:min(520px,94vw);max-height:min(440px,60vh);overflow-y:auto;
  background:var(--bg);color:var(--ink);border:2px solid var(--ink);box-shadow:6px 6px 0 var(--r)}
.acl li{display:flex;align-items:center;gap:10px;min-height:44px;padding:4px 10px 4px 6px;cursor:pointer;border-bottom:1.5px dashed var(--line)}
.acl li:last-child{border-bottom:0}.acl img{flex:none;width:34px;aspect-ratio:488/680;object-fit:cover;border:1.5px solid var(--ink);border-radius:3px}
.acl img.art{width:46px;aspect-ratio:4/3}.acl .an{display:flex;flex-direction:column;gap:2px;min-width:0}
.acl b{font:800 15px/1.15 var(--head);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.acl small{font-size:11px;color:var(--mute);display:flex;gap:6px;align-items:center}
.acl small .pip{width:14px;height:14px;font-size:9px}.acl mark{background:var(--y);color:#141414;padding:0 1px}
.acl li[aria-selected="true"]{background:var(--r);color:#FFFFFF}.acl li[aria-selected="true"] small{color:#FFFFFF}
/* ---------- add a deck (Collection page, app only) ---------- */
.dadd{margin:0 0 30px 14px;padding-top:2px}.dadd .dropd{min-height:120px}.dadd .dlab{font-size:22px}
.dl{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:700;text-transform:uppercase}
.dtext{width:100%;font:13px/1.4 var(--body);padding:8px;resize:vertical}.drow{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px}
.drow .dl{flex:1 1 240px}.dname{padding:8px;font:14px var(--body);border:2px solid var(--ink);background:var(--bg);color:var(--ink)}
.dsave{min-height:44px;padding:0 18px;font:900 14px var(--head);text-transform:uppercase;color:#FFFFFF;background:var(--r);border:2px solid var(--ink);cursor:pointer}
.dmsg{font-weight:700}.dmsg:empty{display:none}.ddel{margin-left:10px;padding:2px 8px;font-size:12px;cursor:pointer}
/* ---------- card counts (F3) ---------- */
.uq{font-size:11px;font-weight:700;text-transform:uppercase}
.ushort{padding:12px 16px;border:2px solid var(--ink);border-left:8px solid var(--r);background:var(--card)}
.ushort h3{margin:0 0 8px;font-size:18px}.ushort ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px;font-size:13px}
.ushort em{font-style:normal;font-weight:700;padding:0 5px;color:#FFFFFF;background:var(--r)}
/* ---------- deck analysis (F4) ---------- */
.an{display:flex;flex-direction:column;gap:12px;margin:10px 0 22px}.an h3.p5-slab{margin:0;font-size:clamp(1.8rem,4vw,2.8rem)}
.an h4{margin:10px 0 4px}.ancols{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.ancols ul{margin:0;padding-left:18px;font-size:13px;line-height:1.5}.ang li::marker{content:"✓ ";color:#2A8443}.anb li::marker{content:"✗ ";color:var(--r)}.anb li.nm::marker{content:""}
.anl{display:flex;flex-wrap:wrap;gap:12px}.anl .alt{width:132px}.anl small{display:block;font-size:11px;line-height:1.3}
/* ---------- sticky slim header, sticky sidebar controls, sliding switch, resets (Discover fixes) ---------- */
.zh{position:sticky;top:0;z-index:45;margin:0 -16px 4px;padding:10px 16px;background:var(--bg);transition:padding .2s}
.zh.small{padding-top:5px;padding-bottom:5px;border-bottom:2px solid var(--ink);box-shadow:0 3px 0 var(--y),0 6px 0 var(--m),0 9px 0 var(--c)}
.zh.small .brand{font-size:1.5rem}.zh.small .hfile{display:none}.zh.small .vnav a{padding-top:6px;padding-bottom:6px}.zh.small .modes button{min-height:28px}
a.brand{text-decoration:none;color:var(--ink)}
details.row{scroll-margin-top:calc(var(--hh,0px) + 12px)}
.filt .slider{display:flex;flex-direction:column;align-items:stretch;gap:8px;margin:0;padding:12px;border:0;background:transparent}
#br{-webkit-appearance:none;appearance:none;flex:none;width:100%;height:10px;margin:6px 0 0;border:2px solid var(--ink);background:linear-gradient(90deg,var(--r) 0 var(--p,0%),transparent var(--p,0%));cursor:pointer}
#br::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;background:var(--r);border:2px solid #0B0B0B;box-shadow:3px 3px 0 #0B0B0B;transform:skewX(-12deg);transition:transform .15s cubic-bezier(.3,1.7,.5,1)}
#br::-moz-range-thumb{width:18px;height:18px;border-radius:0;background:var(--r);border:2px solid #0B0B0B;box-shadow:3px 3px 0 #0B0B0B;transform:skewX(-12deg);transition:transform .15s cubic-bezier(.3,1.7,.5,1)}
#br:active::-webkit-slider-thumb{transform:skewX(-12deg) scale(1.25)}#br:active::-moz-range-thumb{transform:skewX(-12deg) scale(1.25)}
.brt{display:flex;justify-content:space-between;align-self:stretch;gap:2px;padding:0 4px;font:800 11px/1 var(--head)}.brt span{flex:0 0 auto}#bv{display:inline-block;align-self:flex-start;min-width:0;font:900 16px var(--head);text-transform:uppercase;color:var(--ink)}
.seg{position:relative;display:flex;border:2px solid var(--ink)}.seg .srcb{flex:1 1 0;position:relative;z-index:1;border:0;margin:0;background:transparent !important;box-shadow:none !important}
.seg .srcb.on{color:#FFFFFF}.seg .srcb+.srcb{border-left:2px solid var(--ink)}.seg .srcb:hover{transform:none}
.seg::before{content:"";position:absolute;top:0;bottom:0;left:var(--sx,0);width:var(--sw,50%);background:var(--r);box-shadow:inset 0 -4px 0 #0B0B0B}
.seg:not(.ready)::before{opacity:0}.seg.ready::before{transition:left .3s cubic-bezier(.3,1.4,.5,1),width .3s cubic-bezier(.3,1.4,.5,1)}
.srcs.seg{display:inline-flex}.filt .seg .srcb{padding:8px 6px;font-size:12px}
@keyframes popk{0%{transform:scale(1)}40%{transform:scale(1.14) rotate(-2deg)}100%{transform:none}}.pop{animation:popk .3s cubic-bezier(.3,1.7,.5,1)}
.filt .slider,.filt .seg{animation:p5in .5s .15s both}
.rstf{width:100%;min-height:40px}.ftog{display:none}
@media(max-width:760px){.zh{gap:6px 12px}.zh .hfile{display:none}.zh.small .modes{display:none}.zh.small .brand{font-size:1.2rem}}
@media(max-width:900px){.ftog{display:block;align-self:flex-start;min-height:44px;padding:0 16px}.filt{display:none}.disc.fopen .filt{display:block}}
/* ---------- commander panel round 2 ---------- */
.tpips{position:relative;display:flex;gap:6px;margin-top:10px}.tpips .pip{width:30px;height:30px;font-size:15px;box-shadow:3px 3px 0 #0B0B0B}
.wbtn .pinb{transform:skewX(-8deg);box-shadow:4px 4px 0 var(--ink);font:900 .72rem var(--head);letter-spacing:.04em;transition:transform .14s cubic-bezier(.3,1.7,.5,1),box-shadow .1s}
.wbtn .pinb:hover{transform:skewX(-8deg) translate(-2px,-2px);box-shadow:6px 6px 0 var(--r)}.wbtn .pinb:active{transform:skewX(-8deg) translate(2px,2px);box-shadow:1px 1px 0 var(--ink)}
.wsf{padding:2px 8px;font:800 .7rem var(--head);text-transform:uppercase;text-decoration:none;border:2px solid var(--ink);transform:skewX(-8deg)}
.swh{margin:4px 0 0;font-size:.8rem}.swh small{font-weight:400;color:var(--mute)}
.bsw{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;padding:6px 8px;text-align:left;text-transform:none;font:400 .78rem/1.35 var(--body);letter-spacing:0;cursor:pointer;border:2px solid var(--ink) !important}
.bsw .in{padding:0 4px;background:var(--c);color:#141414;font-weight:800}.bsw.on{background:var(--card) !important;color:var(--ink) !important;box-shadow:4px 4px 0 var(--r) !important;transform:rotate(-1deg)}.bsw small{color:var(--mute)}
.scr{position:relative;display:inline-block}.scr.done{opacity:.75}
.scr.done::after{content:"";position:absolute;left:-4px;right:-4px;top:50%;height:7px;margin-top:-3px;pointer-events:none;
  background:repeating-linear-gradient(-58deg,transparent 0 2px,var(--r) 2px 4px);border-top:2px solid var(--r);border-bottom:2px solid var(--r);
  transform:rotate(-3deg);transform-origin:left;animation:scratch .35s ease-out both}
@keyframes scratch{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
.pnl.ptb{margin-top:14px;border-top:6px solid var(--r);box-shadow:5px 5px 0 var(--r)}.tbl{margin:0;padding-left:22px;display:flex;flex-direction:column;gap:4px}
.tbl li{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}.tbl li small{color:var(--mute)}.tbl .shopl{font-size:.8rem}
.tbb{margin-left:auto;display:flex;gap:4px}.tbb button{min-width:28px;min-height:26px;padding:0 6px;font-size:.75rem}
.tbl li.done .shopl{color:var(--mute)}
.phint{display:block;font-size:.72rem;line-height:1.4;color:var(--mute)}
.gmiss{text-decoration:none;color:var(--ink);cursor:pointer;transition:transform .15s cubic-bezier(.3,1.7,.5,1),box-shadow .15s}
.gmiss:hover{transform:rotate(-2deg) translateY(-4px);box-shadow:6px 6px 0 var(--r)}
.gimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.1)}
a.gmiss{background:none;padding:8px;border-style:solid}.gmc{width:150px}.gmc .gname{font-size:15px}
.gmiss>span{position:relative}.gbuy{align-self:flex-start;padding:2px 6px;font:900 11px var(--head);text-transform:uppercase;color:#FFFFFF;background:var(--r);border:2px solid #0B0B0B;transform:skewX(-8deg)}
@media (prefers-reduced-motion:reduce){.scr.done::after{animation:none}}
/* ---------- round 3: hazard badge, one receipt, binder vs staples, dropdown, menus above ---------- */
.haz{display:flex;align-items:center;gap:10px;margin-top:12px;padding:8px 12px 8px 8px;color:#141414;cursor:help;
  background:repeating-linear-gradient(-45deg,#FFE600 0 12px,#141414 12px 24px);border:2px solid #141414;box-shadow:4px 4px 0 #141414;transform:skewX(-6deg)}
.haz>span:last-child{display:flex;flex-direction:column;padding:2px 8px;background:#FFE600;border:2px solid #141414}
.haz b{font:900 15px/1 var(--head);letter-spacing:.06em}.haz small{font-size:10px;text-transform:uppercase;color:#141414}
.hzt{position:relative;flex:none;width:38px;height:34px;background:#141414;clip-path:polygon(50% 0,100% 100%,0 100%);animation:hzwob 2.4s ease-in-out .3s both}
.hzt::before{content:"";position:absolute;inset:5px 5px 2px;background:#FFE600;clip-path:polygon(50% 0,100% 100%,0 100%)}
.hzt i{position:absolute;left:0;right:0;bottom:2px;text-align:center;font:900 19px/1 var(--head);font-style:normal;color:#141414}
@keyframes hzwob{0%,60%,100%{transform:rotate(0)}66%{transform:rotate(-12deg) scale(1.12)}72%{transform:rotate(10deg)}78%{transform:rotate(-6deg)}84%{transform:rotate(3deg)}}
.rsub{display:block;margin:4px 0 2px;font:800 10px/1.2 var(--serial);letter-spacing:.08em}.shop .ptb{margin:0}.shop .tbl{padding-left:20px}
.shop .tbb button{background:transparent;color:#141414;border-color:#141414}
.shop .tbl .shopl,.shop .tbl small{color:#141414}.shop .tbl li.done .shopl{color:#6b6458}
.bsec{display:flex;flex-direction:column;gap:20px}.bsec h3.p5-slab{margin:0;font-size:clamp(2.2rem,4.6vw,3.5rem);line-height:.9}
.bgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
.bcard{position:relative;display:flex;gap:14px;padding:12px;border:2px solid var(--ink);background:var(--bg);box-shadow:6px 6px 0 var(--c)}
.bcard.on{box-shadow:6px 6px 0 var(--r);transform:rotate(-1deg)}.bcard>img.c{width:92px;flex:none;transform:rotate(-3deg)}
.binfo{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:0}.binfo b{font:900 18px/1.05 var(--head);font-stretch:75%;text-transform:uppercase}
.binfo small{font-size:11px;color:var(--mute)}.binfo .bsw{margin-top:auto;width:auto;font:800 11px/1.3 var(--head);text-transform:uppercase}
.binfo .bsw.on{background:var(--card) !important}.binfo .pinb{min-height:28px;padding:0 8px}.bcard .stk{position:absolute;right:-8px;top:-10px}
.bdone{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.bchip{padding:2px 8px;font-size:12px;border:1.5px solid var(--ink)}.bchip s{text-decoration-color:var(--m);text-decoration-thickness:2px;color:var(--mute)}
.bsec>details.more>summary{display:inline;align-self:flex-start;font-size:12px;text-transform:uppercase;border-bottom:2px solid var(--c)}
.gslot .gmiss.gopt{min-height:0;padding:8px;border:2px solid var(--ink);border-radius:12px;background:none;text-align:left}
.gslot .gmiss.gopt.on{background:none;outline:4px solid var(--r);outline-offset:2px;box-shadow:6px 6px 0 var(--r);transform:rotate(-2deg)}
.gslot .gmiss .stk{position:absolute;left:8px;bottom:8px}.gmc .shopl{font-size:12px}
.gopt img.gim{width:64px;align-self:flex-start;margin:4px 0;border:1.5px solid currentColor;border-radius:4px}
.fmore>summary{list-style:none;display:flex;align-items:center;gap:8px;cursor:pointer;font-family:var(--head);text-transform:uppercase;letter-spacing:.01em}.fmore>summary::-webkit-details-marker{display:none}
.fcar{margin-left:auto;transition:transform .2s}.fmore[open] .fcar{transform:rotate(180deg)}
.fdot{width:9px;height:9px;border-radius:50%;background:var(--r);box-shadow:0 0 0 2px var(--ink)}.fdot[hidden]{display:none}
.fmore[open] .more{animation:p5in .35s both}
.bub{top:auto;bottom:100%;margin-top:0;margin-bottom:-6px;transform-origin:30% 100%}.bub.dn{top:100%;bottom:auto;margin-top:-8px;margin-bottom:0;transform-origin:30% 0}
.cw:hover .bub,.cw:focus-within .bub{animation:bubin .2s cubic-bezier(.3,1.6,.5,1)}
@keyframes bubin{from{opacity:0;transform:translateY(12px) scale(.94) skewX(-4deg)}}
.bub.dn{animation-name:bubdn}@keyframes bubdn{from{opacity:0;transform:translateY(-12px) scale(.94) skewX(-4deg)}}
.usd{margin-left:6px;padding:0 4px;font:700 10px/1.4 var(--serial);font-style:normal;color:#141414;background:#F0EBDD;border:1px solid #141414}
.p5-wait{opacity:0}.p5-shown{animation:p5in .6s cubic-bezier(.2,.9,.25,1) both}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none !important;transition:none !important}.p5-wait{opacity:1}}
</style></head><body>
<div id="zt" aria-hidden="true"><svg><filter id="zdust"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="1" seed="5"/><feColorMatrix values="0 0 0 0 0.08  0 0 0 0 0.08  0 0 0 0 0.08  1 0 0 0 0"/><feComponentTransfer><feFuncA type="discrete" tableValues="0 0 0 0 0 0 0 0 0 0 0.85"/></feComponentTransfer></filter><rect width="100%" height="100%" filter="url(#zdust)"/></svg></div>
<main>
<header class="zh"><a class="brand" href="#discover" title="Discover: back to the top">Deck Wizard</a>
<nav class="vnav" aria-label="Views"><a href="#discover" data-view="discover">Discover</a><a href="#collection" data-view="collection">Collection</a></nav>
<span class="hfile" id="hfile"></span>
<div class="modes" role="group" aria-label="Print mode"><button type="button" data-mode="pos">Positive</button><button type="button" data-mode="neg">Negative</button><button type="button" data-mode="sepia">Sepia</button></div></header>
<div class="cmyk" aria-hidden="true"></div>
<div class="tickw" aria-hidden="true"><div class="p5-ticker"><div class="p5-track" id="tick"></div></div></div>
<div id="vdisc">
<div class="ttl"><div class="p5-slash" aria-hidden="true"></div><h1 class="p5-h1" id="ttl" aria-label="What can I build?"></h1></div>
<p class="sub">&gt; Your collection vs EDHREC, per bracket. Missing cards get filled from cards you own_</p>
<ul class="stats" id="stats"></ul>
<div class="cmyk" aria-hidden="true"></div>
<div class="disc">
<button type="button" class="ftog" aria-expanded="false" aria-controls="filt">☰ Filters</button>
<aside class="filt" id="filt" aria-label="Filters">
<h3 class="fh">Bracket</h3><div class="fb slider"><label class="sr" for="br">Bracket</label><input id="br" type="range" min="0" step="1" value="0"><div class="brt" aria-hidden="true"></div><span id="bv" aria-live="polite"></span></div>
<h3 class="fh">Deck from</h3><div class="fb"><div class="srcsel seg" role="group" aria-label="Deck source"><button class="srcb" data-src="" title="Popular cards: decks built from the cards EDHREC sees most often for this commander, filled in with your cards">Popular cards</button><button class="srcb" data-src="avg" title="Typical deck: EDHREC's average deck (one typical 99), rebuilt with your cards">Typical deck</button></div></div>
<h3 class="fh">Search</h3><div class="fb"><label class="sr" for="q">Commander name</label><input id="q" type="search" placeholder="type a name_" autocomplete="off" data-ac="cmdr" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="acl"></div>
<h3 class="fh">Colours</h3><div class="fb cchips" role="group" aria-label="Colours"></div>
<h3 class="fh">You own at least</h3><div class="fb mins" role="group" aria-label="Minimum owned"></div>
<details class="fmore"><summary class="fh">More <i class="fdot" title="a filter in here is on" hidden></i><span class="fcar" aria-hidden="true">▾</span></summary><div class="fb more"><label>archetype<select id="th" aria-label="Archetype"><option value="">Any archetype</option></select></label><label>edhrec decks<select id="dk" aria-label="Min decks"><option value="0">Any deck count</option><option value="20">20+ decks</option><option value="100">100+ decks</option><option value="500">500+ decks</option><option value="1000">1000+ decks</option><option value="5000">5000+ decks</option></select></label><label>combos<select id="cf" aria-label="Combos"><option value="">Any combos</option><option value="own">Owns 1+ combo</option><option value="skel">Combo in deck</option></select></label><label>sort by<select id="so" aria-label="Sort"><option value="pct">Sort: % owned</option><option value="decks">Sort: deck count</option><option value="combos">Sort: combos owned</option><option value="ready">Sort: build readiness</option></select></label></div></details>
<div class="fb"><button type="button" class="rstf" title="Clear search, colours, minimum owned, archetype, deck count, combos and sort">Reset filters</button></div>
</aside>
<section class="lst" aria-label="Commanders"><div id="count"></div><div id="list"></div></section>
</div>
</div>
<div id="vcoll" hidden>
<section class="chero"><div class="ttl"><div class="p5-slash" aria-hidden="true"></div><h1 class="p5-h1" id="cttl" aria-label="Your collection"></h1></div><dl class="cstats p5-in" id="cstats"></dl></section>
<div id="coll"></div>
<div id="imp"></div>
<div id="unused"></div>
</div>
</main><img id="pv" alt=""><ul id="acl" class="acl" role="listbox" aria-label="Suggestions" hidden></ul><script>
const DATA=__DATA__, BR=__BR__, ST=__STATS__, DECKS=__DECKS__, CARDS=__CARDS__, COMBOS=__COMBOS__, STRS=__STRS__, OPTS=__OPTS__;
const W=i=>typeof i==="number"?(i>=0?STRS[i]:""):(i||"");   // a reason from the shared string table
const LBL={all:"All decks",exhibition:"B1 Exhibition",core:"B2 Core",upgraded:"B3 Upgraded",optimized:"B4 Optimized",cedh:"B5 cEDH"};
const PIP={W:"#e8e2c8",U:"#7fb3e0",B:"#6b5f73",R:"#e07a5f",G:"#7bb274"};
const GL={Creature:"Creatures",Planeswalker:"Planeswalkers",Battle:"Battles",Instant:"Instants",Sorcery:"Sorceries",Artifact:"Artifacts",Enchantment:"Enchantments",Land:"Lands",Other:"Other"};
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const n=v=>Number(v).toLocaleString();
const front=i=>CARDS[i][0].split(" // ")[0];
DATA.forEach((d,i)=>d.i=i);
/* ---------- P5 layer: ransom-note letters (deterministic, same on every load) and the ticker ---------- */
const ransom=(txt,base)=>txt.split("").map((ch,i)=>ch===" "?'<span class="rsp"></span>'
  :`<span class="rl rl${(ch.charCodeAt(0)*7+i*11+base)%6}" style="--rot:${((((i*37+base)%13)-6)*1.1).toFixed(1)}deg;--sz:${(0.84+((i*29+base)%5)*0.06).toFixed(2)}em;--d:${i*45+base*12}ms">${esc(ch)}</span>`).join("");
const tickHTML=items=>{const t=`★ ${items.map(esc).join(" ★ ")} `; return `<span>${t}</span><span>${t}</span>`;};
$("ttl").innerHTML=`<span aria-hidden="true">${ransom("What can",1)}</span><span aria-hidden="true">${ransom("I build?",4)}</span>`;
/* ---------- card image style in commander headers: full colour or photocopy (saved in "dw:img") ---------- */
try{document.documentElement.dataset.img=localStorage.getItem("dw:img")||"full";}catch(e){document.documentElement.dataset.img="full";}
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("[data-imgm]"); if(!t)return;
  const m=t.dataset.imgm; document.documentElement.dataset.img=m; try{localStorage.setItem("dw:img",m);}catch(err){}
  document.querySelectorAll("[data-imgm]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.imgm===m?"true":"false"));});
document.addEventListener("change",e=>{const s=e.target.closest&&e.target.closest(".tsel"); if(!s)return;
  const r=s.closest("details.row"); r.dataset.t=s.value; r.dataset.slot=""; rerow(r);});
/* ---------- "Why this card?": hover or focus previews, a click pins (again or Esc lets go); taps are clicks ---------- */
const whyCw=t=>t&&t.closest&&t.closest(".d99 .cw[data-wi]");
function whyPreview(e){const cw=whyCw(e.target); if(!cw||e.target.closest(".bub"))return; const row=cw.closest("details.row"), W_=WHY[+row.dataset.i];
  if(!W_||W_.pin!=null||W_.cur===+cw.dataset.wi)return; whyShow(row,+cw.dataset.wi);}
document.addEventListener("mouseover",whyPreview); document.addEventListener("focusin",whyPreview);
document.addEventListener("click",e=>{const cw=whyCw(e.target); if(!cw||!e.target.closest(".ct")||e.target.closest(".flip"))return;
  e.preventDefault(); const row=cw.closest("details.row"), W_=WHY[+row.dataset.i], wi=+cw.dataset.wi; if(!W_)return;
  W_.pin=W_.pin===wi?null:wi; whyShow(row,wi);});
document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;
  document.querySelectorAll("details.row[open]").forEach(row=>{const W_=WHY[+row.dataset.i]; if(W_&&W_.pin!=null){const wi=W_.pin; W_.pin=null; whyShow(row,wi);}});});
/* ---------- print mode: Positive / Negative / Sepia ---------- */
function setMode(m){document.documentElement.dataset.mode=m; try{localStorage.setItem("dw:mode",m);}catch(e){}
  document.querySelectorAll(".modes [data-mode]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.mode===m?"true":"false"));}
setMode(document.documentElement.dataset.mode||"neg");
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest(".modes [data-mode]"); if(b)setMode(b.dataset.mode);});
/* ---------- views: Discover / Collection (URL hash #collection; the last view is kept in "dw:view") ---------- */
let VIEW="discover", DTICK=[], CTICK=[];
function showView(v){VIEW=v==="collection"?"collection":"discover";
  $("vdisc").hidden=VIEW!=="discover"; $("vcoll").hidden=VIEW!=="collection";
  document.querySelectorAll(".vnav [data-view]").forEach(a=>a.dataset.view===VIEW?a.setAttribute("aria-current","page"):a.removeAttribute("aria-current"));
  try{localStorage.setItem("dw:view",VIEW);}catch(e){}
  $("tick").innerHTML=tickHTML(VIEW==="collection"?CTICK:DTICK);}
addEventListener("hashchange",()=>{if(location.hash==="#collection"||location.hash==="#discover"){showView(location.hash.slice(1)); scrollTo(0,0);}});
// a commander named on the Collection page: show it in Discover and open its panel
function openCmdr(nm){if(location.hash!=="#discover")history.pushState(null,"","#discover"); showView("discover");
  $("q").value=nm; render(); const r=[...document.querySelectorAll("#list details.row[data-i]")].find(x=>DATA[+x.dataset.i].name===nm);
  if(r){r.open=true; r.scrollIntoView();} else $("list").scrollIntoView();}
$("stats").innerHTML=`<li><strong>${n(ST.cards)}</strong>cards</li><li><strong>${n(ST.unique)}</strong>unique</li><li><strong>${ST.cands}</strong>commanders</li><li><strong>${DATA.length}</strong>analyzed</li>${ST.unused?`<li class="hl"><strong>${n(ST.unused.n_unused)}</strong>unused cards</li>`:""}`;

/* ---------- Collection page: the file in use + the drop box (the only upload control; app only), what changed ---------- */
(function(){
  const C=ST.coll||{}, D=C.diff, served=location.protocol.startsWith("http");
  const names=(l,k)=>l.slice(0,40).map(esc).join(", ")+(k>l.length?` … +${k-l.length} more`:"");
  const chg=D&&(D.added_n||D.removed_n||D.new_cmdrs_n);
  $("hfile").innerHTML=`${esc(C.csv||"")}${chg?` · <b>${[D.added_n?`+${D.added_n} new cards`:"",D.removed_n?`−${D.removed_n} removed`:"",D.new_cmdrs_n?`${D.new_cmdrs_n} new commanders`:""].filter(Boolean).join(" · ")}</b>`:""}<span id="hups"></span>`;
  $("cttl").innerHTML=`<span aria-hidden="true">${ransom("Your",3)}</span><span aria-hidden="true">${ransom("collection",6)}</span>`;
  $("cstats").innerHTML=[["cards",n(ST.cards)],["unique",n(ST.unique)],["commanders",n(ST.cands)]].concat(ST.unused?[["unused",n(ST.unused.n_unused)]]:[])
    .map(([k,v],i)=>`<div${i===3?' class="u"':""}><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  // the unused-card items are added by unusedRender() (live counts)
  CTICK=["Your binder",`${n(ST.cards)} cards`,`${n(ST.unique)} unique`].concat(D&&D.added_n?[`+${n(D.added_n)} new since last file`]:[]);
  const isC=nm=>DATA.some(d=>d.name===nm);
  const file=`<div class="ccard p5-in p5-card"><h2>Current file</h2><div class="cfile"><b>${esc(C.csv||"?")}</b><span>ManaBox export · ${esc(C.at||"")}</span></div>
    ${served?`<label class="drop"><span class="dlab">Drop a new CSV ★</span><span>or click to choose a ManaBox export</span><small>only new cards hit Scryfall · the rebuild takes a few minutes</small><input type="file" accept=".csv,text/csv" aria-label="Choose a new ManaBox CSV"></label><span id="ups" role="status"></span>`
      :`<p class="dim">To update: export from ManaBox into the <b>collection</b> folder and run <b>Update Deck Wizard.bat</b>, or open <b>Deck Wizard App.bat</b> and drop the new CSV here.</p>`}</div>`;
  const blocks=D?`<div class="chg">${[[`+${n(D.added_n||0)}`,"new cards","add"],[`−${n(D.removed_n||0)}`,"removed","rem"],[n(D.new_cmdrs_n||0),"new commanders","ncm"]]
    .map(([v,k,c])=>`<div class="p5-in ${c}"><b>${v}</b><span>${k}</span></div>`).join("")}</div>`:"";
  const ncs=D&&D.new_cmdrs_n?`<div class="ncs"><span class="lbl">New commanders</span>${D.new_cmdrs.slice(0,12).map(nm=>isC(nm)
    ?`<a href="#discover" class="nc" data-open="${esc(nm)}">${esc(nm)} -&gt;</a>`:`<span class="nc">${esc(nm)}</span>`).join("")}${D.new_cmdrs_n>12?`<small>+${D.new_cmdrs_n-12} more</small>`:""}</div>`:"";
  const list=chg?`<details class="clist"><summary>See every added &amp; removed card -&gt;</summary>
    ${D.new_cmdrs_n?`<p>New commanders: ${names(D.new_cmdrs,D.new_cmdrs_n)}</p>`:""}
    ${D.added_n?`<p class="add">Added: ${names(D.added,D.added_n)}</p>`:""}
    ${D.removed_n?`<p class="rem">Removed: ${names(D.removed,D.removed_n)}</p>`:""}</details>`
    :D?`<p class="dim">No changes since the previous collection.</p>`:`<p class="dim">First import: there's no previous file to compare with yet. The next CSV will show what changed.</p>`;
  $("coll").innerHTML=file+`<div class="ccard p5-in p5-card"><h2>Since the last file</h2>${blocks}${ncs}${list}</div>`;
  if(!served) return;
  const ups=$("ups"), hups=$("hups");
  const say=(t,busy)=>{ups.textContent=t; hups.textContent=busy?" · rebuilding…":"";};
  const poll=()=>fetch("/status").then(r=>r.json()).then(s=>{
    if(s.running){say("Rebuilding… "+(s.line||""),1); setTimeout(poll,1000);}
    else if(s.ok===true&&s.started>ST.built){say("Done, reloading…"); location.reload();}
    else if(s.ok===false) say("Rebuild failed: "+(s.line||"see the Deck Wizard window"));
  }).catch(()=>{say("Lost connection to Deck Wizard App (is its window still open?)");});
  // the upload itself (POST /upload with the X-Deck-Wizard header), from the drop box
  window.dwUpload=async f=>{
    if(!f) return;
    if(!/\.csv$/i.test(f.name)){say("That's not a .csv file: export your collection from ManaBox as CSV."); return;}
    say("Uploading "+f.name+"…",1);
    try{
      const r=await fetch("/upload",{method:"POST",headers:{"X-Deck-Wizard":"1","Content-Type":"text/csv"},body:f});
      const j=await r.json();
      if(!r.ok){say(j.error||"Upload failed"); return;}
      say("Received "+f.name+", starting the rebuild…",1); poll();
    }catch(err){say("Upload failed: is the Deck Wizard App window still open?");}
  };
  const dz=document.querySelector("#coll .drop"), inp=dz.querySelector("input");
  inp.addEventListener("change",()=>{dwUpload(inp.files[0]); inp.value="";});
  ["dragenter","dragover"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault(); dz.classList.add("over");}));
  dz.addEventListener("dragleave",()=>dz.classList.remove("over"));
  dz.addEventListener("drop",e=>{e.preventDefault(); dz.classList.remove("over"); dwUpload(e.dataTransfer.files[0]);});
  poll();   // a rebuild may already be running (e.g. started from another tab)
})();
const br=$("br"); br.max=BR.length-1;
const themes=new Set(); DATA.forEach(d=>d.tags.slice(0,3).forEach(t=>themes.add(t[0])));
[...themes].sort().forEach(t=>{const o=document.createElement("option");o.value=o.textContent=t;$("th").appendChild(o);});
const pips=ci=>(ci.length?ci:["C"]).map(c=>`<i class="pip mb-${c}">${c}</i>`).join("");   // filled mana-colour boxes
// the Collection Match battery: k cells, lit = round(pct / (100/k)); green 80+, yellow 60-79, red under 60
const bat=(p,k=10,size)=>{const lit=Math.round(p/(100/k));
  return `<span class="bat b${k} ${size||""} ${p>=80?"hi":p>=60?"mid":"lo"}" role="img" aria-label="You own ${p}% of this deck">${Array.from({length:k},(_,i)=>i<lit?'<i class="on"></i>':"<i></i>").join("")}</span>`;};
/* ---------- Discover filters: colour chips (all selected colours must be in the identity) and "you own at least" ---------- */
const COLS=new Set(); let MINP=0;
const MTGN={W:"White",U:"Blue",B:"Black",R:"Red",G:"Green"};
document.querySelector(".cchips").innerHTML="WUBRG".split("").map(k=>`<button type="button" class="cc mb-${k}" data-col="${k}" aria-pressed="false" aria-label="${MTGN[k]}" title="${MTGN[k]}">${k}</button>`).join("");
document.querySelector(".mins").innerHTML=[0,40,60,80].map(v=>`<button type="button" data-minp="${v}" aria-pressed="${v?"false":"true"}"><span>${v?v+"%":"ANY"}</span>${bat(v,5)}</button>`).join("");
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("[data-col],[data-minp]"); if(!t)return;
  if(t.dataset.col){const k=t.dataset.col; COLS.has(k)?COLS.delete(k):COLS.add(k); t.setAttribute("aria-pressed",COLS.has(k)?"true":"false");}
  else{MINP=+t.dataset.minp; document.querySelectorAll(".mins [data-minp]").forEach(x=>x.setAttribute("aria-pressed",x===t?"true":"false"));}
  render();});
const bk=()=>BR[+br.value];
// deck source for the whole page, like EDHREC: "" = commander page (card stats), "avg" = average deck
let SRC=""; try{SRC=localStorage.getItem("dw:src")||"";}catch(e){}
const X=(d,b)=>SRC==="avg"?(d.av&&d.av[b])||null:d.b[b];

/* ---------- card images (Scryfall) ---------- */
function IMG(i){const s=CARDS[i][1];
  return !s?"https://api.scryfall.com/cards/named?format=image&version=normal&exact="+encodeURIComponent(front(i))
    :s.startsWith("http")?s:"https://cards.scryfall.io/normal/"+s;}
const BACK=i=>CARDS[i][5]?IMG(i).replace("/front/","/back/"):"";   // two-faced cards: Scryfall's back image
function tile(i,o={}){if(i==null||i<0||!CARDS[i])return"";const c=CARDS[i], w=o.was!=null&&o.was>=0&&CARDS[o.was]?o.was:null;
  return `<a class="ct ${o.cls||""}" href="https://scryfall.com/search?q=${encodeURIComponent('!"'+front(i)+'"')}" target="_blank" rel="noopener"${o.why?` role="button" aria-pressed="false" aria-label="Why ${esc(front(i))}? Click to pin"`:""}>`+
   `<img class="c" src="${IMG(i)}" alt="${esc(c[0])}" title="${esc(c[0])}" loading="lazy">`+
   (c[5]?`<span class="flip" data-back="${esc(BACK(i))}" title="Hover to see the back">⟲</span>`:"")+
   (w!=null?`<span class="was" title="was: ${esc(front(w))}"><img src="${IMG(w)}" alt="was: ${esc(front(w))}" loading="lazy"><i>was</i></span>`:"")+
   (o.badge?`<span class="badge">${esc(o.badge)}</span>`:"")+(o.note?`<span class="note">${esc(o.note)}</span>`:"")+`</a>`;}
function tileFor(it,taped){const badge=(it.n||1)>1?"×"+it.n:"";
  if(taped) return tile(it.i,{badge,why:true,was:it.was});
  // imported decks and lists without tapes: a short note; a card you don't own gets a dashed outline (never grey)
  return tile(it.i,{cls:it.kind==="m"||it.kind==="buy"?"nown":"",badge,was:it.was,
    note:it.note||(it.kind==="m"?"missing":it.kind==="buy"?"to buy":"")});}
// one label system for the 99 (zine palette): [tape colour, label, what it means]. Every tape has the meaning as its title.
const TAPE={p:["","POPULAR","most decks for this commander play it"],y:["y","GOOD FIT","you own it, few decks play it, but it fits this commander"],
  k:["r","ALWAYS IN","you pinned it"],c:["m","COMBO","part of a combo in this deck"],f:["g","FILLER","added to reach the minimum for a role"],
  s:["c","STAND-IN","you don't own EDHREC's card, so yours does its job"],y2:["w","YOUR SWAP","a card you chose in the hover menu"],
  s2:["w","YOUR SWAP","a card you chose in the hover menu"],buy:["d","TO BUY","you chose to buy EDHREC's card"],
  m:["d","MISSING","not in your collection"],"":["","BASIC","a basic land"]};
const LEG=["p","y","k","c","f","s","y2","buy"];
const tapeSpan=(k,extra,title)=>{const [cls,lab,mean]=TAPE[k]||["","",""];
  return `<span class="tape ${cls}" title="${esc(lab+" · "+mean+(title?" · "+title:""))}">${lab}${extra?" · "+esc(extra.toUpperCase()):""}</span>`;};
function tapeFor(it){const k=it.kind, wn=it.was!=null&&it.was>=0?front(it.was):"";
  const role=k==="f"&&W(it.f), combo=k==="c"&&W(it.f);
  const line=k==="y"?W(it.f):k==="s"?"for "+front(it.f):(k==="y2"||k==="s2"||k==="buy")&&wn?"was: "+wn:"";
  const buy=(k==="s"||k==="s2")&&it.f>=0?buyA(it.f,"🛒 buy "+esc(front(it.f))):"";
  return tapeSpan(k,role||"",combo?"with "+combo:k==="s"?"for "+front(it.f):line)+(line?`<span class="tapew">${esc(line)}</span>`:"")+buy;}
const legendHTML=()=>`<div class="tlg" aria-label="What the labels mean">${LEG.map(k=>tapeSpan(k)).join("")}<span>· hover any card to swap it</span></div>`;
const kindOf=it=>it.kind||(it.n?"":"p");
function grid(cmdrs,items,bub){
  const by={}; items.forEach(it=>{const g=CARDS[it.i][2]||"Other";(by[g]=by[g]||[]).push(it);});
  let h=`<div class="grp"><h5>Commander</h5><div class="grid">${cmdrs.map(i=>tile(i)).join("")}</div></div>`;
  Object.keys(GL).forEach(g=>{const L=by[g]; if(!L)return; const cnt=L.reduce((s,it)=>s+(it.n||1),0);
    h+=`<div class="grp"><h5>${GL[g]} <small>${cnt}</small></h5><div class="grid">`+L.map(it=>{
      if(!bub) return tileFor(it);
      const k=kindOf(it);
      return `<div class="cw k-${k}" data-wi="${it.w}">${tileFor(it,true)}${tapeFor(Object.assign({},it,{kind:k}))}${bub(it)}</div>`;}).join("")+`</div></div>`;});
  return h;}
function gapsHTML(gaps,deckSet,slots){
  if(!gaps.length) return `<p class="dim">No gaps: you own every popular card.</p>`;
  return gaps.map(([i,r,subs,used,roles])=>{roles=W(roles);
    const isSlot=slots&&slots.has(i);
    const alts=subs.map(([s,why])=>`<div class="alt">${tile(s,{note:s===used?"in your deck":deckSet.has(s)?"already in deck":""})}<small>${esc(W(why))}</small>${isSlot&&!deckSet.has(s)?`<button class="opt mini" data-pick="${s}" data-slot="${i}">Use this</button>`:""}</div>`).join("")
      +(isSlot&&!deckSet.has(i)?`<div class="alt"><button class="opt mini" data-pick="-1" data-slot="${i}">Buy ${esc(front(i))} instead</button></div>`:"");
    const adv=subs.length?"":`<p class="adv">No close match in your collection for this ${esc(roles||"synergy")} slot.${r>=25?" It's a core card for this commander, worth picking up.":" The deck fills this slot with other cards you own."}</p>`;
    return `<div class="gap"><div class="alt">${tile(i,{cls:"nown",note:r?r+"% of decks":"missing"})}${buyA(i,"🛒 "+esc(STORE.name))}<small>${esc(roles||"synergy piece")}</small></div><span class="arrow" aria-hidden="true">→</span>${alts}${adv}</div>`;}).join("");}
/* ---------- your choices for substitute slots (saved in this browser) ---------- */
const chKey=(d,b,t)=>"dw:"+d.slug+":"+b+(t?":"+t:"");
// choices live in localStorage; MEM keeps them for this visit when the browser blocks storage
const MEM={};
function getCh(d,b,t){const k=chKey(d,b,t);
  try{const v=localStorage.getItem(k); if(v!=null) return JSON.parse(v)||{};}catch(e){}
  return Object.assign({},MEM[k]);}
function setCh(d,b,o,t){const k=chKey(d,b,t); MEM[k]=Object.assign({},o);
  try{Object.keys(o).length?localStorage.setItem(k,JSON.stringify(o)):localStorage.removeItem(k);}catch(e){}}
// the deck for a theme: the normal deck of this bracket with the theme deck's differences applied
function applyDiff(x,df,extra){const rem=new Set(df.rem);
  return Object.assign({},x,df,{deck:x.deck.filter(e=>!rem.has(e[0])).concat(df.add)},extra);}
function themed(d,b,t){const x=d.b[b], th=t&&d.th&&d.th[t], df=th&&th.b[b]; if(!df) return x;
  return applyDiff(x,df,{theme:th.name,tdecks:th.decks});}
// an archetype's average deck: the overview deck of this bracket with that deck's differences applied
const hasTAvg=(d,b,t)=>!!(t&&d.th&&d.th[t]&&d.th[t].av&&d.th[t].av[b]);
const tavgd=(d,b,t)=>applyDiff(d.b[b],d.th[t].av[b],{avg:1,theme:d.th[t].name,tdecks:d.th[t].adecks});
// EDHREC's average deck of this bracket, rebuilt with your cards (stored as differences too)
const hasAvg=(d,b)=>!!(d.av&&d.av[b]);
const avgd=(d,b)=>applyDiff(d.b[b],d.av[b],{avg:1});
// which deck a row shows: "avg" = average deck, else a theme slug or "" (also the key for saved choices)
// the tree: bracket -> archetype (row data-t, "" = overview) -> source (row data-a "1"/"0", else the
// page's source). Returns {t, a, key}: key = where substitute choices are saved.
function rowState(d,b,r){
  const t=r&&r.dataset.t&&d.th&&d.th[r.dataset.t]?r.dataset.t:"";
  const want=r&&r.dataset.a?r.dataset.a==="1":SRC==="avg";
  const a=want&&(t?hasTAvg(d,b,t):hasAvg(d,b));
  return {t,a,key:t?(a?t+":avg":t):(a?"avg":"")};}
// where a row's substitute / pick choices are saved: the deck's key, + the level when not weight 3 / $$
// (body() reads and the click handler writes through this one function, so they always agree)
const rowSel=(d,b,r)=>{const L=lvlOf(r); return rowState(d,b,r).key+(L.w!==3||L.s!==2?`:w${L.w}s${L.s}`:"");};
function deckOf(d,b,st){return st.t?(st.a?tavgd(d,b,st.t):themed(d,b,st.t)):(st.a?avgd(d,b):d.b[b]);}
/* ---------- EDHREC weight (1-4): other levels are built by the app on request (price is information only) ---------- */
const SERVED=location.protocol.startsWith("http"), LIVE={};
const WTIP={1:"Your collection decides: EDHREC popularity counts 15%; card strength, fit and synergy with your cards lead",2:"Collection first: EDHREC popularity counts 50%",
  3:"Balanced (the report's decks): EDHREC popularity counts 100%",4:"Closest to EDHREC's list: popularity counts 140%"};
const lvlOf=r=>({w:+(r&&r.dataset.w||3),s:2});   // spending dial removed: price is information only
const liveKey=(d,b,st,L)=>[d.slug,b,st.t,st.a?1:0,L.w,L.s,pinKey(pinsOf(d))].join("|");
function addRows(arr,rows,from){rows.forEach((x,j)=>{if(from+j===arr.length)arr.push(x);});}
function fetchLive(d,b,st,L){const k=liveKey(d,b,st,L); LIVE[k]={busy:1};
  const nc=CARDS.length, ns=STRS.length, nk=COMBOS.length, no=OPTS.length;
  const qs=new URLSearchParams({c:d.name,b,t:st.t,a:st.a?"1":"0",w:L.w,s:L.s,v:ST.built,nc,ns,nk,no});
  const done=()=>{const row=document.querySelector(`details.row[data-i="${d.i}"]`); if(row&&row.dataset.f)rerow(row);};
  const go=n=>fetch("/deck?"+qs,{headers:{"X-Deck-Wizard":"1"}}).then(async res=>{
    const j=await res.json().catch(()=>({error:"The app sent a reply the page can't read."}));
    if(!res.ok){LIVE[k]={err:j.error||("HTTP "+res.status)}; return done();}
    addRows(CARDS,j.cards,nc); addRows(STRS,j.strs,ns); addRows(COMBOS,j.combos,nk); addRows(OPTS,j.opts||[],no);
    LIVE[k]={x:j.x}; done();
  },e=>{if(n) return setTimeout(()=>go(n-1),700);     // a dropped connection gets one more try
    LIVE[k]={err:`The Deck Wizard app isn't answering (${e.message}). Is its window still open?`}; done();});
  go(1);}
/* ---------- pins: always include / never use, per commander (pins.json, edited through the app) ---------- */
let PINS={};   // commander -> {in,out} from the app's pins.json; else the pins the report was built with
const NOPIN={in:[],out:[]};
const pinsOf=d=>PINS[d.name]||d.pins||NOPIN, pinKey=p=>JSON.stringify([p.in||[],p.out||[]]);
const pinsChanged=d=>pinKey(pinsOf(d))!==pinKey(d.pins||NOPIN);
if(SERVED) fetch("/pins",{headers:{"X-Deck-Wizard":"1"}}).then(r=>r.ok?r.json():{}).then(j=>{PINS=j.pins||{};
  document.querySelectorAll("details.row[data-i]").forEach(r=>{if(r.dataset.f)rerow(r);});}).catch(()=>{});
function pinHTML(d,x){const p=pinsOf(d);
  const chip=(n,side)=>`<span class="pchip ${side}">${side==="in"?"📌 ALWAYS":"💀 DEAD TO ME"} · ${esc(n)}${SERVED?`<button class="pinx" data-unpin="${esc(n)}" data-side="${side}" title="Remove this pin" aria-label="Remove pin">✕</button>`:""}</span>`;
  const miss=(x.pinx||[]).map(([i,w])=>`<li>📌 ${esc(front(i))} isn't in this deck: ${esc(W(w))}</li>`).join("");
  return `<div class="pnl py pins"><h3 class="ptl">Pins</h3>${SERVED?`<small class="phint">Pins stick to this commander in every bracket and archetype: 📌 <b>Always</b> puts a card in (if the bracket allows it), 💀 <b>Dead to me</b> keeps it out. Decks rebuild right away.</small>`:""}<div class="pchips">${p.in.map(n=>chip(n,"in")).join("")}${p.out.map(n=>chip(n,"out")).join("")}${p.in.length||p.out.length?"":`<span class="dim">none yet</span>`}</div>
    ${SERVED?`<div class="padd"><input class="pinq" placeholder="card name_" aria-label="Card name to pin" autocomplete="off" data-ac="pin" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="acl"><button class="pa" data-pinadd="in" title="Put this card in every deck of this commander (bracket rules permitting)">Always</button><button class="pn" data-pinadd="out" title="Dead to me: never use this card for this commander">💀 Dead</button></div>`
      :`<small class="dim">add pins in Deck Wizard App.bat</small>`}<span class="thinw pinerr"></span>${miss?`<ul class="thinw">${miss}</ul>`:""}</div>`;}
function postPins(d,next,row){const err=row.querySelector(".pinerr"); if(err)err.textContent="Saving…";
  fetch("/pins",{method:"POST",headers:{"X-Deck-Wizard":"1","Content-Type":"application/json"},body:JSON.stringify({c:d.name,in:next.in,out:next.out})})
  .then(async r=>{const j=await r.json().catch(()=>({error:"Bad reply"}));
    if(!r.ok){const e=row.querySelector(".pinerr"); if(e)e.textContent="⚠ "+(j.error||("HTTP "+r.status)); return;}
    PINS[d.name]=j.pins; row.dataset.slot=""; rerow(row);})
  .catch(()=>{const e=row.querySelector(".pinerr"); if(e)e.textContent="⚠ The Deck Wizard app isn't answering.";});}
function lvlHTML(L){
  const off=SERVED?"":` disabled title="Open Deck Wizard App.bat to build decks at other levels"`;
  const bt=(a,v,on,tip,lab)=>`<button class="srcb ${on?"on":""}" data-${a}="${v}"${off||` title="${esc(tip)}"`}>${lab}</button>`;
  return `<div class="srcs"><span class="dim">EDHREC weight:</span>${[1,2,3,4].map(v=>bt("wsel",v,L.w===v,WTIP[v],v)).join("")}
</div>`;}
/* ---------- synergy swaps and next in line (cards read by what they do with the rest of the deck) ---------- */
// the aside's synergy panel: the first swaps (in = cyan, out = struck through in magenta), the rest folded
// Best from your binder: cards you own that work with this commander by what they do (Oracle + reminder text: engines, tribe,
// triggers), whatever EDHREC plays. Each names the card it would replace (a different one each); click = swap, again = undo.
function binderHTML(x,d,b,t){const sw=x.sw||[], bn=x.bench||[]; if(!sw.length&&!bn.length) return "";
  const ch=getCh(d,b,t), inDeck=new Set(x.deck.map(e=>e[0])), outs=new Set();
  const L=bn.filter(e=>e[2]>=0&&inDeck.has(e[2])&&!outs.has(e[2])&&outs.add(e[2])).slice(0,6);
  const pin=a=>SERVED?`<button type="button" class="pinb" data-pinquick="in" data-name="${esc(CARDS[a][0])}" title="Always include this card for this commander">📌</button>`:"";
  return `<section class="bsec"><div class="gh"><h3 class="p5-slab"><span>Best from your binder</span></h3><p class="dim">&gt; cards you own that work with ${esc(d.name.split(" // ")[0].split(",")[0])} by what they do (Oracle and reminder text), even if few decks play them_</p></div>
  ${L.length?`<div class="bgrid">${L.map(([a,w,o])=>{const on=ch["y"+o]===a;
    return `<div class="bcard${on?" on":""}"><img class="c" src="${IMG(a)}" alt="${esc(CARDS[a][0])}" loading="lazy"><div class="binfo"><b>${esc(front(a))}</b><small>${esc(W(w)||"fits this commander")}</small>
      <button type="button" class="bsw${on?" on":""}" data-bsw="${a}" data-out="${o}" aria-pressed="${on}" title="Put ${esc(front(a))} in this deck instead of ${esc(front(o))}">${on?"✓ swapped in for":"⇄ swap in for"} <span class="scr${on?" done":""}">${esc(front(o))}</span></button>${pin(a)}</div>${on?`<span class="stk">(SWAPPED!)</span>`:""}</div>`;}).join("")}</div>`:`<p class="dim">Nothing left in your binder beats what's already in this deck.</p>`}
  ${sw.length?`<div class="bdone"><span class="lbl">Already swapped in by the builder</span>${sw.map(([a,o,w])=>`<span class="bchip" title="${esc(W(w))}">+ ${esc(front(a))} <s>${esc(front(o))}</s></span>`).join("")}</div>`:""}
  ${synHTML(x)}</section>`;}
function synHTML(x){const sw=x.sw||[], bn=x.bench||[]; if(!sw.length&&!bn.length) return "";
  const nm=i=>`<a href="https://scryfall.com/search?q=${encodeURIComponent('!"'+front(i)+'"')}" target="_blank" rel="noopener">${esc(front(i))}</a>`;
  return `<details class="more"><summary>How these are picked · all ${sw.length} swap${sw.length===1?"":"s"} + ${bn.length} next in line</summary>
  <small class="dim">Cards are read by what they do with the cards already in this deck (Oracle and reminder text): outlets and payoffs, tribe, engines. ×N = linked cards (the commander counts 3).</small>
  ${sw.length?`<h4>Swapped in</h4><ul class="cl">${sw.map(([a,o,w])=>`<li>+ ${nm(a)} <small>for ${esc(front(o))} · ${esc(W(w))}</small></li>`).join("")}</ul>`:""}
  ${bn.length?`<h4>Next in line (yours, not in the deck)</h4><ul class="cl">${bn.map(([a,w,o])=>`<li>${nm(a)} <small>${esc(W(w)||"")}${o>=0?` · would replace ${esc(front(o))}`:""}</small>${SERVED?` <button class="pinb" data-pinquick="in" data-name="${esc(CARDS[a][0])}" title="Always include this card for this commander">📌 always include</button>`:""}</li>`).join("")}</ul>`:""}</details>`;}
/* ---------- deck shape: your deck (bars) against EDHREC's average deck (line) ---------- */
const TYO=["Creature","Instant","Sorcery","Artifact","Enchantment","Planeswalker","Battle","Other","Land"];
/* ---------- Deck stats & combos: a pile of post-its (mana curve, card types, power profile, combos); the tab picked last is
   kept in "dw:stat". Everything comes from the deck, EDHREC's average deck (av[b].ref) and Spellbook; nothing invented. ---------- */
const NOTES=[["curve","Mana curve"],["types","Card types"],["power","Power profile"],["combos","Combos"]];
let STAT="curve"; try{STAT=localStorage.getItem("dw:stat")||"curve";}catch(e){}
if(!NOTES.some(n=>n[0]===STAT)) STAT="curve";
const vword=v=>v===0?"SAME":v>0?v+" MORE":(-v)+" FEWER";
const vtag=v=>`<span class="vd${v===0?"":Math.abs(v)>=2?" d2":" d1"}">${vword(v)}</span>`;
const fmt=v=>Math.round(v*10)/10;
function pileHTML(d,b,x,items,ref,tname){
  const mv=[0,0,0,0,0,0,0,0], ty={}; let nl=0, cmc=0;
  items.forEach(it=>{const c=CARDS[it.i]; if(!c)return; const q=it.n||1; ty[c[2]]=(ty[c[2]]||0)+q;
    if(c[2]!=="Land"){mv[Math.min(7,c[4]||0)]+=q; nl+=q; cmc+=q*(c[4]||0);}});
  const avgN=`EDHREC average ${tname?esc(tname)+" ":b==="all"?"":SH[b]+" "}deck`;
  const lgd=`<span class="nlg"><span class="ly"><i></i>your deck</span>${ref?`<span class="lr"><i class="hatch"></i>${avgN}</span>`:""}</span>`;
  const sumR=(a,lo,hi)=>a.slice(lo,hi+1).reduce((s,v)=>s+v,0);
  // mana curve: two bars per mana value; the sentence and the verdicts only repeat the numbers
  const MV=k=>k===7?"7+":String(k), top=Math.max(1,...mv,...(ref?ref.mv:[]))+2;
  const cd=ref?mv.map((v,k)=>[MV(k),v-(ref.mv[k]||0)]).filter(z=>z[1]).sort((p,q)=>Math.abs(q[1])-Math.abs(p[1])):[];
  const curveSay=!ref?`<b>No EDHREC average deck to compare with.</b>`:!cd.length?`<b>Your curve matches the average deck.</b> Same count at every cost.`
    :`<b>Your curve is ${cd.every(z=>Math.abs(z[1])<=2)?"almost the same as":"different from"} the average deck.</b> Differences: ${cd.map(([m,v])=>vword(v).toLowerCase()+" at "+m+" mana").join(", ")}. Everything else matches.`;
  const facts=[["Non-land cards",nl],["Average mana value",nl?(cmc/nl).toFixed(2):"–"],
    ["Cheap (0–2 mana)",sumR(mv,0,2)+(ref?` · avg ${fmt(sumR(ref.mv,0,2))}`:"")],["Big (5+ mana)",sumR(mv,5,7)+(ref?` · avg ${fmt(sumR(ref.mv,5,7))}`:"")]];
  const curve=`<div class="nh"><h4>Mana curve</h4>${lgd}</div><p class="nsay">${curveSay}</p>
    <div class="nfacts">${facts.map(([k,v])=>`<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>
    <div class="ncurve" role="img" aria-label="Mana curve. ${mv.map((v,k)=>MV(k)+" mana: yours "+v+(ref?", average "+fmt(ref.mv[k]||0):"")).join("; ")}">${mv.map((v,k)=>{const r=ref?ref.mv[k]||0:null;
      return `<div class="cpair" title="${MV(k)} mana: you have ${v}${ref?", the average deck has "+fmt(r):""}"><div class="cy"><b>${v}</b><i style="height:${100*v/top}%"></i></div>${ref?`<div class="ca"><span>${fmt(r)}</span><i class="hatch" style="height:${100*r/top}%"></i></div>`:""}</div>`;}).join("")}</div>
    <div class="nmv">${mv.map((v,k)=>`<div><b>${MV(k)} mana</b>${ref?vtag(v-Math.round(ref.mv[k]||0)):""}</div>`).join("")}</div>
    <p class="nfoot">${ref?`Each pair: left = your deck, right = the ${avgN}.`:"Your deck's non-land cards by mana value."}</p>
    <details class="more"><summary>As a table</summary><table class="st"><tr><th></th><th>Your deck</th>${ref?"<th>Average deck</th>":""}</tr>
    ${mv.map((v,k)=>`<tr><td>MV ${MV(k)}</td><td>${v}</td>${ref?`<td>${fmt(ref.mv[k]||0)}</td>`:""}</tr>`).join("")}</table></details>`;
  // card types: one row per type, yours vs the average deck
  const tys=TYO.filter(g=>ty[g]||(ref&&ref.ty[g])), tmax=Math.max(1,...tys.map(g=>Math.max(ty[g]||0,ref?ref.ty[g]||0:0)));
  const PL={Creature:"creatures",Instant:"instants",Sorcery:"sorceries",Artifact:"artifacts",Enchantment:"enchantments",Planeswalker:"planeswalkers",Battle:"battles",Other:"others",Land:"lands"};
  const td=ref?tys.map(g=>[g,(ty[g]||0)-Math.round(ref.ty[g]||0)]).filter(z=>Math.abs(z[1])>=2).sort((p,q)=>Math.abs(q[1])-Math.abs(p[1])):[];
  const types=`<div class="nh"><h4>Card types</h4>${lgd}</div><p class="nsay">${!ref?`<b>No EDHREC average deck to compare with.</b>`
      :td.length?`<b>Biggest differences: ${td.map(([g,v])=>vword(v).toLowerCase()+" "+PL[g]).join(", ")}.</b> The rest is within 1 card of the average.`:`<b>Your card types match the average deck.</b> Every type is within 1 card.`}</p>
    ${tys.map(g=>{const v=ty[g]||0, r=ref?ref.ty[g]||0:null;
      return `<div class="trow" title="${g}: you have ${v}${ref?", the average deck has "+fmt(r):""}"><span class="tn">${g}</span><div class="tb"><div><i style="width:${100*v/tmax}%"></i><b>${v}</b></div>${ref?`<div><i class="hatch" style="width:${100*r/tmax}%"></i><span>${fmt(r)} avg</span></div>`:""}</div>${ref?vtag(v-Math.round(r)):"<span></span>"}</div>`;}).join("")}`;
  // power profile: power_profile() counts, each with what it counts
  const p=x.pw||{}, PW=[["Speed",p.speed,"10 minus the average mana value: a lower curve acts earlier"],["Interaction",p.interaction,"removal, board wipes and counterspells in the 99"],
    ["Ramp",p.ramp,"ramp cards in the 99 (Scryfall tags)"],["Draw",p.draw,"card draw in the 99 (Scryfall tags)"],["Tutor",p.tutor,"tutors × 3 (Scryfall otag:tutor)"],
    ["Combo",p.combo,"combos you own that are complete in this 99, × 3"],["Game Changers",p.gc,"cards on the official Game Changers list, × 3"]];
  const power=`<div class="nh"><h4>Power profile</h4></div>${PW.map(([k,v,w])=>`<div class="prow"><span class="pk">${k}</span><div class="pcells" role="img" aria-label="${k} ${v||0} of 10">${Array.from({length:10},(_,i)=>`<i${i<(v||0)?' class="on"':""}></i>`).join("")}</div><b>${v||0}</b><span class="pw">${w}</span></div>`).join("")}
    <p class="nfoot">A rough summary of what the 99 is made of, each capped at 10, not a power rating. Bracket Fit above is the rule-based check.</p>`;
  return `<div class="pile" data-cur="${STAT}"><div class="ptabs" role="tablist" aria-label="Deck stats">${NOTES.map(([k,l])=>`<button type="button" role="tab" class="ptab n-${k}" data-stat="${k}" id="pt-${d.i}-${k}" aria-controls="pn-${d.i}-${k}" aria-selected="${k===STAT}">${l}</button>`).join("")}</div>
  <div class="pstack">${backsHTML(STAT)}${[["curve",curve],["types",types],["power",power],["combos",combosNote(d,b,x)]].map(([k,h])=>`<div class="pnote n-${k}" role="tabpanel" id="pn-${d.i}-${k}" aria-labelledby="pt-${d.i}-${k}"${k===STAT?"":" hidden"}><span class="ptape" aria-hidden="true"></span>${h}</div>`).join("")}</div></div>`;}
// the two notes peeking out behind the front one
const backsHTML=cur=>{const o=NOTES.map(n=>n[0]).filter(k=>k!==cur);
  return `<span class="pback b2 n-${o[1]}" aria-hidden="true"></span><span class="pback b1 n-${o[0]}" aria-hidden="true"></span>`;};
function setStat(pile,k){STAT=k; try{localStorage.setItem("dw:stat",k);}catch(e){}
  pile.dataset.cur=k; pile.querySelectorAll(".ptab").forEach(t=>t.setAttribute("aria-selected",t.dataset.stat===k?"true":"false"));
  pile.querySelectorAll(".pnote").forEach(n=>n.hidden=!n.classList.contains("n-"+k));
  pile.querySelectorAll(".pback").forEach(x=>x.remove()); pile.querySelector(".pstack").insertAdjacentHTML("afterbegin",backsHTML(k));}
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest(".ptab[data-stat]"); if(t) setStat(t.closest(".pile"),t.dataset.stat);});
document.addEventListener("keydown",e=>{const t=e.target.closest&&e.target.closest(".ptab[data-stat]"); if(!t||(e.key!=="ArrowRight"&&e.key!=="ArrowLeft"))return;
  const L=[...t.parentNode.children], j=(L.indexOf(t)+(e.key==="ArrowRight"?1:L.length-1))%L.length; L[j].focus(); setStat(t.closest(".pile"),L[j].dataset.stat);});
// the deck as you chose it. Substitute slots: slot = the missing card's index, buy = keep the missing card.
// Swappable cards (popular, good fit, filler, combo; entries with options): slot = "y"+card, "y2" = an owned card you
// swapped in, buy = EDHREC's card for that job. "was" = the card the slot had before (EDHREC's card for a stand-in).
function effDeck(d,b,x,t){const ch=getCh(d,b,t);
  return x.deck.map(e=>{const [i,k,f]=e;
    if(k!=="s"&&k!=="k"&&(e.length>3||ch["y"+i]>=0)){const sk="y"+i, c=ch[sk];
      if(c===undefined)return {i,kind:k,f,slot:sk}; if(c===-1)return {i:OPTS[e[3]][1],kind:"buy",f:i,slot:sk,was:i,ok:k}; return {i:c,kind:"y2",f:i,slot:sk,was:i,ok:k};}
    if(k!=="s"||f<0)return {i,kind:k,f};
    const c=ch[f]; if(c===undefined)return {i,kind:"s",f,slot:f,was:f};
    if(c===-1)return {i:f,kind:"buy",f,slot:f,was:i,ok:"s"}; return {i:c,kind:"s2",f,slot:f,was:f,ok:"s"};});}
function chooserHTML(d,b,x,slot,t){
  const yp=String(slot).startsWith("y");
  const e=x.deck.find(r=>yp?r[1]!=="s"&&r[1]!=="k"&&"y"+r[0]===slot&&r.length>3:r[1]==="s"&&String(r[2])===String(slot)); if(!e) return "";
  const key=yp?slot:e[2], ch=getCh(d,b,t)[key];
  const taken=new Set(effDeck(d,b,x,t).filter(it=>String(it.slot)!==String(key)).map(it=>it.i));
  const opt=(pick,card,label,cls)=>{const dis=pick!==-1&&pick!=="adv"&&taken.has(card);
    const on=(pick==="adv"&&ch===undefined)||(pick===-1&&ch===-1)||(typeof pick==="number"&&pick>=0&&ch===pick);
    return `<button class="opt ${cls||""} ${on?"on":""}" data-pick="${pick}" data-slot="${key}" ${dis?"disabled title='already in this deck'":""}><img class="c" src="${IMG(card)}" alt="${esc(CARDS[card][0])}" loading="lazy"><b>${esc(front(card))}</b><small>${label}</small></button>`;};
  const shop=c=>buyA(c,"🛒 Find "+esc(front(c))+" on "+esc(STORE.name));
  // one menu for every card: keep this card, up to 3 owned alternatives (with why), the best card for the job you don't own
  if(yp){const [mine,k0,why,oi]=e, [alts,buy,bwhy]=OPTS[oi], lab=TAPE[k0][1];
    const keep=k0==="y"?W(why)||"good fit":k0==="f"?"filler"+(W(why)?" · "+W(why):""):k0==="c"?"combo piece":"popular";
    return `<h6>${lab} · keep it or swap it</h6>${k0==="c"&&W(why)?`<p class="cwarn">⚠ breaks combo: ${esc(W(why))}</p>`:""}<div class="orow">${opt("adv",mine,"keep this card · "+esc(keep))}${(alts||[]).map(([c,w])=>opt(c,c,esc(W(w)))).join("")}${buy>=0?opt(-1,buy,"buy · "+esc(W(bwhy)),"want"):""}</div>${buy>=0?shop(buy):""}
    ${(alts||[]).length?"":`<small>No other owned card does this job.</small>`}`;}
  const [adv,,f,why,alts]=e;
  // a stand-in: keep your card, another of yours, or buy EDHREC's card for the slot
  return `<h6>STAND-IN for ${esc(front(f))} · keep it or swap it</h6><div class="orow">${opt("adv",adv,"keep this card · "+esc(W(why)||"closest match"))}${(alts||[]).map(([c,w])=>opt(c,c,esc(W(w)))).join("")}${opt(-1,f,"buy · the card EDHREC decks play here","want")}</div>${shop(f)}
  ${(alts||[]).length?"":`<small>No other close match in your collection.</small>`}`;}
// what hovering a card in the deck shows: its options (substitute slot / your pick) and, in the app, pins
function bubbleHTML(d,b,x,it,t){
  const body=it.slot!=null?chooserHTML(d,b,x,it.slot,t):"", own=it.kind!=="buy"&&it.kind!=="m", nm=esc(CARDS[it.i][0]);
  const acts=!SERVED||!own?"":it.kind==="k"?`<button class="pinx srcb" data-unpin="${nm}" data-side="in">Remove 📌 pin</button>`
    :`<button class="pinb srcb" data-pinquick="in" data-name="${nm}" title="Put ${nm} in every deck of this commander">📌 Always include</button><button class="pinb srcb" data-pinquick="out" data-name="${nm}" title="Dead to me: never use ${nm} for this commander">💀 Dead to me</button>`;
  return body||acts?`<div class="bub">${body}${acts?`<div class="acts">${acts}</div>`:""}</div>`:"";}
// where to buy: the store's search page for a card (STATS.store, --store-url; {card} = front face name)
const STORE=ST.store||{url:"https://shop.com/search/results?query={card}",name:"shop.com"};
const BUY=i=>STORE.url.replace("{card}",encodeURIComponent(front(i)));
const buyA=(i,lab)=>`<a class="shopl" href="${esc(BUY(i))}" target="_blank" rel="noopener" title="Search ${esc(STORE.name)} for ${esc(front(i))}">${lab||"🛒 "+esc(front(i))}</a>`;
const USD=i=>(CARDS[i]&&CARDS[i][7])||0;   // price of the printing (missing cards: Scryfall), information only
const usd=i=>USD(i)?`<i class="usd">$${USD(i)<10?USD(i).toFixed(2):Math.round(USD(i))}</i>`:"";
function shopHTML(d,b,items,t,x){
  const buy=items.filter(it=>it.kind==="buy"), chosen=Object.keys(getCh(d,b,t)).length;
  const mine=new Set(buy.map(it=>it.i)), L=x?(x.gaps||[]).filter(g=>!mine.has(g[0])).slice(0,10):[], st=d?tbGet(d):{};
  const bought=L.filter(g=>st[CARDS[g[0]][0]]==="b");
  const list=buy.map(it=>"1 "+front(it.i)).concat(L.filter(g=>!st[CARDS[g[0]][0]]).map(g=>"1 "+front(g[0]))).join("\n");
  return `<div class="shop rcpt"><b class="rh">*** TO BUY ***</b><span class="rl"></span>
  <span class="rsub">YOUR PICKS</span>
  ${buy.length?buy.map(it=>`<span class="rr">${buyA(it.i,"1 "+esc(front(it.i)))}<span>${usd(it.i)} 🛒</span></span>`).join(""):`<span class="rr dim">none yet: "buy" on a missing card adds it here</span>`}
  ${L.length?`<span class="rl"></span><div class="ptb"><span class="rsub">MOST PLAYED HERE, NOT IN YOUR BINDER</span><ol class="tbl">${L.map(([i,r])=>{const nm=CARDS[i][0], s_=st[nm];
    return `<li class="${s_?"done "+s_:""}">${buyA(i,`<span class="scr${s_?" done":""}">${esc(front(i))}</span>`)}<small>${r}%</small>${usd(i)}
      <span class="tbb">${s_?`<button type="button" data-tbu="${esc(nm)}" title="Undo">↺</button>`:`<button type="button" data-tbs="${esc(nm)}" data-v="b" title="Got it">✓</button><button type="button" data-tbs="${esc(nm)}" data-v="x" title="Not interested">✕</button>`}</span></li>`;}).join("")}</ol></div>`:""}
  <span class="rl"></span><span class="rr"><b>TOTAL TO BUY</b><b>${buy.length+L.length-L.filter(g=>st[CARDS[g[0]][0]]).length}</b></span>
  ${(()=>{const L2=buy.map(it=>it.i).concat(L.filter(g=>!st[CARDS[g[0]][0]]).map(g=>g[0])), tot=L2.reduce((a,i)=>a+USD(i),0), nop=L2.filter(i=>!USD(i)).length;
    return tot?`<span class="rr"><span>ESTIMATED</span><span>~$${Math.round(tot)}${nop?` <small>(${nop} without a price)</small>`:""}</span></span>`:"";})()}
  ${bought.length?`<small>${bought.length} bought ✓</small>`:""}<small>each line opens ${esc(STORE.name)} · prices are Scryfall's, for information only</small>
  <span class="rbtn">${list?`<button class="cps" data-text="${esc(list)}">Copy list</button>`:""}${chosen?`<button class="reset-ch">Reset my choices</button>`:""}</span></div>`;}
const tbKey=d=>"dw:tb:"+d.slug, TBM={};
function tbGet(d){try{const v=localStorage.getItem(tbKey(d)); if(v!=null) return JSON.parse(v)||{};}catch(e){} return Object.assign({},TBM[tbKey(d)]);}
function tbSet(d,o){TBM[tbKey(d)]=o; try{Object.keys(o).length?localStorage.setItem(tbKey(d),JSON.stringify(o)):localStorage.removeItem(tbKey(d));}catch(e){}}
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("[data-tbs],[data-tbu],[data-bsw]"); if(!t)return;
  const r=t.closest("details.row[data-i]"); if(!r)return; const d=DATA[+r.dataset.i];
  if(t.dataset.bsw){const b=rowB(r), tt=rowSel(d,b,r), ch=getCh(d,b,tt), k="y"+t.dataset.out, a=+t.dataset.bsw;
    if(ch[k]===a) delete ch[k]; else ch[k]=a; setCh(d,b,ch,tt); r.dataset.slot=""; rerow(r); return;}
  const st=tbGet(d); if(t.dataset.tbu) delete st[t.dataset.tbu]; else st[t.dataset.tbs]=t.dataset.v; tbSet(d,st); rerow(r);});
function deckSection(title,cmdrs,items,text,link,bub){
  return `<div class="vbar">${title?`<h3>${title}</h3>`:""}<button class="vt on" data-v="cards">Cards</button><button class="vt" data-v="list">List</button><button class="cp">Copy list</button>${link||""}
</div>
  <div class="view v-cards">${bub?legendHTML():""}${grid(cmdrs,items,bub)}</div>
  <div class="view v-list" hidden><textarea readonly rows="16">${esc(text)}</textarea></div>`;}

/* ---------- combos ---------- */
const TAGN={E:"Spellbook: Exhibition",C:"Spellbook: Core",O:"Spellbook: Oddball",P:"Spellbook: Powerful",S:"Spellbook: Spicy",R:"Spellbook: Ruthless",B:"Spellbook: Banned"};
function comboHTML(C,inSkel,labOwn,labNear,bare){
  if(!C) return '<h4>Combos</h4><p class="dim">Combo data unavailable (rerun to retry).</p>';
  const inS=new Set(inSkel||[]);
  const own=[...C.own].sort((a,z)=>inS.has(z.id)-inS.has(a.id));
  const li=c=>`<li>${c.sat?comboName(c):`<a href="https://commanderspellbook.com/combo/${esc(c.id)}/" target="_blank" rel="noopener">${c.cards.map(x=>c.miss.includes(x)?`<b class="miss">${esc(x)}</b>`:esc(x)).join(" + ")}</a>${c.req.length?` <small>+ ${c.req.map(esc).join(", ")}</small>`:""}`}${comboTags(c)}${inS.has(c.id)?' <span class="tag">in deck</span>':""}<br><small>${c.prod.map(esc).join(" · ")}</small></li>`;
  const more=(k,l)=>k>l?`<li class="dim">+${k-l} more on Commander Spellbook</li>`:"";
  return `${bare?"":'<div class="vbar"><h3>Combos</h3></div>'}<div class="cols"><div><h4>${labOwn} (${C.n_own})</h4><ul class="cl">${own.map(li).join("")||"<li>None found</li>"}${more(C.n_own,C.own.length)}</ul></div>
  <div><h4>${labNear} (${C.n_near}) <small>missing card in red</small></h4><ul class="cl">${C.near.map(li).join("")||"<li>None found</li>"}${more(C.n_near,C.near.length)}</ul></div></div>`;}

const BNUM={exhibition:1,core:2,upgraded:3,optimized:4,cedh:5};
function comboName(c){
  const named=c.cards.map(x=>(c.miss||[]).includes(x)?`<b class="miss">${esc(x)}</b>`:esc(x));
  const conds=c.req.map((r,j)=>(c.sat&&c.sat[j]&&c.sat[j].length)?`<span title="${esc(r)}">${esc(c.sat[j].join(" / "))}</span>`:`<small>(${esc(r)})</small>`);
  return `<a href="https://commanderspellbook.com/combo/${esc(c.id)}/" target="_blank" rel="noopener">${named.concat(conds).join(" + ")}</a>`;}
function comboTags(c){
  return (c.win?' <span class="tag">wins</span>':"")+(c.inf?' <span class="tag" title="infinite">∞</span>':"")+
    (c.bt?` <span class="tag" title="Commander Spellbook's own tag, information only">${esc(TAGN[c.bt]||c.bt)}</span>`:"");}
function bestHTML(d,b,x){
  const L=(x.cl||[]).map(([i,st])=>{const c=COMBOS[i];
    return `<li>${comboName(c)}${comboTags(c)} <span class="tag">${st===2?"in this deck":"you own every piece"}</span><br><small>${c.prod.map(esc).join(" · ")}${c.two?" · two-card infinite":""}</small></li>`;}).join("");
  const scope=b==="all"?"(all decks: no bracket rules)":`allowed in ${LBL[b]}`;
  return `<h4>Best combos you own, ${scope}</h4><small>Order: in this deck first, then combos that win the game, then fewer pieces, then cheaper.</small><ul class="cl">${L||"<li>None you can assemble in these colours.</li>"}</ul>`;}
function combosNote(d,b,x){
  if(!d.combos) return `<div class="nh"><h4>Combos</h4></div><p class="nsay"><b>Combo data unavailable</b> (rerun to retry).</p>`;
  const sel=BNUM[b], inS=new Set(x.cin||[]), BS=b==="all"?"":LBL[b].split(" ")[0];
  const best=(x.cl||[])[0], bc=best&&COMBOS[best[0]];
  const bestBox=bc?`<div class="nbest"><span class="lbl">Best combo · ${b==="all"?"all decks (no bracket rules)":"allowed in "+BS}</span><b>${comboName(bc)}</b>
      <span>${bc.prod.map(esc).join(" · ")}${bc.two?" · two-card infinite":""}</span>
      <span class="ntags"><span class="${best[1]===2?"inv":""}">${best[1]===2?"In this deck":"You own every piece"}</span>${bc.win?"<span>Wins</span>":""}</span></div>`
    :`<div class="nbest"><span class="lbl">Best combo</span><b>None you can assemble in these colours${b==="all"?"":" that "+BS+" allows"}.</b></div>`;
  const row=i=>{const c=COMBOS[i], late=c.need===3, ok=!sel||sel>=4||(sel===3&&late);
    const rule=[late?"late or no standalone win":"early win",(c.mv??c.tmv)+" mana needed"].concat(c.win?["wins"]:[],inS.has(c.id)?["in this deck"]:[],
      [sel?(ok?"OK in "+BS:"not allowed in "+BS+": left out"):late?"allowed from B3":"B4+ only"]).join(" · ");
    return `<div class="dzr"><b>${comboName(c)}</b><span${ok?"":' class="bad"'}>${rule}</span></div>`;};
  const dz=d.dz||[], C={own:(d.co||[]).map(i=>COMBOS[i]),near:(d.cn||[]).map(i=>COMBOS[i]),n_own:d.combos.n_own,n_near:d.combos.n_near};
  return `<div class="nh"><h4>Combos</h4><span class="ncount">${d.combos.n_own} in your collection · ${(x.cin||[]).length} in this deck</span></div>${bestBox}
  <div class="ndz"><div class="dzh"><b>Danger zone (${dz.length})</b><span title="A card that meets a combo's condition counts as its second card.">two-card infinites you can assemble · none in B1–B2; in B3 no early win (Commander Spellbook: 4 mana or less, standalone result); anything in B4–B5</span></div>
  ${dz.slice(0,6).map(row).join("")||'<div class="dzr"><b>No two-card infinites you can assemble in these colours.</b></div>'}</div>
  <details class="more nmore"><summary>${dz.length>6?`+ ${dz.length-6} more · `:""}all ${C.n_own} combos -&gt;</summary>
  ${dz.length>6?`<div class="ndz">${dz.slice(6).map(row).join("")}</div>`:""}${bestHTML(d,b,x)}${comboHTML(C,x.cin,"In your collection","One card away",true)}</details>`;}

/* ---------- the three numbers ---------- */
const RDL={ramp:"Ramp",draw:"Card draw",removal:"Removal",wipe:"Board wipes",mv:"Avg mana value",src:"Colour sources (weakest)",odd:"Stand-ins + fillers",win:"Win conditions (finishers, drain, alt wins)"};
// the first failing readiness check, said plainly (it only repeats the check's own numbers)
const READYCAP={ramp:"RAMP",draw:"CARD DRAW",removal:"REMOVAL",wipe:"BOARD WIPE",win:"WIN CONDITION"};
function readyCap([k,v,t]){
  if(READYCAP[k]){const d=t-v; return `(NEEDS ${d} MORE ${READYCAP[k]}${d===1?"":"S"}!)`;}
  return k==="mv"?`(CURVE ABOVE ${t}!)`:k==="src"?`(FEW ${esc(String(v).split(" ")[0])} SOURCES!)`:k==="odd"?"(TOO MANY STAND-INS!)":"";}
function numsHTML(x,b){
  const rd=x.rd||[], ok=rd.filter(c=>c[3]).length, bad=rd.filter(c=>!c[3]);
  const fail=bad.map(([k,v,t])=>`<li>${RDL[k]}: ${esc(v)} <small>(${k==="mv"||k==="odd"?"max":"want"} ${t})</small></li>`).join("");
  const bf=x.bf||{est:2,why:[]}, sel={exhibition:1,core:2,upgraded:3,optimized:4,cedh:5}[b];
  const lbl=bf.est<=2?"B1–2":bf.est>=4?"B4+":"B3", BS=LBL[b].split(" ")[0], fits=!sel||bf.est<=Math.max(sel,2)||sel===5;
  return `<div class="tiles">
  <div class="tile num p5-card"><span class="p5-burst mburst" aria-hidden="true"></span><span class="t">Collection Match</span><b class="tbig">${x.pct}%</b>${bat(x.pct,10,"big")}<span class="tt">${x.avg?`You own ${x.own_n} of the ${x.tmpl_n} non-basic cards in EDHREC's average ${x.theme?esc(x.theme)+" ":b==="all"?"":LBL[b]+" "}deck (${n(x.decks)} decks).`
    :`You own ${x.own_n} of the top ${x.tmpl_n} cards in ${n(x.decks)} ${x.theme?esc(x.theme)+" decks (all brackets)":LBL[b]+" decks"}.`}</span></div>
  <div class="tile num inv p5-card"><span class="t">Build Readiness</span><b class="tbig">${ok}/${rd.length}</b>${fail?`<ul>${fail}</ul>`:`<span class="tt">Roles, curve, mana and real cards all look fine.</span>`}${bad.length?`<span class="cap y">${readyCap(bad[0])}</span>`:""}</div>
  <div class="tile num p5-card"><span class="t">Bracket Fit</span><b class="tbig">${lbl}</b>${bf.why.length?`<ul>${bf.why.map(w=>`<li>${esc(w)}</li>`).join("")}</ul>`:`<span class="tt">No Game Changers, mass land denial, chained extra turns or two-card combos found.</span>`}<small>${x.tut||0} tutors (B1–2 expect few)</small>${sel?`<span class="stk ${fits?"":"m"}">(${fits?"FITS":"ABOVE"} ${BS}!)</span>`:""}</div></div>`;}

/* ---------- commander rows ---------- */
const THIN=50;
const THEME_SHOW=3;   /* archetype buttons shown per commander (the run builds THEME_TOP 4; the 4th stays an EDHREC link) */   /* fewer EDHREC decks than this behind a deck or archetype: warn */
// gaps: each substitute slot as a row of option cards (Buy it / Advised / Or…), the same saved choices as the bubbles
function slotRowsHTML(d,b,x,t){
  const ch=getCh(d,b,t), eff=effDeck(d,b,x,t), slots=x.deck.filter(e=>e[1]==="s"&&e[2]>=0);
  if(!slots.length) return `<p class="dim">No stand-ins in this deck: every card it plays is yours.</p>`;
  return slots.map(e=>{const [adv,,f,why,alts]=e, c=ch[f], g=(x.gaps||[]).find(g=>g[0]===f);
    const taken=new Set(eff.filter(it=>String(it.slot)!==String(f)).map(it=>it.i));
    const opts=[["adv","Advised",adv,W(why)||"closest match"]].concat((alts||[]).map(([a,w])=>[a,"Or",a,W(w)]));
    const bon=c===-1;
    const shop=STORE.url?BUY(f):"https://scryfall.com/search?q="+encodeURIComponent('!"'+front(f)+'"');
    return `<div class="gslot"><div class="gmc"><button type="button" role="radio" aria-checked="${bon}" class="gopt gmiss${bon?" on":""}" data-pick="-1" data-slot="${f}" title="Buy ${esc(front(f))}: it goes on the receipt (again: keep your stand-in)"><img class="gimg" src="${IMG(f)}" alt="${esc(front(f))}" loading="lazy"><span class="nib">(NOT IN YOUR BINDER!)</span>${bon?`<span class="stk">(CHOSEN!)</span>`:`<span class="gbuy">BUY IT</span>`}</button>
      <span class="gname">${esc(front(f))} ${usd(f)}</span><span class="gmeta">${g&&g[1]?g[1]+"% of decks":"—"} · ${esc(g?W(g[4])||"synergy piece":"")}</span><a class="shopl" href="${esc(shop)}" target="_blank" rel="noopener">🛒 ${STORE.url?esc(STORE.name):"Scryfall"}</a></div>
      <span class="garr" aria-hidden="true">-&gt;</span>
      <div class="gopts" role="radiogroup" aria-label="Slot for ${esc(front(f))}">${opts.map(([pick,kind,card,w])=>{
        const on=pick==="adv"?c===undefined:pick===-1?c===-1:c===pick, dis=pick!==-1&&pick!=="adv"&&taken.has(card);
        return `<button type="button" role="radio" aria-checked="${on}" class="gopt${on?" on":""}" data-pick="${pick}" data-slot="${f}"${dis?" disabled title='already in this deck'":""}><span class="gk">${kind}</span><b>${esc(front(card))}</b><img class="c gim" src="${IMG(card)}" alt="" loading="lazy"><span>${esc(w)}</span>${on?`<span class="stk">(CHOSEN!)</span>`:""}</button>`;}).join("")}</div></div>`;}).join("");}
/* ---------- commander panel: header + settings sheet, three tiles, slim sticky bar, the 99 + aside, gaps, stats ---------- */
const SH={all:"ALL",exhibition:"B1",core:"B2",upgraded:"B3",optimized:"B4",cedh:"B5"};
function imgModeHTML(){const m=document.documentElement.dataset.img||"full";
  return `<div class="imgmode" role="group" aria-label="Card image style"><button type="button" data-imgm="full" aria-pressed="${m==="full"}">Full colour</button><button type="button" data-imgm="copy" aria-pressed="${m==="copy"}">Photocopy</button></div>`;}
const WHY={};   // per commander row: what its "Why this card?" panel needs (filled by body(), read by the events)
function body(d,b,r){
  const st=rowState(d,b,r), asel=st.a, tsel=st.t, L=lvlOf(r), lv=L.w!==3||L.s!==2||pinsChanged(d);
  // another EDHREC weight: the app builds it (saved choices are kept per level)
  const sel=rowSel(d,b,r), suf=L.s===1?"/budget":L.s===3?"/expensive":"";
  const lx=lv?LIVE[liveKey(d,b,st,L)]:null;
  if(lv&&SERVED&&!lx) fetchLive(d,b,st,L);
  const x=lx&&lx.x?lx.x:deckOf(d,b,st), pre=b==="all"?"":"/"+b;
  // archetype (overview + EDHREC's top themes)
  const ths=Object.entries(d.th||{}).slice(0,THEME_SHOW), tot=d.b.all.decks||1, tcount=Object.fromEntries(d.tags.map(t=>[t[1],t[2]]));
  const arch=`<div class="srcs" role="group" aria-label="Archetype"><button class="srcb ${tsel?"":"on"}" data-tsel="" title="The commander's overall deck">Overview</button>`
    +ths.map(([k,t])=>{const thin=t.decks<THIN;return `<button class="srcb thm ${k===tsel?"on":""}${thin?" thin":""}" data-tsel="${k}" title="EDHREC: ${n(tcount[k]||0)} of ${n(tot)} decks are ${esc(t.name)} · you own ${t.own}% of the cards those decks play${thin?` · ⚠ thin data: only ${n(t.decks)} decks (under ${THIN})`:""}">${thin?"⚠ ":""}<b>${esc(t.name)}</b> <span>${Math.round(100*(tcount[k]||0)/tot)}% of decks · own ${t.own}%</span></button>`;}).join("")
    +(ths.length?"":`<span class="dim">no archetype pages</span>`)+`</div>`;
  const shownT=new Set(ths.map(t=>t[0])), other=d.tags.filter(t=>!shownT.has(t[1])).slice(0,5);
  const more=other.length?`<div class="tags"><span class="dim">More on EDHREC:</span>${other.map(t=>`<a class="tag" href="https://edhrec.com/commanders/${d.slug}/${t[1]}" target="_blank" rel="noopener">${esc(t[0])} ↗</a>`).join("")}</div>`:"";
  // source within the archetype
  const avOK=tsel?hasTAvg(d,b,tsel):hasAvg(d,b), cmdX=tsel?themed(d,b,tsel):d.b[b], avX=avOK?(tsel?tavgd(d,b,tsel):avgd(d,b)):null;
  const srcs=`<div class="srcs seg" role="group" aria-label="Deck source"><button class="srcb ${asel?"":"on"}" data-asel="0" title="Popular cards: decks built from the cards EDHREC sees most often for this commander, filled in with your cards">Popular cards · ${cmdX.pct}%</button><button class="srcb ${asel?"on":""}" data-asel="1" ${avOK?`title="Typical deck: EDHREC's average deck (one typical 99), rebuilt with your cards"`:`disabled title="EDHREC has no average deck for this"`}>Typical deck${avOK?" · "+avX.pct+"%":""}</button></div>`;
  const srcN=asel||!tsel?x.decks:x.tdecks;
  const what=(tsel?`<b>${esc(x.theme)}</b> `:"")+(asel?"average deck":"commander page");
  const link=asel?`https://edhrec.com/average-decks/${d.slug}${tsel?"/"+tsel:pre}${suf}`:`https://edhrec.com/commanders/${d.slug}${tsel?"/"+tsel:pre}${suf}`;
  const tnote=`<p class="tnote">&gt; ${asel?`EDHREC's ${tsel?esc(x.theme)+" ":""}average deck (${n(x.decks)} decks), rebuilt with your cards: cards you own stay, missing ones get your closest stand-in`
      :`Built from EDHREC's ${n(tsel?x.tdecks:x.decks)} ${tsel?esc(x.theme)+" decks":LBL[b]+" decks"} and your cards`}${tsel?`, leaning into cards ${esc(x.theme.toLowerCase())} decks need`:""} · ${b==="all"?"no bracket rules":LBL[b]+" rules"}${lv?` · EDHREC weight ${L.w} · ${"$".repeat(L.s)}${L.s===1?" (budget decks)":L.s===3?" (expensive decks)":""}`:""}.
    <a href="${link}" target="_blank" rel="noopener">EDHREC ${what} ↗</a></p>`
;
  const bks=BR.filter(k=>d.b[k]).map(k=>{const sk=rowState(d,k,r), xk=sk.t===tsel&&sk.a===asel?deckOf(d,k,sk):null;
    return `<button class="bk ${k===b?"on":""}" data-bsel="${k}" title="Show the ${LBL[k]} deck"><b>${SH[k]}</b>${xk?`<span>${xk.pct}% · ${n(xk.decks)}</span>`:""}</button>`;}).join("");
  const sheet=`<div class="sheet"><div class="srow"><span class="slab">Bracket</span><div class="bks" role="group" aria-label="Bracket">${bks}</div></div>
    <div class="srow"><span class="slab">Archetype</span><div class="scell">${arch}${more}</div></div>
    <div class="srow"><span class="slab">Deck from</span><div class="scell">${srcs}${lvlHTML(L)}</div></div></div>`;
  const pipsH=`<span class="pips">${pips(d.ci)}</span>`;
  const head=`<div class="hero"><div class="hcol"><div class="cslash p5-in" aria-hidden="true"></div><div class="himg">${d.img?`<img class="cimg" src="${esc(d.img)}" alt="${esc(d.name)}" loading="lazy">`:""}</div>${imgModeHTML()}${srcN<THIN?`<div class="haz" role="note" title="This deck comes from only ${n(srcN)} EDHREC decks (under ${THIN}): treat it as a rough guide, not a proven list."><span class="hzt" aria-hidden="true"><i>!</i></span><span><b>THIN DATA</b><small>only ${n(srcN)} EDHREC deck${srcN===1?"":"s"} · rough guide</small></span></div>`:""}</div>
    <div class="hmain"><div class="ttl pname"><div class="p5-slash" aria-hidden="true"></div><h2 class="p5-h1c" aria-label="${esc(d.name)}"><span aria-hidden="true">${ransom(d.name.split(" // ")[0],d.i%6)}</span></h2><span class="tpips" aria-label="Colour identity ${d.ci.join("")||"colourless"}">${pips(d.ci)}</span></div>
    <div class="hmeta"><span>${d.tags.slice(0,3).map(t=>esc(t[0].toLowerCase())).join(" · ")||"no EDHREC themes yet"} · ${n(x.decks)} ${b==="all"?"":SH[b]+" "}decks · ${d.combos?d.combos.n_own:0} combos owned</span></div>`;
  if(lv&&!(lx&&lx.x)) return `${head}${sheet}${pinHTML(d,{})}
    <p class="${lx&&lx.err?"thinw":"tnote"}">${lx&&lx.err?"⚠ "+esc(lx.err)+" Pick a level to try again."
      :`Building the deck at EDHREC weight ${L.w}… (new EDHREC pages are downloaded once, then cached)`}</p></div></div>`;
  const eff=effDeck(d,b,x,sel), deckSet=new Set(eff.map(it=>it.i));
  const items=eff.concat(x.basics.map(([i,c])=>({i,kind:"",n:c}))); items.forEach((it,j)=>it.w=j);
  const text=["Commander","1 "+front(d.cidx),"","Deck",...eff.map(it=>"1 "+front(it.i)),...x.basics.map(([i,c])=>c+" "+front(i))].join("\n")+"\n";
  const rd=x.rd||[], ok=rd.filter(c=>c[3]).length, bf=x.bf||{est:2}, seln={exhibition:1,core:2,upgraded:3,optimized:4,cedh:5}[b];
  const fits=!seln||bf.est<=Math.max(seln,2)||seln===5, toBuy=eff.filter(it=>it.kind==="buy").length;
  const around=(x.core||[]).length?`<div class="around"><span class="lab">Built around</span>${x.core.map(([k,v],i)=>`<span class="ar${i?"":" top"}" title="cards in the 99 that share it with the commander">${esc(k)} ${v}</span>`).join("")}</div>`:"";
  const mix=`<p class="mixl">${x.rec} ${x.avg?"from the average deck":"popular"} + <span class="kp">${x.pick||0} good fit${x.pick===1?"":"s"}</span>${x.pin?` + ${x.pin} always in`:""}${x.cpc?` + <span class="kc">${x.cpc} combo</span>`:""} + <span class="ks">${x.subs} stand-in${x.subs===1?"":"s"}</span> + <span class="kf">${x.fill} filler${x.fill===1?"":"s"}</span> · avg MV ${x.cmc} · ${x.gc} Game Changer${x.gc===1?"":"s"}${x.gc?` (${x.gcn.map(esc).join(", ")})`:""} · combos in deck: ${(x.cin||[]).length}${x.c2?` (${x.c2} two-card)`:""}</p>`;
  const ptick=tickHTML([`Match ${x.pct}%`,`Ready ${ok}/${rd.length}`,`Bracket ${bf.est<=2?"B1–2":bf.est>=4?"B4+":"B3"}`+(seln?` · ${fits?"fits":"above"} ${SH[b]}`:""),
    `${d.combos?d.combos.n_own:0} combos owned`,`${(x.sw||[]).length} synergy swaps`,`${toBuy} to buy`]);
  const slim=`<div class="slim"><span class="ondeck">ON DECK</span>${d.img?`<img class="mimg" src="${esc(d.img)}" alt="" loading="lazy">`:""}<b class="sname">${esc(d.name.split(" // ")[0])}</b>${pipsH}
    <span class="sbat">${bat(x.pct,10,"sm")}<b>${x.pct}%</b></span>
    <span class="wide sfit"><b>${ok}/${rd.length}</b> ready · <b>${bf.est<=2?"B1–2":bf.est>=4?"B4+":"B3"}</b>${seln?` <span class="cap ${fits?"c":"m"}">${fits?"fits":"above"} ${SH[b]}</span>`:""}</span>
    <span class="sp"></span>
    <div class="wide mbks" role="group" aria-label="Bracket">${BR.filter(k=>d.b[k]).map(k=>`<button class="mbk ${k===b?"on":""}" data-bsel="${k}" title="${LBL[k]}">${SH[k]}</button>`).join("")}</div>
    <label class="wide slab2">archetype <select class="tsel">${[["","Overview"]].concat(ths.map(([k,t])=>[k,t.name])).map(([k,nm])=>`<option value="${k}"${k===tsel?" selected":""}>${esc(nm)}</option>`).join("")}</select></label>
    <span class="wide tobuy">TO BUY · ${toBuy}</span></div>`;
  // "Why this card?": the panel starts on the first of your picks (else the first card); hover previews, click pins
  const first=items.find(it=>it.kind==="y")||items[0];
  WHY[d.i]={items,x,b,st,L,pin:null,cur:first?first.w:null};
  return `${head}${around}${mix}${sheet}${tnote}</div></div>
  <div class="tickw" aria-hidden="true"><div class="p5-ticker"><div class="p5-track">${ptick}</div></div></div>
  ${numsHTML(x,b)}
  ${slim}
  <div class="d99"><div class="dmain"><h3 class="p5-slab"><span>The 99</span></h3>
  ${deckSection("",[d.cidx],items,text,`<a href="${link}" target="_blank" rel="noopener">EDHREC</a>`,it=>bubbleHTML(d,b,x,it,sel))}
  <p class="dim whyhint">click any card for "why this card" · Esc or click it again to let go</p></div>
  <aside class="daside"><div class="pnl why" aria-live="polite">${first?whyHTML(d.i,first.w):""}</div>${shopHTML(d,b,items,sel,x)}${pinHTML(d,x)}</aside></div>
  <div class="cmyk" aria-hidden="true"></div>
  <section class="gsec"><div class="gh"><h3 class="p5-slab"><span>Missing staples</span></h3><p class="dim">&gt; cards EDHREC decks for this commander play that you don't own (${x.n_miss}), with the card of yours standing in · click the card to buy it_</p></div>
  ${slotRowsHTML(d,b,x,sel)}
  <details class="more"><summary>Other ${x.avg?"average-deck":"popular"} cards you're missing: ${x.n_miss} (top ${x.gaps.length} with your alternatives)</summary>
  ${gapsHTML(x.gaps,deckSet,new Set(eff.filter(it=>it.slot!=null).map(it=>it.slot)))}</details></section>
  <div class="cmyk" aria-hidden="true"></div>
  ${binderHTML(x,d,b,sel)}
  <div class="cmyk" aria-hidden="true"></div>
  <section class="ssec"><h3 class="p5-slab"><span>Deck stats &amp; combos</span></h3>
  <p class="dim">&gt; a pile of post-its: pull a tab to bring that note to the top_</p>
  ${pileHTML(d,b,x,items,lv?x.ref||null:tsel?(hasTAvg(d,b,tsel)?d.th[tsel].av[b].ref:null):(hasAvg(d,b)?d.av[b].ref:null),tsel?d.th[tsel].name:"")}</section>`;}
/* ---------- "Why this card?": the real parts of a card's place in this deck (no score). The static report shows what
   it holds (kind, reason, roles, combos, swaps); the app adds EDHREC numbers and deck links from GET /why. ---------- */
const ROLEN=["ramp","draw","removal","wipe","tutor","counter","recursion","sac outlet","win condition"];
const rolesOf=i=>{const m=(CARDS[i]||[])[6]||0; return ROLEN.filter((_,k)=>m&(1<<k));};
const WHYC={}; let WHYT=null;     // app answers per (deck, card), and the 150 ms rest timer
const whyKey=(d,W_,card)=>[d.slug,W_.b,W_.st.t,W_.st.a?1:0,W_.L.w,W_.L.s,card].join("|");
let COMBO_ID=null;
function whyHTML(di,wi){
  const d=DATA[di], W_=WHY[di], it=W_&&W_.items[wi]; if(!it) return "";
  const x=W_.x, k=kindOf(it), card=(it.kind==="s"||it.kind==="s2")&&it.f>=0?it.i:it.i, c=CARDS[card];
  const [tcls,tlab]=TAPE[k]||["",""], pinned=W_.pin===wi, parts=[];
  // why it's here, from the deck entry itself
  const e=x.deck.find(r=>r[0]===it.i||(r[1]==="s"&&r[2]===it.f));
  if(it.kind==="s"||it.kind==="s2") parts.push(["Stands in for",`${front(it.f)}${it.kind==="s"&&e&&W(e[3])?" · "+W(e[3]):""}${it.kind==="s2"?" (your swap)":""}`]);
  else if(it.kind==="y") parts.push(["Why it's here","good fit: "+(W(it.f)||"it fits this commander")]);
  else if(it.kind==="y2") parts.push(["Why it's here",`your swap, instead of ${front(it.f)}`]);
  else if(it.kind==="k") parts.push(["Why it's here","always in: you pinned it"]);
  else if(it.kind==="c") parts.push(["Why it's here","combo: part of "+(W(it.f)||"a combo in this deck")]);
  else if(it.kind==="f") parts.push(["Why it's here","filler: added to reach the minimum for "+(W(it.f)||"a role")]);
  else if(it.kind==="buy") parts.push(["Why it's here",`you chose to buy it for this slot`]);
  else if(it.n) parts.push(["Why it's here","basic land"]);
  else parts.push(["Why it's here","popular: EDHREC decks for this commander play it"]);
  const sw=(x.sw||[]).find(s=>s[0]===card); if(sw) parts.push(["Synergy swap",`replaced ${front(sw[1])} · ${W(sw[2])}`]);
  const ro=rolesOf(card); parts.push(["Roles",ro.length?ro.join(" · "):"none of the tracked jobs"]);
  if(!COMBO_ID){COMBO_ID={}; COMBOS.forEach(r=>COMBO_ID[r.id]=r);}
  const cmb=(x.cin||[]).map(id=>COMBO_ID[id]).filter(r=>r&&r.cards.some(nm=>nm.split(" // ")[0]===front(card)));
  if(cmb.length) parts.push(["Combos in this deck",cmb.slice(0,3).map(r=>r.cards.map(nm=>nm.split(" // ")[0]).join(" + ")).join(" · ")]);
  // the app adds EDHREC's numbers and this deck's links
  const a=SERVED?WHYC[whyKey(d,W_,c[0])]:null;
  if(a&&a.ok){const r=a.ok;
    parts.push(["EDHREC",r.listed?`played in ${r.rate}% of these ${n(r.decks)} decks${r.syn!=null?` · synergy ${r.syn>0?"+":""}${r.syn}%`:""}`:`not in EDHREC's list for this page (under ~5% of ${n(r.decks)} decks)`]);
    if(r.fit||(r.cmdr||[]).length) parts.push(["Shares with the commander",[r.fit,(r.cmdr||[]).length?"engine: "+r.cmdr.join(", "):""].filter(Boolean).join(" · ")]);
    if((r.links||[]).length) parts.push(["Links in this deck",r.links.map(([nn,lab])=>`${lab} ×${nn}`).join(" · ")]);}
  else if(SERVED&&a&&a.err) parts.push(["EDHREC","⚠ "+a.err]);
  else if(SERVED) parts.push(["EDHREC","…"]);
  else parts.push(["EDHREC","open the app (Deck Wizard App.bat) for play rate, synergy and deck links"]);
  const nm=esc(c[0]), own=k!=="buy"&&k!=="m"&&!it.n;
  return `<h3 class="wtl">Why this card?</h3><div class="whead"><img class="c wthumb" src="${IMG(card)}" alt="" loading="lazy"><div class="wtxt">
    <b class="wname">${esc(front(card))}</b>${tapeSpan(k)}
    <span class="wline">${esc(c[2])} · MV ${c[4]||0}${c[3]?" · Game Changer":""}</span>
    <span class="wmode${pinned?" on":""}">${pinned?"📍 PINNED · Esc or click again to let go":"PREVIEW · click the card to pin"}</span></div></div>
    <dl class="wparts">${parts.map(([kk,v])=>`<div><dt>${esc(kk)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
    <div class="wbtn">${SERVED&&own?`<button class="pinb pa" data-pinquick="in" data-name="${nm}">📌 Always include</button><button class="pinb pn" data-pinquick="out" data-name="${nm}" title="Never use this card for this commander">💀 Dead to me</button>`:""}
    <a class="wsf" href="https://scryfall.com/search?q=${encodeURIComponent('!"'+front(card)+'"')}" target="_blank" rel="noopener">Scryfall ↗</a></div>`;}
function whyShow(row,wi){const di=+row.dataset.i, W_=WHY[di]; if(!W_||wi==null)return; W_.cur=wi;
  const box=row.querySelector(".why"); if(box) box.innerHTML=whyHTML(di,wi);
  row.querySelectorAll(".d99 .cw .ct[aria-pressed]").forEach(a=>a.setAttribute("aria-pressed",String(W_.pin!=null&&+a.closest(".cw").dataset.wi===W_.pin)));
  row.querySelectorAll(".d99 .cw.wpin").forEach(c=>c.classList.remove("wpin"));
  if(W_.pin!=null){const c=row.querySelector(`.d99 .cw[data-wi="${W_.pin}"]`); if(c)c.classList.add("wpin");}
  if(!SERVED) return;
  const it=W_.items[wi], card=CARDS[it.i][0], key=whyKey(DATA[di],W_,card);
  if(WHYC[key]) return;
  clearTimeout(WHYT);             // ask the app only once the mouse has rested on the card for ~150 ms
  WHYT=setTimeout(()=>{WHYC[key]={busy:1};
    const qs=new URLSearchParams({c:DATA[di].name,b:W_.b,t:W_.st.t,a:W_.st.a?"1":"0",w:W_.L.w,s:W_.L.s,card});
    fetch("/why?"+qs,{headers:{"X-Deck-Wizard":"1"}}).then(async res=>{const j=await res.json().catch(()=>({error:"bad reply"}));
      WHYC[key]=res.ok&&j&&j.card?{ok:j}:{err:(j&&j.error)||("HTTP "+res.status)};})
    .catch(()=>{WHYC[key]={err:"the app isn't answering"};})
    .finally(()=>{if(WHY[di]&&WHY[di].cur===wi){const b2=row.querySelector(".why"); if(b2)b2.innerHTML=whyHTML(di,wi);}});},150);}

function render(){
  const fd=document.querySelector(".fdot"); if(fd) fd.hidden=!($("th").value||$("dk").value!=="0"||$("cf").value||$("so").value!=="pct");
  const b=bk(); $("bv").textContent=LBL[b]; $("br").style.setProperty("--p",(100*br.value/Math.max(1,br.max))+"%");
  const q=$("q").value.toLowerCase(), p=MINP, dk=+$("dk").value, th=$("th").value, cf=$("cf").value;
  const nc=d=>d.combos?d.combos.n_own:0;
  document.querySelectorAll(".srcsel .srcb").forEach(x=>x.classList.toggle("on",x.dataset.src===SRC)); segAll(document.querySelector(".filt"));
  const rows=DATA.filter(d=>{const x=X(d,b); return x&&d.name.toLowerCase().includes(q)&&[...COLS].every(k=>d.ci.includes(k))
    &&x.pct>=p&&x.decks>=dk&&(!th||d.tags.slice(0,3).some(t=>t[0]===th))
    &&(!cf||(cf==="own"?nc(d)>0:(x.cin||[]).length>0));});
  const so=$("so").value;
  const rdy=x=>(x.rd||[]).filter(c=>c[3]).length;
  rows.sort(so==="ready"?(a,z)=>rdy(X(z,b))-rdy(X(a,b))||X(z,b).pct-X(a,b).pct:so==="decks"?(a,z)=>X(z,b).decks-X(a,b).decks:so==="combos"?(a,z)=>nc(z)-nc(a)||X(z,b).pct-X(a,b).pct:(a,z)=>X(z,b).pct-X(a,b).pct);
  const C=ST.coll||{}, D=C.diff, top=rows[0], tx=top&&X(top,b);
  DTICK=(["What can you build with what you own?",`${n(DATA.length)} commanders`,`${n(ST.cards)} cards`]
    .concat(ST.unused?[`${n(ST.unused.n_unused)} unused cards`]:[])
    .concat(D&&(D.added_n||D.removed_n||D.new_cmdrs_n)?[[D.added_n?`+${D.added_n} new cards`:"",D.removed_n?`−${D.removed_n} removed`:"",D.new_cmdrs_n?`${D.new_cmdrs_n} new commanders`:""].filter(Boolean).join(" · ")]:[])
    .concat(top?[`${top.name.split(" // ")[0]} tops ${LBL[b]} at ${tx.pct}%`]:[]));
  if(VIEW==="discover") $("tick").innerHTML=tickHTML(DTICK);
  $("count").textContent=`${rows.length} commanders with ${SRC==="avg"?"an EDHREC average deck for "+LBL[b]:LBL[b]+" data"}`;
  const sel={exhibition:1,core:2,upgraded:3,optimized:4,cedh:5}[b], RN=["","I","II","III","IV","V"];
  $("list").innerHTML=rows.map((d,k)=>{const x=X(d,b), rd=x.rd||[], ok=rd.filter(c=>c[3]).length, est=(x.bf||{est:2}).est;
    const above=!!sel&&sel<5&&est>Math.max(sel,2), combos=nc(d);
    // the caption comes from the deck's own numbers, nothing invented
    const cap=rd.length&&ok===rd.length?"(READY TO SLEEVE!)":above?"(TOO SPICY FOR THIS BRACKET!)":combos>=50?`(${combos} COMBOS IN YOUR BINDER!)`
      :x.pct>=75?"(MOSTLY IN YOUR BINDER!)":x.subs?"(NEEDS A FEW STAND-INS)":"";
    return `<details class="row p5-card${k<24?" p5-in":""}${above?" above":""}" data-i="${d.i}"${k<24?` style="animation-delay:${k*70}ms"`:""}><summary class="cmd">${k<3?`<span class="rank r${k+1}" aria-hidden="true">#${k+1}</span>`:""}
    <span class="cmh"><span class="nm">${esc(d.name)}</span><span class="pips" aria-label="Colour identity ${d.ci.join("")||"colourless"}">${pips(d.ci)}</span></span>
    <span class="ctype">${d.tags.slice(0,3).map(t=>esc(t[0])).join(" · ")||"no EDHREC themes yet"}</span>
    ${d.img?`<img class="art" src="${esc(d.img.replace("/normal/","/art_crop/"))}" alt="" loading="lazy">`:`<span class="art"></span>`}
    <span class="facts">Own ${x.pct}% of the deck. Ready ${ok}/${rd.length}. ${combos} combos in binder.${sel?` ${above?"Above":"Fits"} ${RN[sel]}.`:""}</span>
    ${cap?`<span class="cap${cap==="(READY TO SLEEVE!)"?" go":""}">${cap}</span>`:""}
    <span class="foot"><span class="serial">No. ${String(k+1).padStart(3,"0")}<br>${n(x.decks)} EDHREC decks</span><span class="score"><b>${x.pct}%</b>${bat(x.pct)}</span></span>
    </summary><div class="body"></div></details>`;}).join("");
}

/* ---------- imported decks ---------- */
const dAddHTML=()=>`<div class="ccard dadd"><h2>Add a deck</h2>
  <label class="drop dropd"><span class="dlab">Drop a decklist ★</span><span>or click to choose a .txt from Moxfield, Archidekt or ManaBox</span><input type="file" accept=".txt,.dek,.dck,text/plain" aria-label="Choose a decklist file"></label>
  <label class="dl">…or paste it<textarea class="dtext" rows="6" placeholder="Commander&#10;1 The Locust God&#10;&#10;Deck&#10;1 Sol Ring&#10;1 Counterspell"></textarea></label>
  <div class="drow"><label class="dl">Deck name<input class="dname" placeholder="deck name_" maxlength="60"></label><button type="button" class="dsave">Save deck</button></div>
  <span class="dmsg" role="status"></span></div>`;
// GET or POST /decks; on success the page gets the new rows and every saved deck, analysed
async function decksLive(body){const q={v:ST.built,nc:CARDS.length,ns:STRS.length,nk:COMBOS.length,no:OPTS.length};
  const opt=body?{method:"POST",headers:{"X-Deck-Wizard":"1","Content-Type":"application/json"},body:JSON.stringify(Object.assign(q,body))}
    :{headers:{"X-Deck-Wizard":"1"}};
  const res=await fetch("/decks"+(body?"":"?"+new URLSearchParams(q)),opt), j=await res.json().catch(()=>({error:"The app sent a reply the page can't read."}));
  if(!res.ok) return Object.assign(j,{code:res.status});
  addRows(CARDS,j.cards,q.nc); addRows(STRS,j.strs,q.ns); addRows(COMBOS,j.combos,q.nk); addRows(OPTS,j.opts||[],q.no);
  DECKS.splice(0,DECKS.length,...j.decks); impRender(j.saved); return j;}
async function dSave(){const box=document.querySelector("#imp .dadd"), msg=box.querySelector(".dmsg");
  const name=box.querySelector(".dname").value.trim(), text=box.querySelector(".dtext").value;
  if(!text.trim()){msg.textContent="Paste a decklist or drop a .txt first."; return;}
  if(!name){msg.textContent="Give the deck a name."; box.querySelector(".dname").focus(); return;}
  msg.textContent="Saving and analysing "+name+"…";
  let j=await decksLive({name,text}).catch(()=>({error:"Lost connection to Deck Wizard App (is its window still open?)"}));
  if(j.exists&&confirm(`You already have a deck called "${j.exists}". Replace it with this list?`)) j=await decksLive({name,text,replace:true});
  if(j.error){const m=document.querySelector("#imp .dadd .dmsg"); if(m) m.textContent=j.error;}}
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("#imp .dsave,[data-ddel]"); if(!t)return;
  if(t.classList.contains("dsave")){dSave(); return;}
  const nm=t.dataset.ddel; if(!confirm(`Delete the deck "${nm}"? (It goes to decks_in/.trash, so it can be restored.)`))return;
  decksLive({delete:nm}).then(j=>{if(j.error) alert(j.error);});});
document.addEventListener("change",e=>{const inp=e.target.closest&&e.target.closest("#imp .dadd input[type=file]"); if(inp&&inp.files[0]) dFile(inp.files[0]);});
async function dFile(f){const box=document.querySelector("#imp .dadd"); box.querySelector(".dtext").value=await f.text();
  const nm=box.querySelector(".dname"); if(!nm.value) nm.value=f.name.replace(/\.[^.]+$/,"");
  box.querySelector(".dmsg").textContent="Loaded "+f.name+": check the name, then Save deck.";}
["dragenter","dragover"].forEach(ev=>document.addEventListener(ev,e=>{const dz=e.target.closest&&e.target.closest("#imp .dropd"); if(dz){e.preventDefault(); dz.classList.add("over");}}));
document.addEventListener("dragleave",e=>{const dz=e.target.closest&&e.target.closest("#imp .dropd"); if(dz) dz.classList.remove("over");});
document.addEventListener("drop",e=>{const dz=e.target.closest&&e.target.closest("#imp .dropd"); if(!dz)return; e.preventDefault(); dz.classList.remove("over");
  if(e.dataTransfer.files[0]) dFile(e.dataTransfer.files[0]);});
// a card of a saved deck against your copies: missing, short (decks use more than you own), also in another deck
function cnote(k,i,o,use){if(!o) return "missing"; if(BASIC.has((CARDS[i]||[])[0])||!OWNQ.has(i)) return "";
  const u=use.get(i), own=OWNQ.get(i), other=u?u.d.filter(z=>z[0]!==k.title):[];
  if(u&&u.n>own) return `short ${u.n-own}: own ${own}, used ${u.n}`;
  return other.length?`also in ${other[0][0]}${other.length>1?" +"+(other.length-1):""}`:"";}
// deck analysis (F4): bracket with reasons, the checks (strengths / weaknesses), shape vs EDHREC's average deck,
// what it's built around, owned cards to add (with free copies), cards worth buying, cuts to consider
function anHTML(k,use){const A=k.an; if(!A) return "";
  const RN={ramp:"Ramp",draw:"Card draw",removal:"Removal",wipe:"Board wipes",mv:"Average mana value",src:"Colour sources (weakest)",win:"Win conditions"};
  const ok=A.rd.filter(r=>r[3]), bad=A.rd.filter(r=>!r[3]);
  const row=([c,v,t])=>`<li><b>${RN[c]||c}</b> ${esc(String(v))} <small>(${c==="mv"?"at most":"want"} ${t})</small></li>`;
  const est=A.bf.est, lab=est<=2?"B1–2":est>=4?"B4+":"B3";
  const shape=A.ref?(()=>{const d=A.mv.map((v,i)=>[i===7?"7+":String(i),v-Math.round(A.ref.mv[i]||0)]).filter(z=>Math.abs(z[1])>=2);
      const lr=Math.round(A.ref.ty.Land||0), ld=A.lands-lr;
      return `<li>${d.length?"Curve: "+d.map(([m,v])=>`${Math.abs(v)} ${v>0?"more":"fewer"} at ${m} mana`).join(", "):"Curve: close to the average deck at every cost"}</li>
        <li>Lands: ${A.lands} <small>(average deck ${lr}${Math.abs(ld)>=2?`, ${Math.abs(ld)} ${ld>0?"more":"fewer"}`:""})</small></li>`;})()
    :`<li>Lands: ${A.lands} <small>(no EDHREC average deck to compare)</small></li>`;
  const freeTxt=c=>{if(!OWNQ.has(c)) return ""; const u=use.get(c), own=OWNQ.get(c), f=own-(u?u.n:0);
    return f>0?`free ${f} of ${own}`:`all ${own} in ${u.d.map(z=>z[0]).join(", ")}`;};
  const list=(L,extra)=>L.length?`<div class="anl">${L.map(([c,w])=>`<div class="alt">${tile(c)}<small>${esc(W(w))}${extra?`<br><b>${esc(extra(c))}</b>`:""}</small></div>`).join("")}</div>`:`<p class="dim">None.</p>`;
  return `<section class="an"><h3 class="p5-slab"><span>Deck analysis</span></h3>
  <div class="tiles"><div class="tile num"><span class="t">Bracket Fit</span><b class="tbig">${lab}</b>${A.bf.why.length?`<ul>${A.bf.why.map(w=>`<li>${esc(w)}</li>`).join("")}</ul>`
      :`<span class="tt">No Game Changers, mass land denial, chained extra turns or two-card infinites found.</span>`}<small>${A.tut} tutor${A.tut===1?"":"s"} (B1–2 expect few)${A.combos_checked?"":" · combos not checked (app offline)"}</small></div>
    <div class="tile num inv"><span class="t">Build checks</span><b class="tbig">${ok.length}/${A.rd.length}</b><span class="tt">average mana value ${A.cmc}</span></div>
    <div class="tile num"><span class="t">You own</span><b class="tbig">${k.pct}%</b>${bat(k.pct,10,"big")}<span class="tt">${k.own} of ${k.total} non-basic cards</span></div></div>
  <div class="ancols"><div><h4>Strengths</h4><ul class="ang">${ok.map(row).join("")||"<li>None of the checks pass yet.</li>"}</ul></div>
    <div><h4>Weaknesses</h4><ul class="anb">${bad.map(row).join("")||'<li class="nm">None: every check passes.</li>'}</ul>
      <h4>Shape <small>vs EDHREC's average deck</small></h4><ul>${shape}</ul></div>
    <div><h4>Synergy</h4><ul>${A.core.length?`<li>Built around: ${A.core.map(([l,c])=>`${esc(l)} ${c}`).join(" · ")}</li>`:""}
      ${A.eng.length?`<li>Engines: ${A.eng.map(([l,c])=>`${esc(l)} ×${c}`).join(" · ")}</li>`:""}
      <li>Combos in the deck: ${k.combos?k.combos.n_own:"–"} · one card away: ${k.combos?k.combos.n_near:"–"}</li></ul></div></div>
  <h4>Add from your collection</h4>${list(A.add,freeTxt)}
  <h4>Worth buying <small>(most played for this commander, not in the deck · prices for information)</small></h4>${list(A.buy,c=>USD(c)?"$"+USD(c).toFixed(2):"")}${A.buy.length?`<p>${A.buy.map(([c])=>buyA(c,"🛒 "+esc(front(c)))).join(" · ")}</p>`:""}
  <h4>Cuts to consider <small>(lowest by the builder's own measures; combo pieces, Game Changers, hidden gems and short roles kept)</small></h4>${list(A.cut)}</section>`;}
function ibody(k){
  const use=usage(), items=k.cards.map(([i,o,q])=>({i,kind:o?"":"m",n:q,note:cnote(k,i,o,use)}));
  const nShort=items.filter(it=>it.note.startsWith("short")).length, nShared=items.filter(it=>it.note.startsWith("also")).length;
  const deckSet=new Set(k.cards.map(c=>c[0]));
  const text=["Commander",...k.cidx.map(i=>"1 "+front(i)),"","Deck",...k.cards.map(([i,o,q])=>q+" "+front(i))].join("\n")+"\n";
  return `<p>You own <strong>${k.own}</strong> of <strong>${k.total}</strong> non-basic cards (${k.pct}%)${nShared?` · <b>${nShared}</b> also in your other decks`:""}${nShort?` · <b class="miss">${nShort} short</b> (more copies needed than you own)`:""}.${SERVED?` <button type="button" class="ddel" data-ddel="${esc(k.title)}">🗑 Delete this deck</button>`:""}</p>
  ${anHTML(k,use)}
  ${deckSection("Deck",k.cidx,items,text,"")}
  <div class="vbar"><h3>Missing cards &amp; substitutes</h3><span class="dim">${k.gaps.length} missing</span></div>
  ${gapsHTML(k.gaps,deckSet)}
  ${comboHTML(k.combos,null,"Combos in this deck","One card away")}`;}
// your decklists: the last full run's, refreshed from the app (GET /decks), where you can add, replace and delete them
function impRender(open){
$("imp").innerHTML=`<div class="shead"><h2 class="p5-slab"><span>Your decks</span></h2><span class="dim">&gt; from the decks_in folder · .txt exports from Moxfield, Archidekt or ManaBox_</span></div>`+(SERVED?dAddHTML():"")
  +(DECKS.length?DECKS.map((k,j)=>`<details class="row irow p5-card${j<24?" p5-in":""}" data-k="${j}"><summary><span class="ino${j?"":" first"}" aria-hidden="true">${String(j+1).padStart(2,"0")}</span>
  <span class="inm"><b>${esc(k.title)}</b><span>${esc(k.cmdr.join(" + ")||"commander not found")}</span></span>
  <span class="iown">${bat(k.pct)}<span><b>${k.pct}%</b><small>${k.own} of ${k.total} owned</small></span></span>
  <span class="icb">${k.combos?k.combos.n_own:0} combos</span><span class="iopen" aria-hidden="true"></span></summary><div class="body"></div></details>`).join("")
  :`<p class="dim">No decklists yet. ${SERVED?"Add one above":"Put your decks (.txt exports from Moxfield, Archidekt or ManaBox) in the <b>decks_in</b> folder and rerun, or open <b>Deck Wizard App.bat</b> to add them here"}: you'll see how much of each you own, and which of your cards sit unused.</p>`);
  if(open!=null){const r=[...document.querySelectorAll("#imp details.irow")].find(x=>DECKS[+x.dataset.k].title===open); if(r){r.open=true; r.scrollIntoView({block:"nearest"});}}
  if(typeof UST!=="undefined") unusedRender();}
impRender();

/* ---------- card counts (F3): copies you own (ManaBox quantities) vs your saved decks; recounted whenever a deck is added
   or deleted. Unused = owned and in none of your saved decks (with none saved: in no suggested deck). Short = your decks use
   more copies than you own. Best homes come from the run (ST.unused.cards); "would use the most" ranks the suggested decks. ---------- */
const BASIC=new Set(["Plains","Island","Swamp","Mountain","Forest","Wastes"].flatMap(b=>[b,"Snow-Covered "+b]));
const OWNQ=new Map((ST.own||[]).map(o=>[o[0],o[3]||1]));        // card -> copies you own
function usage(){const U=new Map(), add=(i,q,t)=>{if(!CARDS[i]||BASIC.has(CARDS[i][0]))return; const u=U.get(i)||{n:0,d:[]};
    u.n+=q; const x=u.d.find(z=>z[0]===t); if(x)x[1]+=q; else u.d.push([t,q]); U.set(i,u);};
  DECKS.forEach(k=>{k.cidx.forEach(i=>add(i,1,k.title)); k.cards.forEach(([i,,q])=>add(i,q||1,k.title));}); return U;}
const sugg99=()=>{const S=new Set(); DATA.forEach(d=>(d.b.all||d.b[Object.keys(d.b)[0]]).deck.forEach(e=>S.add(e[0]))); return S;};
var UST={f:-1, all:false};   // var: impRender() checks it before this line runs     // unused grid: commander filter (index into the ranking), show all
function unusedRender(){
  const U=ST.unused, el=$("unused"); if(!U){el.innerHTML=""; return;}
  // a report built before F3 lists only ~150 cards and no copies: keep its own counts and say a rebuild is needed
  const full=(ST.own||[]).length>0&&U.cards.length>=ST.own.length&&ST.own[0].length>3;
  const use=full?usage():new Map(), mine=full&&DECKS.length>0, S=sugg99(), sn=i=>esc(DATA[i].name.split(" // ")[0]);
  const rows=U.cards.filter(([c])=>mine?!use.has(c):!S.has(c)), un=new Set(rows.map(r=>r[0]));
  const nH=rows.filter(r=>r[1].length).length, nS=rows.filter(r=>S.has(r[0])).length;
  const spare=[...use].filter(([c,u])=>OWNQ.has(c)&&OWNQ.get(c)>u.n).length;
  const short=[...use].filter(([c,u])=>OWNQ.has(c)&&u.n>OWNQ.get(c)).sort((a,z)=>(z[1].n-OWNQ.get(z[0]))-(a[1].n-OWNQ.get(a[0])));
  const missing=[...use].filter(([c])=>!OWNQ.has(c)).length;
  // which commanders' suggested decks would use the most of the unused cards (live)
  const rank=DATA.map(d=>{const ks=[...new Set((d.b.all||d.b[Object.keys(d.b)[0]]).deck.map(e=>e[0]).filter(c=>un.has(c)))]; return [d.i,ks];})
    .filter(r=>r[1].length).sort((a,z)=>z[1].length-a[1].length||a[0]-z[0]).slice(0,15);
  if(UST.f>=rank.length) UST.f=-1;
  const intro=!full?`<p class="ulead"><b class="big">${n(U.n_unused)}</b> of your cards aren't in any ${U.src==="decks_in"?"of your decks":"suggested deck"} (counted when this report was built). <span class="dim">Exact copy-by-copy counts against your saved decks need one full rebuild (<b>Update Deck Wizard.bat</b>).</span></p>`
    :mine?`<p class="ulead"><b class="big">${n(rows.length)}</b> of your cards aren't in any of your ${DECKS.length} saved deck${DECKS.length===1?"":"s"}. <b class="hy">${n(nS)}</b> of them make the suggested deck of one of your commanders; ${n(nH-nS)} more are a weaker fit somewhere; ${n(rows.length-nH)} have no real home.${spare?` ${n(spare)} more card${spare===1?" has":"s have"} spare copies.`:""}</p>`
    :`<p class="ulead"><b class="big">${n(rows.length)}</b> of your cards aren't in any suggested deck. <b class="hy">${n(nH)}</b> of them are a weaker fit somewhere. <span class="dim">${SERVED?"Save your real decks under Your decks":"Put your real decklists in the <b>decks_in</b> folder and rerun"} to count against your own decks, copy by copy.</span></p>`;
  const shortH=short.length?`<div class="ushort"><h3>Short: your decks need more copies than you own (${short.length})</h3><ul>${short.slice(0,40).map(([c,u])=>
      `<li><b>${esc(front(c))}</b> <span>own ${OWNQ.get(c)} · used ${u.n} in ${u.d.map(([t,q])=>esc(t)+(q>1?" ×"+q:"")).join(", ")}</span> <em>short ${u.n-OWNQ.get(c)}</em> ${buyA(c,"🛒 buy")}</li>`).join("")}</ul>${short.length>40?`<small>+${short.length-40} more</small>`:""}</div>`:"";
  const who=rank.map(([i,ks],r)=>`<button type="button" class="uh${r?"":" first"}" data-uf="${r}" aria-pressed="${UST.f===r}"><small>#${r+1}</small> ${sn(i)} <b>${ks.length}</b></button>`).join("");
  el.innerHTML=`<h2 class="p5-slab"><span>Cards sitting unused</span></h2>${intro}
    ${mine&&missing?`<p class="dim">Your saved decks also play ${n(missing)} card${missing===1?"":"s"} you don't own (see each deck's missing cards).</p>`:""}${shortH}
    ${who?`<div class="uhs"><span class="lbl">Would use the most</span>${who}</div>`:""}<div class="ugrid"></div><button type="button" class="umore"></button>`;
  const card=([c,H],j)=>{const h=H[0], q=OWNQ.get(c)||1;
    return `<div class="ucard p5-card${j<24?" p5-in":""}">${CARDS[c]&&CARDS[c][1]?`<img class="c" src="${IMG(c)}" alt="" loading="lazy">`:'<span class="c"></span>'}<div class="uinfo"><b>${esc(CARDS[c]?CARDS[c][0]:"?")}</b>
      <span class="uq">own ${q} · ${q} free</span>
      ${h?`<span class="bh">Best home</span><a href="#discover" data-cmdr="${esc(DATA[h[0]].name)}">${sn(h[0])} -&gt;</a><small>${[h[1]?h[1]+"% of decks":"",h[2]?"fits: "+esc(h[2]):"",h[3]?"in its suggested deck":""].filter(Boolean).join(" · ")}</small>`:"<small class='dim'>no real home among your commanders</small>"}
      ${H.length>1?`<small class="dim">also: ${H.slice(1).map(([i])=>`<a href="#discover" data-cmdr="${esc(DATA[i].name)}">${sn(i)}</a>`).join(", ")}</small>`:""}</div></div>`;};
  // a chip shows the unused cards that commander's suggested deck would use
  const L=UST.f<0?rows:(()=>{const [i,ks]=rank[UST.f], set=new Set(ks); return rows.filter(r=>set.has(r[0]));})(), V=UST.all?L:L.slice(0,24);
  el.querySelector(".ugrid").innerHTML=V.map(card).join("")||"<p class='dim'>None: every card you own is in one of your decks.</p>";
  const m=el.querySelector(".umore"); m.hidden=V.length>=L.length; m.textContent=`Show all ${L.length} ->`;
  // the counts elsewhere on the page follow
  CTICK=CTICK.filter(t=>!/waiting for a home|would use/.test(t)).concat([`${n(rows.length)} cards waiting for a home`])
    .concat(rank[0]?[`${DATA[rank[0][0]].name.split(" // ")[0]} would use ${rank[0][1].length} of them`]:[]);
  if(VIEW==="collection") $("tick").innerHTML=tickHTML(CTICK);
  const cs=document.querySelector("#cstats .u dd"); if(cs) cs.textContent=n(rows.length);
  const ds=document.querySelector("#stats li.hl strong"); if(ds) ds.textContent=n(rows.length);}
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("#unused [data-uf], #unused .umore"); if(!t)return;
  if(t.classList.contains("umore")) UST.all=true; else{const k=+t.dataset.uf; UST.f=UST.f===k?-1:k; UST.all=false;}
  unusedRender();});
unusedRender();

/* ---------- events ---------- */
// cards are visible by default; with an observer (and motion allowed) they wait (p5-wait) and slide in (p5-shown) as they
// reach the screen, then are unobserved. Only the panel opened or re-rendered last is observed.
const P5IO=("IntersectionObserver" in window)&&!matchMedia("(prefers-reduced-motion: reduce)").matches
  ?new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return; const c=e.target;
      c.classList.remove("p5-wait"); c.classList.add("p5-shown"); P5IO.unobserve(c);}),{rootMargin:"0px 0px -8% 0px"}):null;
let P5ON=[];   // cards of the panel being watched; switching panels shows any that hadn't slid in yet
function p5show(c){if(!c.classList.contains("p5-wait"))return; c.classList.remove("p5-wait"); c.classList.add("p5-shown"); P5IO.unobserve(c);}
// backup for engines whose observer misses a card (seen in headless Chromium after switching panels): a waiting card
// that is on screen is shown on the next scroll, at most once per frame, so a card can never stay invisible
// (checked on the scroll event itself, at most every 60 ms plus one trailing check, so it doesn't depend on frames)
let P5T=0, P5TT=null;
function p5scan(){P5T=Date.now();
  P5ON=P5ON.filter(c=>{if(!c.classList.contains("p5-wait"))return false; const b=c.getBoundingClientRect();
    if(b.top<innerHeight*0.92&&b.bottom>0){p5show(c);return false;} return true;});}
addEventListener("scroll",()=>{if(!P5ON.length)return; if(Date.now()-P5T>60)p5scan(); clearTimeout(P5TT); P5TT=setTimeout(p5scan,80);},{passive:true});
function p5watch(r){if(!P5IO)return;
  P5ON.forEach(c=>{P5IO.unobserve(c); c.classList.remove("p5-wait");}); P5ON=[];
  r.querySelectorAll(".body .grid .ct").forEach(c=>{c.classList.add("p5-wait"); P5IO.observe(c); P5ON.push(c);});}
// one commander panel at a time: opening one closes the others, renders it fresh (so its opening animation plays) and
// scrolls it under the sticky header; the filter sidebar stays
const RM=matchMedia("(prefers-reduced-motion: reduce)");
const SMOOTH=()=>RM.matches||window.__dwTest?"auto":"smooth";   // the browser check sets __dwTest: instant scrolls there
// the newest opened row wins: "toggle" events arrive late, so an older one's event mustn't close a newer panel. A mutation
// observer sees each "open" change at once, in order (before any toggle event).
let LASTOPEN=null;
new MutationObserver(ms=>ms.forEach(m=>{const r=m.target; if(r.open&&r.matches("details.row[data-i]")) LASTOPEN=r;}))
  .observe($("list"),{subtree:true,attributes:true,attributeFilter:["open"]});
document.addEventListener("toggle",e=>{const r=e.target; if(!r.matches||!r.matches("details.row")||!r.open)return;
  const cmd=r.matches("#list details.row");
  if(cmd){const keep=LASTOPEN&&LASTOPEN.open&&LASTOPEN.isConnected?LASTOPEN:r;
    document.querySelectorAll("#list details.row[open]").forEach(o=>{if(o!==keep) o.open=false;});
    if(r!==keep) return;}
  if(!r.dataset.f||cmd){r.querySelector(".body").innerHTML=r.dataset.k!=null?ibody(DECKS[+r.dataset.k]):body(DATA[+r.dataset.i],rowB(r),r); r.dataset.f=1;}
  p5watch(r); segAll(r);
  if(cmd&&r.dataset.noscroll!=="1") r.scrollIntoView({block:"start",behavior:SMOOTH()});},true);
const rowB=r=>(r.dataset.b&&DATA[+r.dataset.i].b[r.dataset.b])?r.dataset.b:bk();   // a bracket chosen in this row wins
function rerow(r){r.querySelector(".body").innerHTML=body(DATA[+r.dataset.i],rowB(r),r); if(r.open){p5watch(r); segAll(r);}}
document.addEventListener("click",e=>{const t=e.target;
  if(t.classList.contains("vt")){const bd=t.closest(".body");
    bd.querySelectorAll(".vt").forEach(x=>x.classList.toggle("on",x===t));
    bd.querySelectorAll(".view").forEach(v=>v.hidden=!v.classList.contains("v-"+t.dataset.v));}
  const bs=t.closest&&t.closest("[data-bsel]");
  if(bs){const r=bs.closest("details.row"); r.dataset.b=bs.dataset.bsel; r.dataset.slot=""; rerow(r); return;}
  const row=t.closest&&t.closest("details.row[data-i]");
  const ts=t.closest&&t.closest("[data-tsel]");
  if(ts){const r=ts.closest("details.row"); r.dataset.t=ts.dataset.tsel; r.dataset.slot=""; rerow(r); return;}
  const pq=t.closest&&t.closest("[data-pinadd],[data-unpin],[data-pinquick]");
  if(pq){const r=pq.closest("details.row[data-i]"); if(!r)return; const d=DATA[+r.dataset.i], p=pinsOf(d), next={in:[...p.in],out:[...p.out]};
    if(pq.dataset.unpin){const L=next[pq.dataset.side]; L.splice(L.indexOf(pq.dataset.unpin),1);}
    else{const side=pq.dataset.pinadd||pq.dataset.pinquick, nm=pq.dataset.pinadd?(r.querySelector(".pinq")||{}).value||"":pq.dataset.name;
      if(!nm.trim())return; const o=side==="in"?"out":"in"; next[o]=next[o].filter(x=>x!==nm.trim()); if(!next[side].includes(nm.trim()))next[side].push(nm.trim());}
    postPins(d,next,r); return;}
  const lsel=t.closest&&t.closest("[data-wsel]");
  if(lsel&&!lsel.disabled){const r=lsel.closest("details.row");
    r.dataset.w=lsel.dataset.wsel;
    const d=DATA[+r.dataset.i], b=rowB(r), k=liveKey(d,b,rowState(d,b,r),lvlOf(r));
    if(LIVE[k]&&LIVE[k].err) delete LIVE[k];        // a failed build is tried again
    r.dataset.slot=""; rerow(r); return;}
  const as=t.closest&&t.closest("[data-asel]");
  if(as&&!as.disabled){const r=as.closest("details.row"); r.dataset.a=as.dataset.asel==="1"?"1":"0"; r.dataset.slot=""; rerow(r); return;}
  const sr=t.closest&&t.closest("[data-src]");
  if(sr){SRC=sr.dataset.src; try{localStorage.setItem("dw:src",SRC);}catch(e){} render(); return;}
  if(row){const d=DATA[+row.dataset.i], b=rowB(row), tt=rowSel(d,b,row);
    const op=t.closest("[data-pick]");
    if(op&&!op.disabled){const ch=getCh(d,b,tt), f=op.dataset.slot, p=op.dataset.pick;
      if(p==="adv"||(op.classList.contains("gmiss")&&ch[f]===+p)) delete ch[f]; else ch[f]=+p; setCh(d,b,ch,tt); row.dataset.slot=""; rerow(row); return;}
    if(t.closest(".opt-close")){row.dataset.slot=""; rerow(row); return;}
    if(t.closest(".reset-ch")){setCh(d,b,{},tt); row.dataset.slot=""; rerow(row); return;}
    const cps=t.closest(".cps"); if(cps){navigator.clipboard.writeText(cps.dataset.text); cps.textContent="Copied"; return;}}
  const oc=t.closest&&t.closest("#vcoll [data-open], #vcoll a[data-cmdr]");
  if(oc){e.preventDefault(); openCmdr(oc.dataset.open||oc.dataset.cmdr); return;}
  if(t.classList.contains("cp")){navigator.clipboard.writeText(t.closest(".body").querySelector("textarea").value);t.textContent="Copied";}});
const pv=$("pv");
if(matchMedia("(hover:hover)").matches){
  // the big preview opens only after the mouse rests on a card for PV_DELAY ms (instant pop-ups got in the way)
  const PV_DELAY=1000; let pvT=null, pvWant="", pvE=null;
  const pvHide=()=>{clearTimeout(pvT); pvWant=""; pv.style.display="none";};
  const pvLater=src=>{if(src===pvWant)return; pvHide(); pvWant=src;
    pvT=setTimeout(()=>{pv.src=src; pv.style.display="block"; if(pvE)pvPlace(pvE);},PV_DELAY);};
  document.addEventListener("mouseover",e=>{const t=e.target, cw=t.closest&&t.closest(".cw");
    if(cw){const bb=cw.querySelector(".bub"), cr=cw.getBoundingClientRect(); if(bb){bb.classList.toggle("r",cr.left+480>innerWidth);
      bb.classList.toggle("dn",cr.top<330+(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hh"))||0));}}
    const fl=t.closest&&t.closest(".flip");
    if(fl){const im=fl.parentNode.querySelector("img.c"); if(!im.dataset.front)im.dataset.front=im.src; im.src=fl.dataset.back;
      pvLater(fl.dataset.back.replace("/normal/","/large/")); return;}
    const im=t.closest&&t.closest("img.c");
    if(!im){pvHide();return;} pvLater(im.src.replace("/normal/","/large/").replace("version=normal","version=large"));});
  document.addEventListener("mouseout",e=>{const fl=e.target.closest&&e.target.closest(".flip");
    if(fl&&!fl.contains(e.relatedTarget)){const im=fl.parentNode.querySelector("img.c"); if(im.dataset.front)im.src=im.dataset.front;}});
  document.addEventListener("mousemove",e=>{pvE=e; if(pv.style.display==="block")pvPlace(e);});
  function pvPlace(e){const w=300,h=418;
    const ct=e.target.closest&&!e.target.closest(".bub")&&e.target.closest(".ct"), r=ct&&ct.getBoundingClientRect();
    let x=r?r.right+12:e.clientX+24, y=r?r.top:e.clientY-h/2;          // beside the card, so the bubble below stays visible
    if(x+w>innerWidth-8)x=(r?r.left:e.clientX)-w-12;
    const wy=ct&&ct.closest(".d99")&&ct.closest(".d99").querySelector(".why");   // keep the "Why this card?" panel visible
    if(wy){const q=wy.getBoundingClientRect(); if(x<q.right&&x+w>q.left&&y<q.bottom&&y+h>q.top) x=(r?r.left:e.clientX)-w-12;}
    pv.style.left=Math.max(8,x)+"px"; pv.style.top=Math.max(8,Math.min(innerHeight-h-8,y))+"px";}}
document.addEventListener("click",e=>{if(e.target.closest&&e.target.closest(".flip"))e.preventDefault();},true);
["br","q","th","dk","cf","so"].forEach(id=>$(id).addEventListener("input",render));
/* ---------- livelier controls: the switch's red highlight slides to the chosen option, values pop on change ---------- */
function segAll(root){(root||document).querySelectorAll(".seg").forEach(g=>{const on=g.querySelector(".srcb.on"); if(!on) return;
  g.style.setProperty("--sx",on.offsetLeft+"px"); g.style.setProperty("--sw",on.offsetWidth+"px"); g.classList.add("ready");});}
const pop=el=>{if(!el||RM.matches) return; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");};
$("br").addEventListener("input",()=>pop($("bv")));
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest(".seg .srcb"); if(t) requestAnimationFrame(()=>{segAll(); pop(t.closest(".seg"));});});
document.querySelector(".brt").innerHTML=BR.map(b=>`<span>${b==="all"?"ALL":["","I","II","III","IV","V"][{exhibition:1,core:2,upgraded:3,optimized:4,cedh:5}[b]]}</span>`).join("");
/* ---------- sticky header: slims once you scroll; everything else that sticks sits under it (--hh) ---------- */
const ZH=document.querySelector(".zh");
const hh=()=>document.documentElement.style.setProperty("--hh",ZH.offsetHeight+"px");
addEventListener("scroll",()=>{const sm=scrollY>40; if(ZH.classList.contains("small")!==sm){ZH.classList.toggle("small",sm); hh();}},{passive:true});
if("ResizeObserver" in window) new ResizeObserver(hh).observe(ZH); addEventListener("resize",()=>{hh(); segAll();}); hh();
/* ---------- resets: Discover / the logo go back to the top of a clean list; Reset filters clears every filter ---------- */
function resetFilters(){$("q").value=""; COLS.clear(); MINP=0;
  document.querySelectorAll("[data-col]").forEach(x=>x.setAttribute("aria-pressed","false"));
  document.querySelectorAll(".mins [data-minp]").forEach(x=>x.setAttribute("aria-pressed",x.dataset.minp==="0"?"true":"false"));
  $("th").value=""; $("dk").value="0"; $("cf").value=""; $("so").value="pct";}
function resetDiscover(){document.querySelectorAll("#list details.row[open]").forEach(o=>o.open=false);
  $("q").value=""; render(); scrollTo({top:0,behavior:SMOOTH()});}
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest('.vnav [data-view="discover"], a.brand, .rstf, .ftog'); if(!t) return;
  if(t.classList.contains("rstf")){resetFilters(); render(); pop(t); return;}
  if(t.classList.contains("ftog")){const d=document.querySelector(".disc"), o=!d.classList.contains("fopen"); d.classList.toggle("fopen",o); t.setAttribute("aria-expanded",o?"true":"false"); if(o) requestAnimationFrame(()=>segAll(d)); return;}
  e.preventDefault(); if(location.hash!=="#discover") history.pushState(null,"","#discover"); showView("discover"); resetDiscover();});
/* ---------- autocomplete for every search box ([data-ac]): up to 8 matches anywhere in the name, ignoring case and
   accents, names starting with the text first, matched letters marked; arrows move, Enter / click / tap picks, Esc or a
   click outside closes. role=combobox + listbox. Sources: AC[kind](input) -> {items(q), pick(item)}; no server calls. ---------- */
const fold=t=>String(t).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
function acMark(name,q){const P=[...name], F=P.map(fold), st=[]; let pos=0; F.forEach(f=>{st.push(pos); pos+=f.length;});
  const i=F.join("").indexOf(q), e=i+q.length; if(i<0||!q) return esc(name);
  let h="", on=false; P.forEach((c,k)=>{const a=st[k], z=a+F[k].length, inn=F[k].length?z>i&&a<e:on;
    if(inn&&!on){h+="<mark>";on=true;} if(!inn&&on){h+="</mark>";on=false;} h+=esc(c);}); return h+(on?"</mark>":"");}
// rank names: [item, where the text starts]; starts-with first, then earlier matches, then A-Z; at most 8
const acRank=(list,q,name)=>list.map(x=>[x,fold(name(x)).indexOf(q)]).filter(z=>z[1]>=0)
  .sort((a,z)=>(a[1]>0)-(z[1]>0)||a[1]-z[1]||name(a[0]).localeCompare(name(z[0]))).slice(0,8).map(z=>z[0]);
const AC={
  // commanders: picking one opens its panel (the live list filtering stays as it was)
  cmdr:()=>({items:q=>acRank(DATA,q,d=>d.name).map(d=>{const x=X(d,bk());
      return {name:d.name,img:d.img?d.img.replace("/normal/","/art_crop/"):"",art:1,detail:`<span class="pips">${pips(d.ci)}</span>${x?x.pct+"% owned":"no "+LBL[bk()]+" data"}`,d};}),
    pick:it=>openCmdr(it.d.name)}),
  // pins: only cards you own in this commander's colour identity (the only ones a pin can add); picking fills the box
  pin:inp=>{const r=inp.closest("details.row[data-i]"), d=r&&DATA[+r.dataset.i], cm=d?d.ci.reduce((m,c)=>m|(1<<"WUBRG".indexOf(c)),0):31;
    const L=(ST.own||[]).filter(o=>(o[1]&~cm)===0);
    return {items:q=>acRank(L,q,o=>CARDS[o[0]][0]).map(o=>({name:CARDS[o[0]][0],img:IMG(o[0]),detail:esc(W(o[2]))})),
      pick:it=>{inp.value=it.name; inp.focus();}};}};
const ACL=$("acl"); let ACI=null, ACS=null, ACH=[], ACA=-1;
function acClose(){if(!ACI)return; ACL.hidden=true; ACL.innerHTML=""; ACI.setAttribute("aria-expanded","false"); ACI.removeAttribute("aria-activedescendant"); ACI=null; ACA=-1;}
function acPlace(){if(!ACI)return; const b=ACI.getBoundingClientRect();
  ACL.style.left=Math.max(8,Math.min(b.left,innerWidth-ACL.offsetWidth-8))+"px"; ACL.style.minWidth=Math.max(b.width,260)+"px";
  const below=innerHeight-b.bottom; ACL.style.top=(below<200&&b.top>below?Math.max(8,b.top-ACL.offsetHeight-4):b.bottom+4)+"px";}
function acSet(j){ACA=j; [...ACL.children].forEach((li,k)=>li.setAttribute("aria-selected",k===j?"true":"false"));
  if(j>=0){ACI.setAttribute("aria-activedescendant","acl-"+j); ACL.children[j].scrollIntoView({block:"nearest"});} else ACI.removeAttribute("aria-activedescendant");}
function acOpen(inp){const q=fold(inp.value.trim()); if(!q){acClose();return;}
  if(ACI!==inp){acClose(); ACI=inp; ACS=AC[inp.dataset.ac](inp);}
  ACH=ACS.items(q); if(!ACH.length){ACL.hidden=true; ACL.innerHTML=""; inp.setAttribute("aria-expanded","false"); ACA=-1; return;}
  ACL.innerHTML=ACH.map((it,j)=>`<li id="acl-${j}" role="option" aria-selected="false" data-j="${j}">${it.img?`<img class="${it.art?"art":""}" src="${esc(it.img)}" alt="" loading="lazy">`:""}<span class="an"><b>${acMark(it.name,q)}</b><small>${it.detail}</small></span></li>`).join("");
  ACL.hidden=false; inp.setAttribute("aria-expanded","true"); acSet(-1); acPlace();}
function acPick(j){const it=ACH[j], s=ACS; if(!it)return; acClose(); s.pick(it);}
document.addEventListener("input",e=>{if(e.target.dataset&&e.target.dataset.ac) acOpen(e.target);});
document.addEventListener("keydown",e=>{const t=e.target; if(!t.dataset||!t.dataset.ac||t!==ACI||ACL.hidden)return;
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault(); const n=ACH.length; acSet(e.key==="ArrowDown"?(ACA+1)%n:(ACA<=0?n-1:ACA-1));}
  else if(e.key==="Enter"&&ACA>=0){e.preventDefault(); e.stopImmediatePropagation(); acPick(ACA);}
  else if(e.key==="Escape"){e.preventDefault(); acClose();}},true);
ACL.addEventListener("mousedown",e=>e.preventDefault());      // keep the focus in the box while clicking a row
ACL.addEventListener("click",e=>{const li=e.target.closest("li[data-j]"); if(li) acPick(+li.dataset.j);});
document.addEventListener("click",e=>{if(ACI&&e.target!==ACI&&!ACL.contains(e.target)) acClose();});
document.addEventListener("focusout",e=>{if(e.target===ACI) setTimeout(()=>{if(ACI&&document.activeElement!==ACI) acClose();},150);});
addEventListener("resize",acPlace); addEventListener("scroll",acPlace,true);
if(SERVED) decksLive().catch(()=>{});
showView(location.hash==="#collection"?"collection":location.hash==="#discover"?"discover":(()=>{try{return localStorage.getItem("dw:view");}catch(e){return "";}})());
render();
</script></body></html>"""

def js_data(obj):
    return json.dumps(obj, separators=(",", ":")).replace("</", "<\\/")

def restyle_report(out_html):
    """Re-renders an existing report.html with the current page template, reusing the data already in it (decks, cards,
    strings, combos, options): seconds instead of a full rebuild, for changes to the page only. Returns an error or ''."""
    if not os.path.exists(out_html): return f"No report at {out_html}: build one first."
    html = open(out_html, encoding="utf-8").read()
    i = html.find("const DATA=")
    if i < 0: return "That report.html has no data block (too old?): rebuild it once."
    dec, vals, pos = json.JSONDecoder(), {}, i + len("const ")
    for name in ("DATA", "BR", "ST", "DECKS", "CARDS", "COMBOS", "STRS", "OPTS"):
        j = html.find(name + "=", pos)
        if j < 0 or j - pos > 8:
            return f"That report.html has no {name} (built before this feature): rebuild it once."
        vals[name], pos = dec.raw_decode(html, j + len(name) + 1)
    if "own" not in vals["ST"]:
        return "That report.html predates the pin suggestions: rebuild it once."
    with open(out_html + ".tmp", "w", encoding="utf-8") as f:
        f.write(render_report(vals["DATA"], vals["ST"], vals["BR"][1:], vals["DECKS"], vals["CARDS"], vals["COMBOS"],
                              vals["STRS"], vals["OPTS"]))
    os.replace(out_html + ".tmp", out_html)
    return ""

def render_report(results, stats, brackets, decks, cards, combos=(), strs=(), opts=()):
    return (HTML.replace("__DATA__", js_data(results))
                .replace("__OPTS__", js_data(list(opts)))
                .replace("__STRS__", js_data(list(strs)))
                .replace("__COMBOS__", js_data(list(combos)))
                .replace("__BR__", json.dumps(["all"] + brackets))
                .replace("__STATS__", json.dumps(stats))
                .replace("__DECKS__", js_data(decks))
                .replace("__CARDS__", js_data(cards)))

# ------------------------------------------------------------ app mode (--serve)
WAIT_PAGE = """<!doctype html><meta charset="utf-8"><title>Deck Wizard</title>
<body style="background:#111827;color:#e5e7eb;font:15px system-ui;padding:40px">
<h1 style="font-family:Georgia">Deck Wizard</h1><p>Building your report for the first time&hellip;</p>
<pre id="l" style="color:#9ca3af;white-space:pre-wrap"></pre><script>
(function p(){fetch("/status").then(r=>r.json()).then(s=>{document.getElementById("l").textContent=s.line||"";
 if(s.running)setTimeout(p,1000);else if(s.ok)location.reload();else document.getElementById("l").textContent+="\\nFailed - see the Deck Wizard window.";});})();
</script>"""

class Rebuild:
    """Runs the normal pipeline as a child process (fresh state each time) and keeps its output."""
    def __init__(self, args):
        self.args, self.proc, self.lines, self.ok, self.started = args, None, [], None, 0
        self.lock = threading.Lock()

    def running(self):
        return self.proc is not None and self.ok is None

    def start(self, csv_path):
        with self.lock:
            if self.running(): return False
            cmd = [sys.executable, "-u", os.path.abspath(__file__), "--csv", csv_path, "--no-open"] + self.args
            env = dict(os.environ, PYTHONIOENCODING="utf-8")   # card names aren't all cp1252
            self.lines, self.ok, self.started = [], None, time.time()
            self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                         text=True, encoding="utf-8", errors="replace", env=env)
            threading.Thread(target=self._pump, daemon=True).start()
            return True

    def _pump(self):
        for line in self.proc.stdout:
            line = line.rstrip()
            print("  " + line)
            if line: self.lines = (self.lines + [line])[-200:]
        self.ok = self.proc.wait() == 0
        print("Rebuild " + ("finished." if self.ok else "FAILED.") + " Waiting for uploads (Ctrl+C to quit).")

    def status(self):
        return {"running": self.running(), "ok": self.ok, "started": self.started,
                "line": self.lines[-1] if self.lines else ""}

PINS_FILE = "pins.json"   # your pins per commander: {"<commander>": {"in": [card names], "out": [card names]}}

def pins_clean(p):
    p = p or {}
    return {"in": sorted(set(p.get("in") or [])), "out": sorted(set(p.get("out") or []))}

def pins_for(pins, cmdr_name):
    """(keys always included, keys never used) for analyze()."""
    p = pins_clean(pins.get(cmdr_name))
    return {norm(x) for x in p["in"]}, {norm(x) for x in p["out"]}

DECK_COMBOS = "spellbook_decks.json"   # combos of your saved decklists, by card list (deck_combo_key)
TABLES_FILE = "report_tables.json"   # the report's card/string/combo tables and collection file, for LiveDecks

class LiveDecks:
    """App mode: builds one deck on request at another EDHREC weight, with the same
    builder and bracket rules as the report. Loads the collection and caches on first use (a few seconds)
    and again after a rebuild. Its card, string and combo tables continue the report's, so the page only
    appends the new rows and keeps using its own indices."""
    def __init__(self, a):
        self.a, self.lock, self.ctx = a, threading.Lock(), None

    def _load(self, tab_path):
        a = self.a
        tab = load_json(tab_path)
        if not tab.get("csv") or not os.path.exists(tab["csv"]):
            raise LookupError("The report predates this feature: rebuild it once (Update Deck Wizard.bat).")
        global OFFLINE
        OFFLINE = a.offline
        if a.no_combos: CSB_DOWN[0] = True
        cache_dir = os.path.join(a.out, "cache")
        _, owned, _ = load_owned(tab["csv"], cache_dir)
        names_path = os.path.join(cache_dir, "scryfall_names.json")
        name_meta = resolve_names(set(), names_path)
        prepare_types(list(owned.values()) + [x for x in name_meta.values() if x])
        fetch_keyword_catalog(os.path.join(cache_dir, "keywords.json"))
        tpl = os.path.join(cache_dir, "spellbook_templates.json")
        fetch_templates(set(), tpl)
        T, CT = CardTable(), ComboTable()
        T.rows, T.strs, CT.rows = tab["cards"], tab["strs"], tab["combos"]
        for i, r in enumerate(T.rows): T.idx.setdefault(norm(r[0]), i)
        T.sidx = {t: i for i, t in enumerate(T.strs)}
        T.opts = tab.get("opts", [])
        T.oidx = {json.dumps(o, separators=(",", ":")): i for i, o in enumerate(T.opts)}
        CT.idx = {r["id"]: i for i, r in enumerate(CT.rows)}
        self.ctx = {"mt": os.path.getmtime(tab_path), "built": tab["built"], "owned": owned, "T": T, "CT": CT,
                    "cands": {norm(m["name"]): m for m in commander_candidates(owned)},
                    "cache": load_edhrec_cache(cache_dir), "edh_path": os.path.join(cache_dir, EDH_CACHE),
                    "csb": load_json(os.path.join(cache_dir, "spellbook.json")),
                    "csb_path": os.path.join(cache_dir, "spellbook.json"), "tpl": tpl, "names_path": names_path,
                    "name_meta": name_meta,
                    "combo_cards": {} if a.no_combos else fetch_combo_cards(os.path.join(cache_dir, "spellbook_cards.json")),
                    "per": {}}

    def decks(self, q, body=None):
        """GET / POST /decks (app): your decklists in the decks_in folder, each analysed once per file version.
        body {"name", "text", "replace"} saves one (a new name, or replace an existing one when asked);
        body {"delete": name} moves it to decks_in/.trash. q: v (page build time), nc/ns/nk/no (rows the page has).
        Replies with every deck and only the table rows the page lacks. Returns (HTTP code, reply)."""
        with self.lock:
            tab_path = os.path.join(self.a.out, TABLES_FILE)
            if not os.path.exists(tab_path): return 404, {"error": "No report yet."}
            try:
                if not self.ctx or self.ctx["mt"] != os.path.getmtime(tab_path): self._load(tab_path)
            except LookupError as e:
                return 404, {"error": str(e)}
            c = self.ctx
            have = [int(q.get(k) or 0) for k in ("nc", "ns", "nk", "no")]
            if abs(float(q.get("v") or 0) - c["built"]) > 0.01 or have[0] > len(c["T"].rows) or have[1] > len(c["T"].strs):
                return 409, {"error": "The report was rebuilt: reload the page."}
            folder, saved = self.a.decks_in, None
            os.makedirs(folder, exist_ok=True)
            clean = lambda nm: re.sub(r'[\\/:*?"<>|\x00-\x1f]', "", str(nm or "")).strip().strip(".")[:60]
            if body and "delete" in body:
                nm = clean(body["delete"]); fp = os.path.join(folder, nm + ".txt")
                if not nm or not os.path.isfile(fp): return 404, {"error": f"No saved deck called {nm or '?'}."}
                os.makedirs(os.path.join(folder, ".trash"), exist_ok=True)
                os.replace(fp, os.path.join(folder, ".trash", time.strftime(f"{nm} %Y-%m-%d %H%M%S.txt")))
            elif body:
                nm, text = clean(body.get("name")), str(body.get("text") or "")
                if not nm: return 400, {"error": "Give the deck a name."}
                if len(text) > 300_000: return 400, {"error": "That list is too long for a Commander deck."}
                cm, mn = parse_decklist(None, text)
                n_cards = sum(q_ for q_, _ in cm + mn)
                if not n_cards: return 400, {"error": "No cards found. Paste one card per line, like \"1 Sol Ring\"."}
                fp = os.path.join(folder, nm + ".txt")
                if os.path.exists(fp) and not body.get("replace"):
                    return 409, {"error": f"You already have a deck called {nm}.", "exists": nm}
                tmp = fp + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f: f.write(text.replace("\r\n", "\n"))
                os.replace(tmp, fp)
                saved = nm
            files = sorted(glob.glob(os.path.join(folder, "*.txt")))
            # card data for names you don't own (Scryfall, cached; none offline)
            extra = set()
            for fp in files:
                c_, m_ = parse_decklist(fp)
                extra |= {n_ for _, n_ in c_ + m_ if norm(n_) not in c["owned"] and norm(n_) not in c["name_meta"]}
            if extra: c["name_meta"] = resolve_names(extra, c["names_path"])
            dc_path = os.path.join(self.a.out, "cache", DECK_COMBOS)
            if "dcombos" not in c: c["dcombos"] = load_json(dc_path)
            memo, n_dc, out = c.setdefault("imp", {}), len(c["dcombos"]), []
            for fp in files:
                st_ = os.stat(fp); k = (fp, st_.st_mtime, st_.st_size)
                if k not in memo:
                    memo[k] = analyze_imported(fp, c["owned"], c["name_meta"], not self.a.no_combos, c["cache"], c["T"],
                                               c["dcombos"])
                out.append(memo[k])
            if len(c["dcombos"]) != n_dc: save_json(dc_path, c["dcombos"])
            out.sort(key=lambda d: -d["pct"])
            T = c["T"]
            return 200, {"decks": out, "saved": saved, "cards": T.rows[have[0]:], "strs": T.strs[have[1]:],
                         "combos": c["CT"].rows[have[2]:], "opts": T.opts[have[3]:]}

    def deck(self, q):
        """q = query: c commander, b bracket, t theme slug, a "1" average deck, w weight 1-4, s (ignored: price is information only),
        v the page's build time, nc/ns/nk how many cards/strings/combos the page has.
        Returns (HTTP code, reply)."""
        with self.lock:
            tab_path = os.path.join(self.a.out, TABLES_FILE)
            if not os.path.exists(tab_path): return 404, {"error": "No report yet."}
            try:
                if not self.ctx or self.ctx["mt"] != os.path.getmtime(tab_path): self._load(tab_path)
                c = self.ctx
                have = [int(q.get(k) or 0) for k in ("nc", "ns", "nk", "no")]
                if abs(float(q.get("v") or 0) - c["built"]) > 0.01 or have[0] > len(c["T"].rows) \
                        or have[1] > len(c["T"].strs) or have[2] > len(c["CT"].rows):
                    return 409, {"error": "The report was rebuilt: reload the page."}
                x = self._build(q.get("c", ""), q.get("b", "all"), q.get("t", ""), q.get("a") == "1",
                                int(q.get("w") or 3), int(q.get("s") or 2))
            except LookupError as e:
                return 404, {"error": str(e)}
            except ValueError as e:
                return 400, {"error": str(e) or "Bad request."}
            T, CT = c["T"], c["CT"]
            return 200, {"x": x, "cards": T.rows[have[0]:], "strs": T.strs[have[1]:], "combos": CT.rows[have[2]:],
                         "opts": T.opts[have[3]:]}

    def pins(self, body=None):
        """GET (body None): all pins. POST: {"c": commander, "in": [names], "out": [names]} replaces that
        commander's pins after checking each card is yours, legal and in its colours. Returns (code, reply)."""
        path = os.path.join(self.a.out, PINS_FILE)
        with self.lock:
            allp = load_json(path)
            if body is None: return 200, {"pins": {k: pins_clean(v) for k, v in allp.items()}}
            tab_path = os.path.join(self.a.out, TABLES_FILE)
            try:
                if not self.ctx or self.ctx["mt"] != os.path.getmtime(tab_path): self._load(tab_path)
            except (LookupError, OSError) as e:
                return 404, {"error": str(e)}
            owned, cands = self.ctx["owned"], self.ctx["cands"]
            m = cands.get(norm(str(body.get("c", ""))))
            if not m: return 404, {"error": "Not one of your commanders."}
            ci = set(m["ci"])
            ok = lambda c: c["commander_legal"] and set(c["ci"]) <= ci and c["layout"] not in ("token", "emblem")
            front_of = {norm(c["name"].split(" // ")[0]): c for c in owned.values()}
            new, errs = {"in": [], "out": []}, []
            for side in ("in", "out"):
                for nm in body.get(side) or []:
                    q = norm(str(nm).strip())
                    c = owned.get(q) or front_of.get(q)
                    if not c:
                        near = sorted(c2["name"] for c2 in owned.values() if q and q in norm(c2["name"]) and ok(c2))[:4]
                        errs.append(f"{nm}: not in your collection" + (f" (did you mean {', '.join(near)}?)" if near else ""))
                    elif not ok(c) or norm(c["name"]) == norm(m["name"]):
                        errs.append(f"{c['name']}: not legal in this deck (colours or legality)")
                    else:
                        new[side].append(c["name"])
            both = set(new["in"]) & set(new["out"])
            if both: errs.append(f"{', '.join(sorted(both))}: can't be both always included and never used")
            if errs: return 400, {"error": "; ".join(errs)}
            new = pins_clean(new)
            if new["in"] or new["out"]: allp[m["name"]] = new
            else: allp.pop(m["name"], None)
            save_json(path, allp)
            print(f"Pins for {m['name']}: +{len(new['in'])} always, -{len(new['out'])} never")
            return 200, {"pins": new}

    def _build(self, name, b, t, avg, w, s=2):
        s = 2                 # price is information only: no budget / expensive pages
        c, a = self.ctx, self.a
        owned, cache = c["owned"], c["cache"]
        m = c["cands"].get(norm(name))
        if not m: raise LookupError(f"{name} isn't one of your commanders.")
        if w not in EDH_WEIGHT or s not in SPEND_SUFFIX or (b != "all" and b not in VALID_BRACKETS):
            raise ValueError("Bad weight, spending level or bracket.")
        slug, suf = slugify(m["name"]), SPEND_SUFFIX[s]
        level = {1: "budget ", 2: "", 3: "expensive "}[s]
        main_pg = fetch_page(slug, cache, max_days=EDH_MAX_DAYS)
        if not main_pg or not main_pg["cards"]: raise LookupError("EDHREC has no page for this commander.")
        tags = main_pg.get("tags") or []
        tname = next((nm for nm, ts, _ in tags if ts == t), None) if t else None
        if t and not tname: raise LookupError("EDHREC doesn't list that archetype for this commander.")
        miss = cache.setdefault("_theme_miss", {})
        seen, miss0 = {}, dict(miss)            # to save the 90 MB cache only when something new came in
        def page(part, is_avg=False):
            """The page at this spending level; $$ pages are fetched exactly as the full run does."""
            path = "/".join(x for x in (slug, part, suf) if x)
            key = ("avg:" if is_avg else "") + path
            seen[key] = cache.get(key)
            if s == 2 and not is_avg and (not part or part in VALID_BRACKETS):
                p = fetch_page(path, cache, max_days=None if part else EDH_MAX_DAYS)
            else:
                p = fetch_theme_page(path, cache, avg=is_avg, max_days=None if s == 2 else EDH_MAX_DAYS)
            return p if p and p["cards"] else None
        base = page("")
        if not base: raise LookupError(f"EDHREC has no {level}page for this commander.")
        pg = base if b == "all" else page(b)
        if not pg: raise LookupError(f"EDHREC has no {level}page for this bracket.")
        tp = page(t) if t else None
        if t and not tp: raise LookupError(f"EDHREC has no {level}{tname} page for this commander.")
        ap = page(t or ("" if b == "all" else b), True) if avg else None
        if avg and not ap: raise LookupError(f"EDHREC has no {level}average deck for this.")
        if any(cache.get(k) is not v for k, v in seen.items()) or miss != miss0: save_json(c["edh_path"], cache)
        want = {v[0] for p in (base, pg, tp) if p for k, v in p["cards"].items() if v[1] >= 0.10 and k not in owned}
        want |= {nm for k, (nm, _) in (ap or {"cards": {}})["cards"].items() if k not in owned}
        name_meta = c["name_meta"]
        if any(norm(n) not in name_meta for n in want - BASIC_NAMES):       # Scryfall only for new names
            name_meta = c["name_meta"] = resolve_names(want - BASIC_NAMES, c["names_path"])
            prepare_types([x for x in name_meta.values() if x])
        if slug not in c["per"]:            # per commander: pool, owned combos, legal names, profile
            pool_info = build_pool(set(m["ci"]), owned, norm(m["name"]))
            combos = None if a.no_combos else combos_for_commander(m, owned, c["csb"], c["combo_cards"])
            if combos:
                fetch_templates({r for x in combos["own"] + combos["near"] for r in x.get("req") or []}
                                - set(TEMPLATES), c["tpl"])
                combos = annotate_combos(combos, owned, set(m["ci"]))
                save_json(c["csb_path"], c["csb"])
            legal = {k for k, _, _, _ in pool_info[0]} | {norm(m["name"])}
            c["per"][slug] = (pool_info, (combos or {}).get("own", []), legal, commander_profile(m, tags))
        pool_info, own, legal, prof = c["per"][slug]
        ew, T = EDH_WEIGHT[w], c["T"]
        pn = pins_for(load_json(os.path.join(a.out, PINS_FILE)), m["name"])
        if avg:
            apage, show = avg_as_page(ap, tp, tp, "all") if t else avg_as_page(ap, pg, base, b)
            x = analyze(m, apage, owned, name_meta, pool_info, b, T, apage, own, focus=tname, profile=prof,
                        show=show, ew=ew, pins=pn)
            x["ref"], x["avg"] = avg_shape(ap, owned, name_meta), 1
        else:
            src, bs = (tp, tp) if t else (pg, base)
            x = analyze(m, src, owned, name_meta, pool_info, b, T, bs, own, focus=tname, profile=prof, ew=ew, pins=pn)
        if t: x["theme"], x["tdecks"] = tname, x["decks"]
        # for /why: the page the deck was built from (the theme page for an archetype; the commander page otherwise,
        # also for average decks, whose own page rates every card 1.0) and the cards it ended up with
        self.last = {"m": m, "page": tp if t else pg, "base": tp if t else base, "prof": prof, "own": own, "b": b,
                     "names": {norm(T.rows[e[0]][0]) for e in x["deck"]} | {norm(m["name"])}, "name_meta": name_meta}
        finish_deck(x, b, own, legal, c["CT"])
        x.pop("arena", None)
        return x

    def why(self, q):
        """GET /why: the real parts behind one card in one built deck (no score): EDHREC play rate and synergy on the
        page the deck came from, what it shares with the commander (cmdr_fit / commander_link), its links in this deck
        (DeckSynergy), its roles and its combos. Built decks are kept per (commander, bracket, theme, avg, level),
        so hovering across a deck costs one build. Returns (HTTP code, reply)."""
        with self.lock:
            tab_path = os.path.join(self.a.out, TABLES_FILE)
            if not os.path.exists(tab_path): return 404, {"error": "No report yet."}
            try:
                if not self.ctx or self.ctx["mt"] != os.path.getmtime(tab_path): self._load(tab_path)
                key = tuple(q.get(k, "") for k in ("c", "b", "t", "a", "w", "s"))
                cache = self.ctx.setdefault("why", {})
                if key not in cache:
                    self._build(q.get("c", ""), q.get("b", "all"), q.get("t", ""), q.get("a") == "1",
                                int(q.get("w") or 3), int(q.get("s") or 2))
                    L = self.last
                    deck = [self.ctx["owned"][k] for k in L["names"] if k in self.ctx["owned"] and k != norm(L["m"]["name"])]
                    L["syn"] = DeckSynergy(L["m"], [m for m in deck if card_kind(m) != "land"], L["prof"][0])
                    if len(cache) >= 24: cache.pop(next(iter(cache)))
                    cache[key] = L
            except LookupError as e:
                return 404, {"error": str(e)}
            except ValueError as e:
                return 400, {"error": str(e) or "Bad request."}
            L, owned = cache[key], self.ctx["owned"]
            k = norm(q.get("card", ""))
            m = owned.get(k) or L["name_meta"].get(k)
            if not m: return 404, {"error": "Unknown card."}
            page, base, cmdr = L["page"], L["base"], L["m"]
            rate_of, play_of, _ = card_values(page, base, owned, L["name_meta"])
            v = page["cards"].get(k) or base["cards"].get(k)
            syn = v[2] if v and len(v) > 2 and v[2] is not None else None
            nonland = card_kind(m) != "land"
            inside = k in L["names"]
            links = sorted(L["syn"].links(m, inside), reverse=True)[:6] if nonland else []
            return 200, {"card": m["name"], "decks": page["decks"], "listed": k in page["cards"],
                         "rate": round(100 * rate_of(k), 1), "blend": round(100 * play_of(k), 1),
                         "syn": None if syn is None else round(100 * syn, 1),
                         "fit": cmdr_fit(cmdr, m, L["prof"], L["b"])[1] if k in owned and nonland else "",
                         "cmdr": commander_link(cmdr, m) if nonland else [], "roles": sorted(roles_of(m) - {"land"}),
                         "links": [[n, lab] for n, lab in links], "in_deck": inside,
                         "combos": [[c["cards"], bool(combo_done(c, L["names"]))] for c in L["own"]
                                    if any(norm(x) == k for x in c["cards"])][:6]}

def serve(a, csv_path, child_args):
    """Local-only web app: serves report.html, accepts collection uploads and builds decks at other
    EDHREC weights / spending levels on request (LiveDecks)."""
    out_html = os.path.join(a.out, "report.html")
    rb, live = Rebuild(child_args), LiveDecks(a)

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args): pass

        def reply(self, code, body, ctype="application/json"):
            if isinstance(body, dict): body = json.dumps(body)
            data = body if isinstance(body, bytes) else body.encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            path = self.path.split("?")[0]
            if path in ("/", "/report.html"):
                if os.path.exists(out_html):
                    with open(out_html, "rb") as f: self.reply(200, f.read(), "text/html; charset=utf-8")
                else:
                    self.reply(200, WAIT_PAGE, "text/html; charset=utf-8")
            elif path == "/status":
                self.reply(200, rb.status())
            elif path == "/decks":
                if self.headers.get("X-Deck-Wizard") != "1": return self.reply(403, {"error": "forbidden"})
                if rb.running(): return self.reply(409, {"error": "A rebuild is running. Try again when it's done."})
                q = {k: v[0] for k, v in urllib.parse.parse_qs(self.path.partition("?")[2]).items()}
                try:
                    code, out = live.decks(q)
                except Exception as e:
                    import traceback; traceback.print_exc()
                    code, out = 500, {"error": f"Reading your decks failed: {e}"}
                self.reply(code, json.dumps(out))
            elif path == "/pins":
                if self.headers.get("X-Deck-Wizard") != "1": return self.reply(403, {"error": "forbidden"})
                code, out = live.pins()
                self.reply(code, out)
            elif path == "/why":
                if self.headers.get("X-Deck-Wizard") != "1": return self.reply(403, {"error": "forbidden"})
                if rb.running(): return self.reply(409, {"error": "A rebuild is running. Try again when it's done."})
                q = {k: v[0] for k, v in urllib.parse.parse_qs(self.path.partition("?")[2]).items()}
                try:
                    code, out = live.why(q)
                except Exception as e:
                    import traceback; traceback.print_exc()
                    code, out = 500, {"error": f"Why failed: {e}"}
                self.reply(code, json.dumps(out))
            elif path == "/deck":
                # same custom-header rule as uploads: other websites can't make this PC build decks
                if self.headers.get("X-Deck-Wizard") != "1": return self.reply(403, {"error": "forbidden"})
                if rb.running(): return self.reply(409, {"error": "A rebuild is running. Try again when it's done."})
                q = {k: v[0] for k, v in urllib.parse.parse_qs(self.path.partition("?")[2]).items()}
                try:
                    code, out = live.deck(q)
                except Exception as e:      # keep the app up; show the reason in the page and the window
                    import traceback; traceback.print_exc()
                    code, out = 500, {"error": f"Building failed: {e}"}
                self.reply(code, json.dumps(out))
            else:
                self.reply(404, {"error": "not found"})

        def do_POST(self):
            size = int(self.headers.get("Content-Length") or 0)
            if size > 50_000_000:
                self.close_connection = True
                return self.reply(413, {"error": "The file is larger than 50 MB."})
            data = self.rfile.read(size)   # read before replying, or Windows resets the connection
            # The custom header can't be sent cross-site without a CORS preflight we never answer,
            # so other websites open in the browser can't trigger uploads.
            if self.path == "/pins" and self.headers.get("X-Deck-Wizard") == "1":
                try:
                    body = json.loads(data.decode("utf-8"))
                    if not isinstance(body, dict): raise ValueError
                except ValueError:
                    return self.reply(400, {"error": "Bad pins request."})
                if rb.running(): return self.reply(409, {"error": "A rebuild is running. Try again when it's done."})
                code, out = live.pins(body)
                return self.reply(code, out)
            if self.path == "/decks" and self.headers.get("X-Deck-Wizard") == "1":
                try:
                    body = json.loads(data.decode("utf-8"))
                    if not isinstance(body, dict): raise ValueError
                except ValueError:
                    return self.reply(400, {"error": "Bad deck request."})
                if rb.running(): return self.reply(409, {"error": "A rebuild is running. Try again when it's done."})
                try:
                    code, out = live.decks({k: str(body.get(k, "")) for k in ("v", "nc", "ns", "nk", "no")}, body)
                except Exception as e:
                    import traceback; traceback.print_exc()
                    code, out = 500, {"error": f"Saving the deck failed: {e}"}
                return self.reply(code, json.dumps(out))
            if self.path != "/upload" or self.headers.get("X-Deck-Wizard") != "1":
                return self.reply(403, {"error": "forbidden"})
            if not data: return self.reply(400, {"error": "The file is empty."})
            try:
                text = data.decode("utf-8-sig")
            except UnicodeDecodeError:
                return self.reply(400, {"error": "Not a text CSV file (expected a ManaBox export)."})
            err = manabox_error(text.split("\n", 1)[0].strip("\r"))
            if err: return self.reply(400, {"error": err})
            if rb.running(): return self.reply(409, {"error": "A rebuild is already running. Try again when it's done."})
            os.makedirs(COLLECTION_DIR, exist_ok=True)
            path = os.path.join(COLLECTION_DIR, time.strftime("ManaBox %Y-%m-%d %H%M%S.csv"))
            with open(path, "wb") as f: f.write(data)
            print(f"\nNew collection uploaded -> {path}")
            if not rb.start(path): return self.reply(409, {"error": "A rebuild is already running."})
            self.reply(202, {"ok": True, "saved": path})

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    url = f"http://127.0.0.1:{a.port}/"
    print(f"Deck Wizard App running at {url}  (only reachable from this PC; Ctrl+C to quit)")
    if not os.path.exists(out_html):   # the browser shows WAIT_PAGE until this first build is done
        print(f"No report yet: building one from {csv_path}")
        rb.start(csv_path)
    if not a.no_open: webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping.")
        if rb.running():
            rb.proc.terminate()   # caches are written atomically, so stopping mid-run is safe
    srv.server_close()

# -------------------------------------------------------------------- main
def load_owned(csv_path, cache_dir, refresh=False):
    """Collection -> (printings, owned cards by normalized name, copies owned by normalized name, all printings
    together), with role tags and card flags loaded."""
    coll = load_collection(csv_path)
    print(f"Collection file: {csv_path}")
    print(f"Collection: {len(coll)} printings, {sum(q for _, q in coll.values())} cards")
    meta = enrich_scryfall(list(coll), os.path.join(cache_dir, "scryfall.json"), refresh)
    owned, qty = {}, {}
    for sid in coll:
        m = meta.get(sid)
        if m and m["layout"] not in ("token", "emblem") and m["name"] not in BASIC_NAMES:
            owned[norm(m["name"])] = m
            qty[norm(m["name"])] = qty.get(norm(m["name"]), 0) + coll[sid][1]
    ROLE_TAGS.update(fetch_role_tags(os.path.join(cache_dir, "role_tags.json"), refresh))
    fetch_card_flags(owned, os.path.join(cache_dir, "spellbook_flags.json"), refresh)
    return coll, owned, qty

def commander_candidates(owned):
    """Owned legendary creatures and cards that say they can be your commander, by name."""
    def ok(m):
        front = m["type_line"].split(" // ")[0]
        return m["commander_legal"] and "Legendary" in front and \
            ("Creature" in front or "can be your commander" in m["oracle"].lower())
    return sorted((m for m in owned.values() if ok(m)), key=lambda m: m["name"])

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", default="", help="ManaBox export; default: newest CSV in the collection folder")
    ap.add_argument("--out", default=".")
    ap.add_argument("--brackets", default="core,upgraded,optimized,cedh")
    ap.add_argument("--only", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--no-open", action="store_true")
    ap.add_argument("--no-combos", action="store_true")
    ap.add_argument("--no-themes", action="store_true", help="skip EDHREC theme pages and theme decks")
    ap.add_argument("--no-avg", action="store_true", help="skip EDHREC average-deck pages and decks")
    ap.add_argument("--decks-in", default="decks_in")
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--serve", action="store_true", help="local app with an upload button")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--restyle", action="store_true",
                    help="only re-render report.html with the current page code (seconds; keeps its decks and data)")
    ap.add_argument("--store-url", default=STORE_URL,
                    help="where 'buy' links search for a card; {card} = the card name (default: shop.com)")
    a = ap.parse_args()
    if a.offline and a.refresh: ap.error("--offline and --refresh can't be combined")
    if a.serve and a.refresh: ap.error("--serve and --refresh can't be combined")
    if a.restyle:
        out_html = os.path.join(a.out, "report.html")
        err = restyle_report(out_html)
        if err: sys.exit(err)
        print(f"Restyled {out_html} with the current page code ({os.path.getsize(out_html) / 1e6:.1f} MB); reload it in the browser.")
        return
    csv_path = a.csv or find_collection()
    if not csv_path:
        ap.error(f"no ManaBox CSV found: put your export in the '{COLLECTION_DIR}' folder or pass --csv")
    if a.serve:   # rebuilds after an upload use the same options
        child = ["--out", a.out, "--brackets", a.brackets, "--decks-in", a.decks_in, "--store-url", a.store_url]
        child += ["--only", a.only] if a.only else []
        child += ["--limit", str(a.limit)] if a.limit else []
        child += [f for f, on in (("--no-combos", a.no_combos), ("--offline", a.offline), ("--no-themes", a.no_themes),
                                         ("--no-avg", a.no_avg)) if on]
        return serve(a, csv_path, child)
    global OFFLINE
    OFFLINE = a.offline
    brackets = [b for b in VALID_BRACKETS if b in {x.strip().lower() for x in a.brackets.split(",")}]

    cache_dir = os.path.join(a.out, "cache")
    if a.no_combos: CSB_DOWN[0] = True          # --no-combos: no Spellbook requests, cached flags only
    coll, owned, qty = load_owned(csv_path, cache_dir, a.refresh)
    cands = commander_candidates(owned)
    diff = collection_changes(csv_path, owned, [m["name"] for m in cands], cache_dir)
    if diff:
        print(f"Since the previous collection: +{len(diff['added'])} cards, -{len(diff['removed'])} cards, "
              f"{len(diff['new_cmdrs'])} new commanders")
    if a.only:
        wanted = {norm(x) for x in a.only.split(";") if x.strip()}
        cands = [m for m in cands if norm(m["name"]) in wanted]
    if a.limit: cands = cands[:a.limit]
    print(f"Commander candidates: {len(cands)} | brackets: {', '.join(brackets)}")

    # pass 1: EDHREC pages
    edh_path = os.path.join(cache_dir, EDH_CACHE)
    cache = load_edhrec_cache(cache_dir, a.refresh)
    pins = load_json(os.path.join(a.out, PINS_FILE))
    if pins: print(f"Pins: {sum(len(v.get('in', [])) + len(v.get('out', [])) for v in pins.values())} cards for {len(pins)} commanders ({PINS_FILE})")
    pages, themes, avgs, skipped = {}, {}, {}, 0
    for i, m in enumerate(cands, 1):
        slug = slugify(m["name"])
        base = fetch_page(slug, cache, a.refresh, max_days=EDH_MAX_DAYS)
        if not base or not base["cards"]:
            skipped += 1; print(f"[{i}/{len(cands)}] {m['name']}: no EDHREC page"); continue
        pg = {"all": base}
        for b in brackets:
            p = fetch_page(f"{slug}/{b}", cache, a.refresh)
            if p and p["cards"]: pg[b] = p
        pages[m["name"]] = pg
        if not a.no_themes:     # archetypes: EDHREC's top THEME_TOP theme tags (most decks first), as is
            th = {}
            for name, tslug, _ in base.get("tags", [])[:THEME_TOP]:
                tp = fetch_theme_page(f"{slug}/{tslug}", cache, a.refresh)
                if not (tp and tp["cards"]): continue        # no theme page: stays an EDHREC link
                tap = None if a.no_avg else fetch_theme_page(f"{slug}/{tslug}", cache, a.refresh, avg=True)
                th[tslug] = (name, tp, tap if tap and tap["cards"] else None, page_match(tp, owned, norm(m["name"])))
            themes[m["name"]] = th
        if not a.no_avg:        # EDHREC's average deck, for each bracket the commander page has
            av = {}
            for b in pg:
                ap_ = fetch_theme_page(slug if b == "all" else f"{slug}/{b}", cache, a.refresh, avg=True)
                if ap_ and ap_["cards"]: av[b] = ap_
            avgs[m["name"]] = av
        if i % 25 == 0:
            save_json(edh_path, cache); print(f"[{i}/{len(cands)}] EDHREC pages loaded")
    save_json(edh_path, cache)

    # Scryfall data for popular cards you don't own (needed to find substitutes)
    want = set()
    for pg in list(pages.values()) + [{t: v[1] for t, v in th.items()} for th in themes.values()]:
        for p in pg.values():
            for k, (name, rate, *_) in p["cards"].items():
                if rate >= 0.10 and k not in owned and name not in BASIC_NAMES: want.add(name)
    for av in list(avgs.values()) + [{t: v[2] for t, v in th.items() if v[2]} for th in themes.values()]:
        for ap_ in av.values():
            want.update(name for k, (name, _) in ap_["cards"].items() if k not in owned and name not in BASIC_NAMES)
    name_meta = resolve_names(want, os.path.join(cache_dir, "scryfall_names.json"), a.refresh)
    prepare_types(list(owned.values()) + [x for x in name_meta.values() if x])

    # pass 2: build decks, substitutes, combos
    csb_path = os.path.join(cache_dir, "spellbook.json")
    csb_cache = {} if a.refresh else load_json(csb_path)
    combo_cards = {} if a.no_combos else fetch_combo_cards(os.path.join(cache_dir, "spellbook_cards.json"), a.refresh)
    fetch_keyword_catalog(os.path.join(cache_dir, "keywords.json"), a.refresh)
    tpl_path = os.path.join(cache_dir, "spellbook_templates.json")
    fetch_templates(set(), tpl_path, a.refresh)        # load the cache
    T, CT, results, home_src = CardTable(), ComboTable(), [], []
    done = [m for m in cands if m["name"] in pages]
    for i, m in enumerate(done, 1):
        pg = pages[m["name"]]
        pool_info = build_pool(set(m["ci"]), owned, norm(m["name"]))
        combos = None if a.no_combos else combos_for_commander(m, owned, csb_cache, combo_cards)
        if combos:
            fetch_templates({r for c in combos["own"] + combos["near"] for r in c.get("req") or []}
                            - set(TEMPLATES), tpl_path)
            combos = annotate_combos(combos, owned, set(m["ci"]))
        prof = commander_profile(m, pg["all"].get("tags") or [])
        pn = pins_for(pins, m["name"])
        optc = {b: {} for b in pg}           # swap options per bracket: built by the overview deck, reused below
        entry = {"name": m["name"], "ci": sorted(m["ci"]), "img": m.get("img", ""),
                 "slug": slugify(m["name"]), "tags": pg["all"]["tags"], "cidx": T.add(m["name"], m),
                 "pins": pins_clean(pins.get(m["name"])),
                 "b": {b: analyze(m, p, owned, name_meta, pool_info, b, T, pg["all"],
                                  (combos or {}).get("own"), profile=prof, pins=pn, optc=optc[b])
                       for b, p in pg.items()}}
        ranked = rank_combos(combos, entry["b"]["all"]["_names"])
        own = (combos or {}).get("own", [])
        legal_names = {k for k, _, _, _ in pool_info[0]} | {norm(m["name"])}
        if combos:
            entry["combos"] = {"n_own": combos["n_own"], "n_near": combos["n_near"]}
            entry["co"] = [CT.add(c) for c in ranked["own"]]
            entry["cn"] = [CT.add(c) for c in ranked["near"]]
            entry["dz"] = [CT.add(c) for c in danger_zone(own, legal_names)]
        else:
            entry["combos"] = None
        home_src.append((len(results), m, pg["all"], set(entry["b"]["all"]["_names"])))
        combo_info = lambda x, b: finish_deck(x, b, own, legal_names, CT)
        # theme decks: the commander's EDHREC theme page (all brackets) built with each bracket's rules,
        # leaning into cards that match the theme; stored as differences from the normal deck
        entry["th"] = {}
        # each archetype gets two decks per bracket, like the overview: from the theme's commander page
        # and from the theme's EDHREC average deck (both all-bracket pages, built with each bracket's rules)
        for tslug, (tname, tp, tap, match) in (themes.get(m["name"]) or {}).items():
            per, aper = {}, {}
            if tap:
                apage, show = avg_as_page(tap, tp, tp, "all")
                tshape = avg_shape(tap, owned, name_meta)
            for b in entry["b"]:
                tx = analyze(m, tp, owned, name_meta, pool_info, b, T, tp, own, focus=tname,
                             want_gaps=False, profile=prof, pins=pn, optc=optc[b])
                per[b] = combo_info(tx, b)
                if tap:
                    ax = analyze(m, apage, owned, name_meta, pool_info, b, T, apage, own, focus=tname,
                                 profile=prof, show=show, pins=pn, optc=optc[b])
                    aper[b] = combo_info(ax, b); ax["ref"] = tshape
            entry["th"][tslug] = {"name": tname, "decks": tp["decks"], "own": match, "b": per, "av": aper,
                                  "adecks": apage["decks"] if tap else 0}
        # average decks: EDHREC's average 99 for each bracket, rebuilt with your cards (cards you own
        # stay, missing ones get stand-ins, same bracket rules); also stored as differences
        entry["av"] = {}
        for b, ap_ in (avgs.get(m["name"]) or {}).items():
            if b not in entry["b"]: continue
            apage, show = avg_as_page(ap_, pg[b], pg["all"], b)
            ax = analyze(m, apage, owned, name_meta, pool_info, b, T, apage, own, profile=prof, show=show, pins=pn,
                         optc=optc[b])
            entry["av"][b] = combo_info(ax, b)
            ax["ref"] = avg_shape(ap_, owned, name_meta)
        for b, x in entry["b"].items():
            for t in entry["th"].values():         # now that the normal deck is final, keep only differences
                if b in t["b"]: t["b"][b] = deck_diff(x, t["b"][b])
                if b in t["av"]:
                    ax = t["av"][b]
                    t["av"][b] = dict(deck_diff(x, ax), gaps=ax["gaps"], ref=ax["ref"])
            if b in entry["av"]:
                ax = entry["av"][b]
                entry["av"][b] = dict(deck_diff(x, ax), gaps=ax["gaps"], ref=ax["ref"])
            combo_info(x, b)
        results.append(entry)
        if i % 10 == 0: save_json(csb_path, csb_cache)
        al = entry["b"]["all"]
        print(f"[{i}/{len(done)}] {m['name']}: {al['pct']}% | {al['subs']} subs | "
              + (f"{entry['combos']['n_own']} combos" if entry["combos"] else "combos n/a"))
    save_json(csb_path, csb_cache)

    # imported decklists
    decks, in_decks = [], set()
    files = sorted(glob.glob(os.path.join(a.decks_in, "*.txt")))
    if files:
        print(f"\nImported decks: {len(files)} in {a.decks_in}")
        extra = set()
        for fp in files:
            c_, m_ = parse_decklist(fp)
            extra |= {nm for _, nm in c_ + m_ if norm(nm) not in owned}
            in_decks |= {norm(nm) for _, nm in c_ + m_}
        name_meta = resolve_names(extra, os.path.join(cache_dir, "scryfall_names.json"))
        dc_path = os.path.join(cache_dir, DECK_COMBOS)
        dcombos = load_json(dc_path); n_dc = len(dcombos)
        for fp in files:
            d = analyze_imported(fp, owned, name_meta, not a.no_combos, cache, T, dcombos)
            decks.append(d)
            print(f"  {d['title']}: {d['pct']}% owned, {len(d['gaps'])} missing"
                  + (f", {d['combos']['n_own']} combos" if d["combos"] else ""))
        decks.sort(key=lambda d: -d["pct"])
        if len(dcombos) != n_dc: save_json(dc_path, dcombos)
    else:
        os.makedirs(a.decks_in, exist_ok=True)

    # unused cards: not in any of your decks (decks_in), else not in any suggested deck
    used = in_decks if files else set().union(*(t[3] for t in home_src)) if home_src else set()
    unused = find_homes(home_src, owned, name_meta, used, T)
    unused.update({"src": "decks_in" if files else "suggested", "n_decks": len(files)})
    print(f"Unused cards: {unused['n_unused']} not in any {'of your decks' if files else 'suggested deck'};"
          f" {unused['n_sugg']} make a suggested deck, {unused['n_home'] - unused['n_sugg']} weaker fits")

    os.makedirs(os.path.join(a.out, "decks"), exist_ok=True)
    for r in results:
        for b, x in r["b"].items():
            with open(os.path.join(a.out, "decks", f"{r['slug']}_{b}.txt"), "w", encoding="utf-8") as f:
                f.write(x.pop("arena"))
    stats = {"cards": sum(q for _, q in coll.values()), "unique": len(owned), "cands": len(cands),
             "built": time.time(), "unused": unused,
             "store": {"url": a.store_url, "name": urllib.parse.urlparse(a.store_url).netloc.replace("www.", "")},
             "coll": {"csv": os.path.basename(csv_path),
                      "at": time.strftime("saved %Y-%m-%d %H:%M", time.localtime(os.path.getmtime(csv_path))),
                      "diff": {k2: v for k, l in (diff or {}).items()
                               for k2, v in ((k, l[:40]), (k + "_n", len(l)))} if diff else None}}
    # for the pin box's suggestions: every card you own that a pin could add (commander-legal, no basics)
    # every card you own that a pin could add (commander-legal, no basics): [card, colour bits, type line, copies]
    stats["own"] = [[T.add(m["name"], m), sum(1 << j for j, c in enumerate("WUBRG") if c in m["ci"]), T.s(m["type_line"]),
                     qty.get(k, 1)] for k, m in sorted(owned.items()) if m["commander_legal"] and m["name"] not in BASIC_NAMES]
    out_html = os.path.join(a.out, "report.html")
    with open(out_html + ".tmp", "w", encoding="utf-8") as f:   # swap in whole: the app never serves half a file
        f.write(render_report(results, stats, brackets, decks, T.rows, CT.rows, T.strs, T.opts))
    os.replace(out_html + ".tmp", out_html)
    save_json(os.path.join(a.out, TABLES_FILE), {"built": stats["built"], "csv": os.path.abspath(csv_path),
                                                  "cards": T.rows, "strs": T.strs, "combos": CT.rows, "opts": T.opts})
    no_tags = sum(1 for r in results if not r["tags"])
    print(f"\nDone. {len(results)} analyzed, {skipped} had no EDHREC page, {no_tags} without theme tags."
          f"\nReport: {os.path.getsize(out_html) / 1e6:.1f} MB -> {out_html}")
    if not a.no_open:
        webbrowser.open("file://" + os.path.abspath(out_html))

if __name__ == "__main__":
    main()
