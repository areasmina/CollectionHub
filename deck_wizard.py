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
import argparse, csv, glob, hashlib, json, os, re, sys, time, unicodedata
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
SF_VERSION = 2          # bump when compact_card() gains fields; older cache entries are refetched

# ----------------------------------------------------------------- helpers
def norm(name):
    return name.split(" // ")[0].strip().lower()

def slugify(name):
    s = unicodedata.normalize("NFKD", norm(name))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.replace("'", "").replace("\u2019", "")
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
    faces = c.get("card_faces") or []
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
ROLE_NAMES = ["ramp", "draw", "removal", "wipe", "tutor", "counter", "recursion", "sac"]
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
    return r

def roles_of(m):
    k = norm(m["name"])
    if k in _ROLE_MEMO: return _ROLE_MEMO[k]
    if "Land" in m["type_line"].split(" // ")[0]:
        r = {"land"}
    else:
        rx, r = None, set()
        for role in ROLE_NAMES:
            if role in ROLE_TAGS:
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

class CardTable:
    """One shared card list for the report; decks reference cards by index."""
    PREFIX = "https://cards.scryfall.io/normal/"
    def __init__(self): self.rows, self.idx, self.strs, self.sidx = [], {}, [], {}
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
                        int(meta.get("cmc") or 0)]
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

def fetch_page(path, cache, refresh=False, avg=False):
    """A commander page (`avg` = the average-deck page, cached as "avg:<path>")."""
    key = "avg:" + path if avg else path
    old = cache.get(key)
    if not refresh and old and old.get("v") == EDH_VERSION: return old
    if OFFLINE: return old              # older data beats none; nothing new is recorded
    data = http_json((EDH_AVG if avg else EDH) + path + ".json")
    time.sleep(0.8)
    if not data: return old             # missing page (EDHREC answers 403) or failure: never cached
    cache[key] = parse_avg(data) if avg else parse_edhrec(data)
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
    "drain":      (r"\b(each opponent|target opponent|each player) loses? \w+ life", ("lifedrain",), ()),
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
FIT_STAPLE = ((1000, 0.03), (3000, 0.015))   # Scryfall's overall EDHREC rank
FIT_GC = 0.05           # Game Changers, only in brackets without a cap
FIT_MV = 0.02           # minus this per mana value above 4
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
THEME_TOP = 3           # themes per commander that get their own decks (EDHREC theme pages)
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

def fetch_theme_page(path, cache, refresh=False, avg=False):
    """fetch_page for a theme or average-deck page; pages EDHREC doesn't have are remembered for
    THEME_MISS_DAYS (a commander has 3 themes and 5 average decks, so re-asking every run would cost minutes)."""
    miss, mk = cache.setdefault("_theme_miss", {}), ("avg:" if avg else "") + path
    if not refresh and time.time() - miss.get(mk, 0) < THEME_MISS_DAYS * 86400: return None
    p = fetch_page(path, cache, refresh, avg)
    if p is None and not OFFLINE: miss[mk] = time.time()
    elif p is not None: miss.pop(mk, None)
    return p

DIFF_KEYS = ("decks", "pct", "own_n", "tmpl_n", "n_miss", "rec", "subs", "fill", "pick", "cpc", "gc", "gcn",
             "cmc", "pw", "rd", "core", "mld", "xt", "tut", "basics", "cin", "c2", "bf", "cl")

def deck_diff(base_x, tx):
    """A theme deck stored as changes to the normal deck of the same bracket (keeps the page small):
    numbers of the theme deck + cards added + [card, kind] removed."""
    key = lambda e: (e[0], e[1])
    bset, tset = {key(e) for e in base_x["deck"]}, {key(e) for e in tx["deck"]}
    out = {k: tx[k] for k in DIFF_KEYS if k in tx}
    out["add"] = [e for e in tx["deck"] if key(e) not in bset]
    out["rem"] = [e[0] for e in base_x["deck"] if key(e) not in tset]   # a card is in a deck once
    return out

_FIT_MEMO = {"who": None}

def fit_cached(cmdr, m, profile, bracket):
    """card_fit, remembered per commander (it only depends on the bracket through Game Changers)."""
    if _FIT_MEMO["who"] != (cmdr["name"], id(profile)):
        _FIT_MEMO.clear(); _FIT_MEMO["who"] = (cmdr["name"], id(profile))
    key = (norm(m["name"]), bracket in ("optimized", "cedh"))
    if key not in _FIT_MEMO: _FIT_MEMO[key] = card_fit(m, profile, bracket)
    return _FIT_MEMO[key]

def built_around(profile, cards):
    """How many of the deck's non-land cards hit each thing the commander cares about:
    [[label, count]], biggest first (e.g. [["connive", 9], ["discard", 14]])."""
    tribe, mechs, _, kws = profile
    out = [[t.title(), sum(1 for m in cards if t in type_words(m) or is_changeling(m))] for t in sorted(tribe)]
    out += [[k, sum(1 for m in cards if k in card_mechanics(m))] for k in sorted(mechs)]
    out += [[k, sum(1 for m in cards if has_keyword(m, k))] for k in sorted(kws)]
    return sorted((x for x in out if x[1]), key=lambda x: -x[1])[:6]

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
    rank = m.get("edhrec_rank")
    if rank:
        f += next((v for lim, v in FIT_STAPLE if rank <= lim), 0)
    if m["gc"] and bracket in ("optimized", "cedh"): f += FIT_GC     # B4/B5: no Game Changer cap
    f -= FIT_MV * max(0, m["cmc"] - 4)
    return max(0.0, f), " · ".join(why)

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
READY_ODD = 16          # stand-ins + role fill: at most this many of the 64 non-land slots
MLD_RX = re.compile(r"destroy all [^.]*\blands\b|exile all [^.]*\blands\b|sacrifices? (all|each) [^.]*\blands?\b"
                    r"|lands don't untap|lands your opponents control don't untap")
XTURN_RX = re.compile(r"takes? an extra turn")
BRACKET_NUM = {"exhibition": 1, "core": 2, "upgraded": 3, "optimized": 4, "cedh": 5}

def readiness(roles, avg_cmc, odd, sources):
    """[[check, value, target, passed]]; sources = {colour: lands making it} (empty for colourless)."""
    out = [[r, roles.get(r, 0), t, roles.get(r, 0) >= t] for r, t in ROLE_TARGETS.items()]
    out.append(["mv", avg_cmc, READY_MV, avg_cmc <= READY_MV])
    if len(sources) >= 2:
        need = max(8, 20 // len(sources))
        c, v = min(sources.items(), key=lambda kv: (kv[1], kv[0]))
        out.append(["src", f"{c} {v}", need, v >= need])
    out.append(["odd", odd, READY_ODD, odd <= READY_ODD])
    return out

# Official Commander Brackets rules on combos (Wizards, Feb 2025; unchanged by the Feb 2026 update):
#   B1-B2: no intentional two-card infinite combos.  B3: none in the early game.  B4-B5: anything.
# Three-card combos aren't restricted. "Early game" has no number in the rules: a two-card infinite
# counts as early when its pieces' mana values (Scryfall) plus the mana it needs (Spellbook) total
# EARLY_MV or less, i.e. it can come together before turn ~6.
EARLY_MV = 6
XTURN_CAP = 1          # B1-B3: extra turns "in low quantities, not chained": one extra-turn card can't chain
TAG_NAME = {"E": "Exhibition", "C": "Core", "O": "Oddball", "P": "Powerful", "S": "Spicy", "R": "Ruthless", "B": "Banned"}

def two_card_infinite(c):
    """The commander counts as one of the two; an extra condition ("an instant that untaps a
    creature") counts as a card too."""
    return bool(c.get("inf")) and len(c["cards"]) + len(c.get("req") or []) <= 2

def combo_ok(c, bnum):
    """May this combo be complete in a deck for bracket `bnum` (None = all decks: no rule)?
    Only called for combos known to be complete (conditions resolved via combo_done)."""
    if bnum is None or bnum >= 4 or not two_card_infinite(c): return True
    return bnum == 3 and c.get("tmv", 0) > EARLY_MV

def combo_need(c):
    """Lowest bracket that allows this combo, by the official rules."""
    if not two_card_infinite(c): return 2
    return 3 if c.get("tmv", 0) > EARLY_MV else 4

def combo_text(c):
    sat = c.get("sat") or {}
    s = " + ".join(c["cards"] + [f"{r} ({', '.join(sat[r][:2])}{'…' if len(sat[r]) > 2 else ''})"
                                 if sat.get(r) else f"({r})" for r in c.get("req") or []])
    if two_card_infinite(c):
        s += f": two-card infinite, {c.get('tmv', 0)} mana total ({'late game, B3' if combo_need(c) == 3 else 'early game, B4'})"
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

def card_values(edh, base, owned, name_meta):
    """(rate_of, play_of, value_of) for one EDHREC page: the play rate as EDHREC shows it, the rate
    used for choosing (non-lands blended with the all-decks page; lands keep the page's own rate, they
    only compete with lands), and play rate + SYN_W x EDHREC synergy (lands: rate only)."""
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
    value_of = lambda k: play_of(k) if kind_of(k) == "land" else play_of(k) + SYN_W * syn_of(k)
    return rate_of, play_of, value_of

# ------------------------------------------------------------ unused cards
HOME_MIN = 0.12         # a commander is a "home" for a card if the card scores at least this there
HOMES = 3               # homes shown per card
UNUSED_SHOW = 150       # cards listed in the report (best homes first)

def find_homes(cmdrs, owned, name_meta, used, T):
    """Owned cards outside `used` (your decks) and where they'd fit best.
    cmdrs = [(DATA index, commander meta, all-decks EDHREC page, names in its suggested 99)].
    Score is the deck builder's own (play rate + synergy + fit), on the all-decks page."""
    cand = {k: m for k, m in owned.items() if k not in used and m["commander_legal"]
            and m["name"] not in BASIC_NAMES and m["layout"] not in ("token", "emblem")}
    homes = {k: [] for k in cand}
    for i, m, page, names in cmdrs:
        ci, me = set(m["ci"]), norm(m["name"])
        prof = commander_profile(m, page.get("tags") or [])
        rate_of, _, value_of = card_values(page, page, owned, name_meta)
        for k, c in cand.items():
            if k == me or not set(c["ci"]) <= ci: continue
            f, why = (0.0, "") if card_kind(c) == "land" else card_fit(c, prof, "all")
            sc = value_of(k) + f
            if sc >= HOME_MIN: homes[k].append((sc, i, rate_of(k), why, k in names))
    rows = []
    for k, L in homes.items():
        L.sort(key=lambda h: (-h[0], h[1]))
        if L: rows.append((L[0][0], k, L[:HOMES]))
    rows.sort(key=lambda r: (-r[0], r[1]))
    by_cmdr = sorted(((i, sorted(names & set(cand))) for i, _, _, names in cmdrs), key=lambda t: (-len(t[1]), t[0]))
    in_any = set().union(*(names for _, _, _, names in cmdrs)) if cmdrs else set()
    return {"n_unused": len(cand), "n_home": len(rows), "n_sugg": len(set(cand) & in_any),
            "cards": [[T.add(cand[k]["name"], cand[k]), [[i, round(r * 100), why, int(ind)] for _, i, r, why, ind in L]]
                      for _, k, L in rows[:UNUSED_SHOW]],
            "by_cmdr": [[i, len(ks), [T.add(cand[k]["name"], cand[k]) for k in ks[:40]]] for i, ks in by_cmdr[:15] if ks]}

# --------------------------------------------------------------- analysis
def power_profile(roles, gc, avg_cmc):
    clamp = lambda v: max(0, min(10, int(v)))
    return {"speed": clamp(10 - avg_cmc),
            "interaction": clamp(roles.get("removal", 0) + roles.get("wipe", 0) + roles.get("counter", 0)),
            "ramp": clamp(roles.get("ramp", 0)), "draw": clamp(roles.get("draw", 0)),
            "tutor": clamp(roles.get("tutor", 0) * 3), "gc": clamp(gc * 3), "combo": 0}

def analyze(cmdr, edh, owned, name_meta, pool_info, bracket, T, base=None, combos=None, focus=None,
            want_gaps=True, profile=None, show=None):
    """`base` = the commander's all-decks page, used to steady small bracket pages.
    `combos` = combos you own in these colours (combos_for_commander()["own"]).
    `focus` = a theme name ("Discard"): cards matching it score FOCUS_W more (theme decks).
    `want_gaps` = False skips the gaps list (theme decks show the overview's). `profile` = the
    commander's profile (computed once per commander by the caller; else from the page's themes).
    `show` = real play rates (average decks): order and label the gaps instead of the page's rates."""
    ci, me = set(cmdr["ci"]), norm(cmdr["name"])
    _SUB_MEMO.clear()
    tribe = commander_types(cmdr)
    profile = profile or commander_profile(cmdr, (base or edh).get("tags") or [])
    tprof = theme_profile(focus) if focus else None
    pool, by_role = pool_info
    legal = {it[0] for it in pool}      # owned, commander-legal, inside the color identity
    gc_cap = GC_CAP.get(bracket)        # None = no cap
    chosen, lands = [], []
    def gc_room():
        return gc_cap is None or sum(1 for m, _, _ in chosen + lands if m["gc"]) < gc_cap
    cards = edh["cards"]
    rate_of, play_of, value_of = card_values(edh, base, owned, name_meta)
    fits = {}
    def score(k):           # an owned card: EDHREC value + how well it fits this commander
        if k not in fits:
            m = owned[k]
            fits[k] = (0.0, "") if card_kind(m) == "land" else fit_cached(cmdr, m, profile, bracket)
            if tprof and card_kind(m) != "land" and hits_theme(m, tprof):
                fits[k] = (fits[k][0] + FOCUS_W, ("theme: " + focus.lower() + (" · " + fits[k][1] if fits[k][1] else "")))
        return value_of(k) + fits[k][0]
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
        def take(it):
            chosen.append((it[1], "f", None)); used.add(it[0]); note(it[0])
            for r in it[2]:
                if r in counts: counts[r] += 1
        ok = lambda it: it[0] not in used and (not it[1]["gc"] or gc_room()) and not blocked(it[0])
        for role, target in ROLE_TARGETS.items():
            for it in fill:
                if len(chosen) >= nonland or counts[role] >= target: break
                if ok(it) and role in it[2]: take(it)
        for it in fill:
            if len(chosen) >= nonland: break
            if ok(it): take(it)

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
    return {
        "decks": edh["decks"], "pct": round(100 * own_w / tot_w, 1),
        "own_n": own_n, "tmpl_n": len(template), "n_miss": len(missing),
        "rec": sum(1 for c in allc if c[1] == "p"),
        "subs": sum(1 for c in allc if c[1] == "s"),
        "fill": sum(1 for c in allc if c[1] == "f"),
        "pick": sum(1 for c in allc if c[1] == "y"),
        "cpc": sum(1 for c in allc if c[1] == "c"),
        "gc": len(gc_names), "gcn": gc_names, "cmc": avg_cmc,
        "pw": power_profile(roles, len(gc_names), avg_cmc),
        "rd": readiness(roles, avg_cmc, odd, sources),
        "core": built_around(profile, [m for m, _, _ in chosen]),
        "mld": [m["name"] for m, _, _ in allc if is_mld(m)],
        "xt": [m["name"] for m, _, _ in allc if is_xturn(m)],
        "tut": roles.get("tutor", 0),
        # third field: the missing card a substitute stands in for, or why you picked it ("y")
        # substitutes also carry [why the advised card, [[alternative, why] x up to 3]]
        "deck": [[T.add(m["name"], m), kind, T.add(f["name"], f), *slot_alts.get(id(f), (-1, []))] if kind == "s"
                 else [T.add(m["name"], m), kind, T.s(f) if isinstance(f, str) else -1] for m, kind, f in allc],
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
                    "mv": v.get("manaValueNeeded") or 0})
    out.sort(key=lambda c: -c["pop"])
    return {"n": len(out), "list": out[:keep]}

def combos_for_commander(m, owned, cache, combo_cards):
    """Combos among your cards in this commander's colours (the commander included). The answer
    only depends on the colours, so commanders sharing an identity share one cached query."""
    ci = set(m["ci"])
    pool, extra = combo_pool(ci, owned, combo_cards)
    if len(pool) > CSB_MAX_MAIN: return None   # no combo-card list to trim with
    key = "ci2:" + ("".join(c for c in "WUBRG" if c in ci) or "C") + ":" \
          + hashlib.md5("\n".join(pool + extra).encode()).hexdigest()[:10]
    if key in cache: return cache[key]        # (--refresh starts from an empty cache)
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
                              "inf": c.get("inf", 0), "tmv": c.get("tmv", 0), "two": int(two_card_infinite(c)),
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
def parse_decklist(path):
    """Reads Moxfield / Archidekt / Arena style text exports."""
    cmdrs, main, section = [], [], "main"
    with open(path, encoding="utf-8-sig") as f:
        for line in f:
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

def analyze_imported(path, owned, name_meta, do_combos, edh_cache, T):
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
    combos = None
    if do_combos and not OFFLINE and not CSB_DOWN[0]:
        res = csb_find([n for _, n in cmdrs], [n for _, n in main])
        if res is not None:
            own = compact_combos(res.get("included", []), deck_keys, 30)
            near = compact_combos(res.get("almostIncluded", []), deck_keys, 20)
            combos = {"own": own["list"], "n_own": own["n"], "near": near["list"], "n_near": near["n"]}
    cm = meta(cmdrs[0][1]) if cmdrs else None
    return {"title": os.path.splitext(os.path.basename(path))[0],
            "cmdr": [n for _, n in cmdrs], "cidx": [T.add((meta(n) or {}).get("name", n), meta(n)) for _, n in cmdrs],
            "ci": [c for c in "WUBRG" if c in ci], "img": (cm or {}).get("img", ""),
            "own": own_n, "total": tot_n, "pct": round(100 * own_n / tot_n, 1),
            "cards": cards_out, "gaps": gaps, "combos": combos}

# ------------------------------------------------------------------ report
HTML = r"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Deck Wizard v5</title><style>
:root{--bg:#111827;--ink:#e5e7eb;--mut:#9ca3af;--line:#374151;--acc:#2dd4bf;--card:#1f2937;--bar:#374151;--fill:#a78bfa;--pick:#fbbf24;--combo:#f472b6}
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
.profile h4{margin:10px 0 6px;font-size:.85rem;color:var(--mut)}
.bars{display:grid;grid-template-columns:1fr auto;gap:2px 8px;align-items:center;max-width:420px}
.seg{height:7px;background:var(--bar);border-radius:3px;overflow:hidden}.sf{height:100%;background:var(--acc)}
.sl{font-size:.75rem;color:var(--mut);font-variant-numeric:tabular-nums}
.nums{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0}.num{border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:.8rem;color:var(--mut)}
.num b{display:block;font-size:1.25rem;color:var(--ink)}.num .t{font-weight:600;color:var(--ink);font-size:.8rem}.num ul{padding-left:16px;margin:4px 0 0}.num .bad{color:#fbbf24}.num .ok{color:#34d399}
@media(max-width:700px){.nums{grid-template-columns:1fr}}
.ks{color:var(--acc)}.kf{color:var(--fill)}.kp{color:var(--pick)}.kc{color:var(--combo)}
.vbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0 4px;padding-top:12px;border-top:1px solid var(--line)}
.vbar h3{margin:0 8px 0 0;font-size:1rem}
.legend{font-size:.75rem;color:var(--mut);display:flex;gap:6px;align-items:center;margin-left:auto}
.lg{display:inline-block;width:12px;height:12px;border-radius:3px;border:2px solid}.lg.s{border-color:var(--acc)}.lg.f{border-color:var(--fill)}.lg.y{border-color:var(--pick)}.lg.c{border-color:var(--combo)}.lg.m{background:#555;border-color:#555}
.grp h5{margin:14px 0 6px;font-size:.85rem;color:var(--mut);font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px}
.ct{position:relative;display:block;line-height:0;border-radius:6px}
img.c{width:100%;aspect-ratio:488/680;border-radius:4.75%/3.5%;background:var(--bar);object-fit:cover}
.ct.sub img.c{outline:3px solid var(--acc);outline-offset:-2px}
.ct.fill img.c{outline:3px solid var(--fill);outline-offset:-2px}
.ct.pick img.c{outline:3px solid var(--pick);outline-offset:-2px}
.ct.combo img.c{outline:3px solid var(--combo);outline-offset:-2px}
.ct.miss img.c{filter:grayscale(1) brightness(.5)}
.badge{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.8);color:#fff;font:700 .75rem/1 system-ui;padding:4px 6px;border-radius:4px}
.note{position:absolute;left:4px;right:4px;bottom:6px;background:rgba(0,0,0,.82);color:#fff;font:600 .65rem/1.25 system-ui;padding:3px 5px;border-radius:4px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gap{display:flex;gap:10px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line);flex-wrap:wrap}
.alt{width:122px;display:flex;flex-direction:column;gap:4px}.alt small{font-size:.72rem;line-height:1.3;color:var(--mut)}
.arrow{align-self:center;font-size:1.4rem;color:var(--mut)}
.adv{flex:1;min-width:180px;align-self:center;color:var(--mut);font-size:.85rem;margin:0}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.danger{border:1px solid #f87171;background:rgba(248,113,113,.08);border-radius:8px;padding:10px 12px;margin:10px 0}.danger h4{color:#f87171;margin-top:0}
.tag.thm{cursor:pointer;background:transparent;border:1px solid var(--line)}.tag.thm.on{border-color:var(--acc);background:rgba(45,212,191,.18);color:var(--ink)}
.tnote{font-size:.85rem;margin:4px 0 8px}.tnote .tag{cursor:pointer}
.srcsel{display:flex;gap:4px}.srcsel .srcb{font-size:.85rem;padding:4px 12px}
.shape{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px 24px;margin:4px 0 12px}
.shape h4{margin:0 0 6px;font-size:.85rem;color:var(--mut)}
.mvc{display:flex;align-items:flex-end;gap:2px;height:110px;padding-top:16px;border-bottom:1px solid var(--line)}
.mvc .col{flex:1;height:100%;position:relative;display:flex;align-items:flex-end;justify-content:center}
.mvc .b{width:70%;background:var(--fill);border-radius:4px 4px 0 0}
.mvc .rf,.tyb .rf{position:absolute;background:var(--ink)}.mvc .rf{left:6%;right:6%;height:2px}
.mvc .v{position:absolute;font-size:.7rem;color:var(--mut)}
.mvx{display:flex;gap:2px;margin-top:2px}.mvx span{flex:1;text-align:center;font-size:.7rem;color:var(--mut)}
.tyr{display:grid;grid-template-columns:96px 1fr 26px;gap:3px 8px;align-items:center;font-size:.75rem}
.tyl{color:var(--mut)}.tyn{text-align:right}
.tyb{height:10px;position:relative}.tyb .b{height:100%;background:var(--fill);border-radius:0 4px 4px 0}.tyb .rf{top:-3px;bottom:-3px;width:2px}
.lgd{font-size:.75rem;color:var(--mut);display:flex;gap:14px;margin-bottom:6px}.lgd i{display:inline-block;vertical-align:middle;margin-right:4px}
.lgd .ly{width:10px;height:10px;border-radius:2px;background:var(--fill)}.lgd .lr{width:12px;height:2px;background:var(--ink)}
table.st{font-size:.75rem;border-collapse:collapse}table.st td,table.st th{padding:2px 10px;text-align:right;border-bottom:1px solid var(--line)}table.st td:first-child{text-align:left}
.srcs{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;font-size:.8rem}
.srcb{font-size:.75rem;padding:3px 8px;border:1px solid var(--line);border-radius:6px;color:var(--mut);background:transparent;cursor:pointer}.srcb:hover{border-color:var(--acc);color:var(--ink);background:transparent}.srcb.on{border-color:var(--acc);color:var(--ink);background:rgba(45,212,191,.12)}.srcb:disabled{opacity:.5;cursor:default}
.slotw{display:flex;flex-direction:column;gap:4px}.swap{font-size:.72rem;padding:3px 6px}
.ct.buy img.c{outline:3px dashed #f87171;outline-offset:-2px;filter:none}
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
</style></head><body><main>
<h1>Deck Wizard</h1>
<p class="sub">Your collection vs EDHREC, per bracket. Missing cards get filled from cards you own.</p>
<ul class="stats" id="stats"></ul>
<div id="coll"></div>
<div class="slider"><label for="br">Bracket</label><input id="br" type="range" min="0" step="1" value="0"><span id="bv"></span>
<div class="srcsel" role="group" aria-label="Deck source"><button class="srcb" data-src="">Commander page</button><button class="srcb" data-src="avg">Average deck</button></div></div>
<div class="tools">
<input id="q" type="search" placeholder="Search commanders" aria-label="Search">
<select id="th" aria-label="Archetype"><option value="">Any archetype</option></select>
<select id="c" aria-label="Color"><option value="">Any color</option><option>W</option><option>U</option><option>B</option><option>R</option><option>G</option></select>
<select id="p" aria-label="Min owned"><option value="0">Any %</option><option value="40">40%+</option><option value="60">60%+</option><option value="80">80%+</option></select>
<select id="dk" aria-label="Min decks"><option value="0">Any deck count</option><option value="20">20+ decks</option><option value="100">100+ decks</option><option value="500">500+ decks</option><option value="1000">1000+ decks</option><option value="5000">5000+ decks</option></select>
<select id="cf" aria-label="Combos"><option value="">Any combos</option><option value="own">Owns 1+ combo</option><option value="skel">Combo in deck</option></select>
<select id="so" aria-label="Sort"><option value="pct">Sort: % owned</option><option value="decks">Sort: deck count</option><option value="combos">Sort: combos owned</option><option value="ready">Sort: build readiness</option></select>
</div>
<div id="imp"></div>
<div id="unused"></div>
<div id="count"></div>
<div id="list"></div>
</main><img id="pv" alt=""><script>
const DATA=__DATA__, BR=__BR__, ST=__STATS__, DECKS=__DECKS__, CARDS=__CARDS__, COMBOS=__COMBOS__, STRS=__STRS__;
const W=i=>typeof i==="number"?(i>=0?STRS[i]:""):(i||"");   // a reason from the shared string table
const LBL={all:"All decks",exhibition:"B1 Exhibition",core:"B2 Core",upgraded:"B3 Upgraded",optimized:"B4 Optimized",cedh:"B5 cEDH"};
const PIP={W:"#e8e2c8",U:"#7fb3e0",B:"#6b5f73",R:"#e07a5f",G:"#7bb274"};
const GL={Creature:"Creatures",Planeswalker:"Planeswalkers",Battle:"Battles",Instant:"Instants",Sorcery:"Sorceries",Artifact:"Artifacts",Enchantment:"Enchantments",Land:"Lands",Other:"Other"};
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const n=v=>Number(v).toLocaleString();
const front=i=>CARDS[i][0].split(" // ")[0];
DATA.forEach((d,i)=>d.i=i);
$("stats").innerHTML=`<li><strong>${n(ST.cards)}</strong>cards</li><li><strong>${n(ST.unique)}</strong>unique</li><li><strong>${ST.cands}</strong>commanders</li><li><strong>${DATA.length}</strong>analyzed</li>`;

/* ---------- collection file + upload (upload works when opened through Deck Wizard App) ---------- */
(function(){
  const C=ST.coll||{}, D=C.diff, served=location.protocol.startsWith("http");
  const names=(l,k)=>l.slice(0,40).map(esc).join(", ")+(k>l.length?` … +${k-l.length} more`:"");
  let h=`<span>Collection: <b>${esc(C.csv||"?")}</b> <small>(${esc(C.at||"")})</small></span>`;
  if(D) h+=`<span>${[D.added_n?`<b class="add">+${D.added_n} new cards</b>`:"", D.removed_n?`<b class="rem">−${D.removed_n} removed</b>`:"",
    D.new_cmdrs_n?`${D.new_cmdrs_n} new commanders`:""].filter(Boolean).join(" · ")||"No changes since the previous collection"}</span>`;
  h+=served?`<label class="up">Upload new collection CSV<input type="file" id="upf" accept=".csv,text/csv" hidden></label><span id="ups"></span>`
    :`<small class="dim">To update: export from ManaBox into the <b>collection</b> folder and run <b>Update Deck Wizard.bat</b>, or open <b>Deck Wizard App.bat</b> for an upload button.</small>`;
  if(D&&(D.added_n||D.removed_n||D.new_cmdrs_n)) h+=`<details><summary>What changed since the previous collection</summary>
    ${D.new_cmdrs_n?`<p>New commanders: ${names(D.new_cmdrs,D.new_cmdrs_n)}</p>`:""}
    ${D.added_n?`<p class="add">Added: ${names(D.added,D.added_n)}</p>`:""}
    ${D.removed_n?`<p class="rem">Removed: ${names(D.removed,D.removed_n)}</p>`:""}</details>`;
  $("coll").innerHTML=h;
  if(!served) return;
  const ups=$("ups");
  const poll=()=>fetch("/status").then(r=>r.json()).then(s=>{
    if(s.running){ups.textContent="Rebuilding… "+(s.line||""); setTimeout(poll,1000);}
    else if(s.ok===true&&s.started>ST.built){ups.textContent="Done, reloading…"; location.reload();}
    else if(s.ok===false) ups.textContent="Rebuild failed: "+(s.line||"see the Deck Wizard window");
  }).catch(()=>{ups.textContent="Lost connection to Deck Wizard App (is its window still open?)";});
  $("upf").addEventListener("change",async e=>{
    const f=e.target.files[0]; if(!f) return;
    ups.textContent="Uploading "+f.name+"…";
    try{
      const r=await fetch("/upload",{method:"POST",headers:{"X-Deck-Wizard":"1","Content-Type":"text/csv"},body:f});
      const j=await r.json();
      if(!r.ok){ups.textContent=j.error||"Upload failed"; return;}
      poll();
    }catch(err){ups.textContent="Upload failed: is the Deck Wizard App window still open?";}
    e.target.value="";
  });
  poll();   // a rebuild may already be running (e.g. started from another tab)
})();
const br=$("br"); br.max=BR.length-1;
const themes=new Set(); DATA.forEach(d=>d.tags.slice(0,3).forEach(t=>themes.add(t[0])));
[...themes].sort().forEach(t=>{const o=document.createElement("option");o.value=o.textContent=t;$("th").appendChild(o);});
const pips=ci=>ci.length?ci.map(c=>`<i class="pip" style="background:${PIP[c]}">${c}</i>`).join(""):`<i class="pip" style="background:#bbb">C</i>`;
const bk=()=>BR[+br.value];
// deck source for the whole page, like EDHREC: "" = commander page (card stats), "avg" = average deck
let SRC=""; try{SRC=localStorage.getItem("dw:src")||"";}catch(e){}
const X=(d,b)=>SRC==="avg"?(d.av&&d.av[b])||null:d.b[b];

/* ---------- card images (Scryfall) ---------- */
function IMG(i){const s=CARDS[i][1];
  return !s?"https://api.scryfall.com/cards/named?format=image&version=normal&exact="+encodeURIComponent(front(i))
    :s.startsWith("http")?s:"https://cards.scryfall.io/normal/"+s;}
function tile(i,o={}){if(i==null||i<0||!CARDS[i])return"";const c=CARDS[i];
  return `<a class="ct ${o.cls||""}" href="https://scryfall.com/search?q=${encodeURIComponent('!"'+front(i)+'"')}" target="_blank" rel="noopener">`+
   `<img class="c" src="${IMG(i)}" alt="${esc(c[0])}" title="${esc(c[0])}" loading="lazy">`+
   (o.badge?`<span class="badge">${esc(o.badge)}</span>`:"")+(o.note?`<span class="note">${esc(o.note)}</span>`:"")+`</a>`;}
function grid(cmdrs,items){
  const by={}; items.forEach(it=>{const g=CARDS[it.i][2]||"Other";(by[g]=by[g]||[]).push(it);});
  let h=`<div class="grp"><h5>Commander</h5><div class="grid">${cmdrs.map(i=>tile(i)).join("")}</div></div>`;
  Object.keys(GL).forEach(g=>{const L=by[g]; if(!L)return; const cnt=L.reduce((s,it)=>s+(it.n||1),0);
    h+=`<div class="grp"><h5>${GL[g]} <small>${cnt}</small></h5><div class="grid">`+L.map(it=>tile(it.i,{
      cls:{s:"sub",s2:"sub",buy:"miss buy",f:"fill",m:"miss",y:"pick",c:"combo"}[it.kind]||"",badge:(it.n||1)>1?"×"+it.n:"",
      note:it.kind==="s"&&it.f>=0?"for "+front(it.f):it.kind==="s2"?"for "+front(it.f)+" (your choice)":it.kind==="buy"?"to buy":it.kind==="f"?"role fill":it.kind==="m"?"missing":
        it.kind==="y"?(!W(it.f)?"your pick":CARDS[it.i][2]==="Land"?W(it.f):"fits: "+W(it.f)):it.kind==="c"?"combo piece":""})
      +(it.slot!=null?`<button class="swap" data-swap="${it.slot}" title="Choose what fills this slot">⇄ options</button>`:"")).map(h=>h.includes('data-swap')?`<div class="slotw">${h}</div>`:h).join("")+`</div></div>`;});
  return h;}
function gapsHTML(gaps,deckSet,slots){
  if(!gaps.length) return `<p class="dim">No gaps: you own every popular card.</p>`;
  return gaps.map(([i,r,subs,used,roles])=>{roles=W(roles);
    const isSlot=slots&&slots.has(i);
    const alts=subs.map(([s,why])=>`<div class="alt">${tile(s,{cls:s===used?"sub":"",note:s===used?"in your deck":deckSet.has(s)?"already in deck":""})}<small>${esc(W(why))}</small>${isSlot&&!deckSet.has(s)?`<button class="opt mini" data-pick="${s}" data-slot="${i}">Use this</button>`:""}</div>`).join("")
      +(isSlot&&!deckSet.has(i)?`<div class="alt"><button class="opt mini" data-pick="-1" data-slot="${i}">Buy ${esc(front(i))} instead</button></div>`:"");
    const adv=subs.length?"":`<p class="adv">No close match in your collection for this ${esc(roles||"synergy")} slot.${r>=25?" It's a core card for this commander, worth picking up.":" The deck fills this slot with other cards you own."}</p>`;
    return `<div class="gap"><div class="alt">${tile(i,{cls:"miss",note:r?r+"% of decks":"missing"})}<small>${esc(roles||"synergy piece")}</small></div><span class="arrow" aria-hidden="true">→</span>${alts}${adv}</div>`;}).join("");}
/* ---------- your choices for substitute slots (saved in this browser) ---------- */
const chKey=(d,b,t)=>"dw:"+d.slug+":"+b+(t?":"+t:"");
function getCh(d,b,t){try{return JSON.parse(localStorage.getItem(chKey(d,b,t))||"{}")||{};}catch(e){return {};}}
function setCh(d,b,o,t){try{Object.keys(o).length?localStorage.setItem(chKey(d,b,t),JSON.stringify(o)):localStorage.removeItem(chKey(d,b,t));}catch(e){}}
// the deck for a theme: the normal deck of this bracket with the theme deck's differences applied
function applyDiff(x,df,extra){const rem=new Set(df.rem);
  return Object.assign({},x,df,{deck:x.deck.filter(e=>!rem.has(e[0])).concat(df.add)},extra);}
function themed(d,b,t){const x=d.b[b], th=t&&d.th&&d.th[t], df=th&&th.b[b]; if(!df) return x;
  return applyDiff(x,df,{theme:th.name,tdecks:th.decks});}
// EDHREC's average deck of this bracket, rebuilt with your cards (stored as differences too)
const hasAvg=(d,b)=>!!(d.av&&d.av[b]);
const avgd=(d,b)=>applyDiff(d.b[b],d.av[b],{avg:1});
// which deck a row shows: "avg" = average deck, else a theme slug or "" (also the key for saved choices)
// a row's own choice (data-a "1"/"0", a theme) wins over the page's source
function rowSel(d,b,r){const a=r&&r.dataset.a;
  if(a==="1"&&hasAvg(d,b))return "avg";
  if(r&&r.dataset.t&&d.th&&d.th[r.dataset.t])return r.dataset.t;
  return a!=="0"&&SRC==="avg"&&hasAvg(d,b)?"avg":"";}
/* ---------- deck shape: your deck (bars) against EDHREC's average deck (line) ---------- */
const TYO=["Creature","Instant","Sorcery","Artifact","Enchantment","Planeswalker","Battle","Other","Land"];
function shapeHTML(items,ref,b){
  const mv=[0,0,0,0,0,0,0,0], ty={};
  items.forEach(it=>{const c=CARDS[it.i]; if(!c)return; const q=it.n||1; ty[c[2]]=(ty[c[2]]||0)+q;
    if(c[2]!=="Land") mv[Math.min(7,c[4]||0)]+=q;});
  const tip=(l,y,r)=>`${l}: your deck ${y}`+(r==null?"":` · average deck ${r}`);
  const top=Math.max(1,...mv,...(ref?ref.mv:[]));
  const cols=mv.map((v,k)=>{const r=ref?ref.mv[k]||0:null, lab="MV "+(k===7?"7+":k);
    return `<div class="col" title="${tip(lab,v,r)}"><span class="v" style="bottom:calc(${100*Math.max(v,r||0)/top}% + 3px)">${v||""}</span><div class="b" style="height:${100*v/top}%"></div>${r==null?"":`<div class="rf" style="bottom:${100*r/top}%"></div>`}</div>`;}).join("");
  const tys=TYO.filter(g=>ty[g]||(ref&&ref.ty[g])), tmax=Math.max(1,...tys.map(g=>Math.max(ty[g]||0,ref?ref.ty[g]||0:0)));
  const rows=tys.map(g=>{const v=ty[g]||0, r=ref?ref.ty[g]||0:null, tt=tip(g,v,r);
    return `<span class="tyl" title="${tt}">${g}</span><div class="tyb" title="${tt}"><div class="b" style="width:${100*v/tmax}%"></div>${r==null?"":`<div class="rf" style="left:${100*r/tmax}%"></div>`}</div><span class="tyn" title="${tt}">${v}</span>`;}).join("");
  const lgd=`<div class="lgd"><span><i class="ly"></i>Your deck</span>${ref?`<span><i class="lr"></i>EDHREC average ${b==="all"?"":LBL[b]+" "}deck</span>`:""}</div>`;
  const tbl=`<details class="more"><summary>As a table</summary><table class="st"><tr><th></th><th>Your deck</th>${ref?"<th>Average deck</th>":""}</tr>
    ${mv.map((v,k)=>`<tr><td>MV ${k===7?"7+":k}</td><td>${v}</td>${ref?`<td>${ref.mv[k]||0}</td>`:""}</tr>`).join("")}
    ${tys.map(g=>`<tr><td>${g}</td><td>${ty[g]||0}</td>${ref?`<td>${ref.ty[g]||0}</td>`:""}</tr>`).join("")}</table></details>`;
  return `<div class="vbar"><h3>Deck shape</h3>${ref?"":`<span class="dim">no EDHREC average deck for ${LBL[b]}</span>`}</div>${lgd}
  <div class="shape"><div><h4>Mana curve (non-land cards)</h4><div class="mvc">${cols}</div><div class="mvx">${mv.map((_,k)=>`<span>${k===7?"7+":k}</span>`).join("")}</div></div>
  <div><h4>Card types</h4><div class="tyr">${rows}</div></div></div>${tbl}`;}
// the deck as you chose it: slot = the missing card's index; buy = keep the missing card
function effDeck(d,b,x,t){const ch=getCh(d,b,t);
  return x.deck.map(([i,k,f])=>{if(k!=="s"||f<0)return {i,kind:k,f};
    const c=ch[f]; if(c===undefined)return {i,kind:"s",f,slot:f}; if(c===-1)return {i:f,kind:"buy",f,slot:f}; return {i:c,kind:"s2",f,slot:f};});}
function chooserHTML(d,b,x,slot,t){
  const e=x.deck.find(r=>r[1]==="s"&&r[2]===slot); if(!e) return "";
  const [adv,,f,why,alts]=e, ch=getCh(d,b,t)[f], cur=ch===undefined?adv:ch;
  const taken=new Set(effDeck(d,b,x,t).filter(it=>it.slot!==f).map(it=>it.i));
  const opt=(pick,card,label)=>{const dis=pick!==-1&&pick!=="adv"&&taken.has(card);
    const on=(pick==="adv"&&ch===undefined)||(pick===-1&&ch===-1)||(typeof pick==="number"&&pick>=0&&ch===pick);
    return `<button class="opt ${on?"on":""}" data-pick="${pick}" data-slot="${f}" ${dis?"disabled title='already in this deck'":""}><img class="c" src="${IMG(card)}" alt="${esc(CARDS[card][0])}" loading="lazy"><span><b>${esc(front(card))}</b><br><small>${label}</small></span></button>`;};
  return `<div class="chooser"><div class="vbar"><h4>Slot for ${esc(front(f))}: pick what goes in</h4><button class="opt-close" data-slot="">Close</button></div>
  <div class="opts">${opt(-1,f,"keep it: add to shopping list")}${opt("adv",adv,"advised · "+esc(W(why)||"closest match"))}${(alts||[]).map(([c,w])=>opt(c,c,esc(W(w)))).join("")}</div>
  ${(alts||[]).length?"":`<small class="dim">No other close match in your collection.</small>`}</div>`;}
function shopHTML(d,b,items,t){
  const buy=items.filter(it=>it.kind==="buy"); if(!buy.length&&!Object.keys(getCh(d,b,t)).length) return "";
  const list=buy.map(it=>"1 "+front(it.i)).join("\n");
  return `<div class="shop"><b>Shopping list (${buy.length})</b> ${buy.map(it=>esc(front(it.i))).join(", ")||"<span class='dim'>nothing yet</span>"}
  ${buy.length?`<button class="cps" data-text="${esc(list)}">Copy shopping list</button>`:""}<button class="reset-ch">Reset my choices</button></div>`;}
function deckSection(title,cmdrs,items,text,link){
  return `<div class="vbar"><h3>${title}</h3><button class="vt on" data-v="cards">Cards</button><button class="vt" data-v="list">List</button><button class="cp">Copy list</button>${link||""}
  <span class="legend"><i class="lg y"></i>your pick <i class="lg c"></i>combo <i class="lg s"></i>substitute <i class="lg f"></i>role fill <i class="lg m"></i>missing</span></div>
  <div class="view v-cards">${grid(cmdrs,items)}</div>
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
function dangerHTML(d,b,x){
  if(!d.dz||!d.dz.length) return "";
  const sel=BNUM[b], inS=new Set(x.cin||[]);
  const li=d.dz.map(i=>{const c=COMBOS[i], ok=!sel||sel>=4||(sel===3&&c.need===3);
    const rule=c.need===3?`late game (${c.tmv} mana total): allowed from B3`:`early game (${c.tmv} mana total): B4+ only`;
    return `<li>${comboName(c)}${comboTags(c)}${inS.has(c.id)?' <span class="tag">in this deck</span>':""}<br><small>${rule}${sel?(ok?` · OK in ${LBL[b].split(" ")[0]}`:` · <b class="miss">not allowed in ${LBL[b].split(" ")[0]}</b>, the deck leaves it out`):""}</small></li>`;}).join("");
  return `<div class="danger"><h4>⚠ Danger zone: two-card infinite combos you can assemble (${d.dz.length})</h4>
  <small>Official bracket rules: none in B1–B2, only late-game ones in B3, anything in B4–B5. A card that meets a condition counts as the second card.</small><ul class="cl">${li}</ul></div>`;}
function bestHTML(d,b,x){
  const L=(x.cl||[]).map(([i,st])=>{const c=COMBOS[i];
    return `<li>${comboName(c)}${comboTags(c)} <span class="tag">${st===2?"in this deck":"you own every piece"}</span><br><small>${c.prod.map(esc).join(" · ")}${c.two?" · two-card infinite":""}</small></li>`;}).join("");
  const scope=b==="all"?"(all decks: no bracket rules)":`allowed in ${LBL[b]}`;
  return `<h4>Best combos you own, ${scope}</h4><small>Order: in this deck first, then combos that win the game, then fewer pieces, then cheaper.</small><ul class="cl">${L||"<li>None you can assemble in these colours.</li>"}</ul>`;}
function combosSection(d,b,x){
  if(!d.combos) return '<div class="vbar"><h3>Combos</h3></div><p class="dim">Combo data unavailable (rerun to retry).</p>';
  const C={own:(d.co||[]).map(i=>COMBOS[i]),near:(d.cn||[]).map(i=>COMBOS[i]),n_own:d.combos.n_own,n_near:d.combos.n_near};
  return `<div class="vbar"><h3>Combos</h3></div>${dangerHTML(d,b,x)}${bestHTML(d,b,x)}
  <details class="more"><summary>All combos in your collection (${C.n_own}) and one card away (${C.n_near})</summary>${comboHTML(C,x.cin,"In your collection","One card away",true)}</details>`;}

/* ---------- the three numbers ---------- */
const RDL={ramp:"Ramp",draw:"Card draw",removal:"Removal",wipe:"Board wipes",mv:"Avg mana value",src:"Colour sources (weakest)",odd:"Stand-ins + role fill"};
function numsHTML(x,b){
  const rd=x.rd||[], ok=rd.filter(c=>c[3]).length;
  const fail=rd.filter(c=>!c[3]).map(([k,v,t])=>`<li>${RDL[k]}: ${esc(v)} <small>(${k==="mv"||k==="odd"?"max":"want"} ${t})</small></li>`).join("");
  const bf=x.bf||{est:2,why:[]}, sel={exhibition:1,core:2,upgraded:3,optimized:4,cedh:5}[b];
  const lbl=bf.est<=2?"B1–2":bf.est>=4?"B4+":"B3";
  const fit=!sel?"":bf.est<=Math.max(sel,2)||sel===5?` <span class="ok">✓ fits ${LBL[b].split(" ")[0]}</span>`:` <span class="bad">above ${LBL[b].split(" ")[0]}</span>`;
  return `<div class="nums">
  <div class="num"><span class="t">Collection Match</span><b>${x.pct}%</b>${x.avg?`You own ${x.own_n} of the ${x.tmpl_n} non-basic cards in EDHREC's average ${b==="all"?"":LBL[b]+" "}deck (${n(x.decks)} decks).`
    :`You own ${x.own_n} of the top ${x.tmpl_n} cards in ${n(x.decks)} ${x.theme?esc(x.theme)+" decks (all brackets)":LBL[b]+" decks"}.`}</div>
  <div class="num"><span class="t">Build Readiness</span><b>${ok}/${rd.length} checks</b>${fail?`<ul>${fail}</ul>`:"Roles, curve, mana and real cards all look fine."}</div>
  <div class="num"><span class="t">Bracket Fit</span><b>${lbl}${fit}</b>${bf.why.length?`<ul>${bf.why.map(w=>`<li>${esc(w)}</li>`).join("")}</ul>`:"No Game Changers, mass land denial, chained extra turns or two-card combos found."}<br><small>${x.tut||0} tutors (B1–2 expect few)</small></div></div>`;}

/* ---------- commander rows ---------- */
function body(d,b,r){
  const sel=rowSel(d,b,r), asel=sel==="avg", tsel=asel?"":sel;
  const x=asel?avgd(d,b):themed(d,b,tsel), tot=d.b.all.decks||1, pre=b==="all"?"":"/"+b;
  const tags=d.tags.slice(0,3).map(t=>{const has=d.th&&d.th[t[1]];
    return has?`<button class="tag thm ${t[1]===tsel?"on":""}" data-tsel="${t[1]}" title="${t[1]===tsel?"Back to the overview":"Build this deck around "+esc(t[0])}">${esc(t[0])} · ${Math.round(100*t[2]/tot)}%</button>`
      :`<a class="tag" href="https://edhrec.com/commanders/${d.slug}${pre}/${t[1]}" target="_blank" rel="noopener" title="No EDHREC theme page cached: opens EDHREC">${esc(t[0])} · ${Math.round(100*t[2]/tot)}% ↗</a>`;}).join("")||'<span class="tag dim">no themes found</span>';
  const tnote=tsel?`<p class="tnote">Theme: <b>${esc(x.theme)}</b> · ${LBL[b]} rules · built from EDHREC's ${n(x.tdecks)} ${esc(x.theme)} decks and your cards, leaning into cards that ${esc(x.theme.toLowerCase())} decks need.
    <a href="https://edhrec.com/commanders/${d.slug}/${tsel}" target="_blank" rel="noopener">EDHREC ↗</a> <button class="tag" data-tsel="${tsel}">Back to overview</button></p>`
    :asel?`<p class="tnote">EDHREC's average ${b==="all"?"":LBL[b]+" "}deck for this commander (${n(x.decks)} decks), rebuilt with your cards: cards you own stay, missing ones get your closest stand-in, ${b==="all"?"no bracket rules":LBL[b]+" rules"}.
    <a href="https://edhrec.com/average-decks/${d.slug}${pre}" target="_blank" rel="noopener">EDHREC average deck ↗</a></p>`
    :(d.th&&Object.keys(d.th).length?`<p class="tnote dim">Overview: the most common ${LBL[b]} deck. Click a theme above to build around it.</p>`:"");
  const anyAvg=d.av&&Object.keys(d.av).length;
  const srcs=anyAvg?`<div class="srcs"><span class="dim">Deck from:</span><button class="srcb ${asel?"":"on"}" data-asel="0" title="Built from how often each card is played with this commander (EDHREC commander page) and your collection">Commander page</button><button class="srcb ${asel?"on":""}" data-asel="1" ${hasAvg(d,b)?`title="EDHREC's average deck, rebuilt with your cards"`:`disabled title="EDHREC has no average deck for ${LBL[b]}"`}>Average deck${hasAvg(d,b)?": "+d.av[b].pct+"%":""}</button></div>`:"";
  const bks=BR.filter(k=>d.b[k]).map(k=>{const pc=asel&&hasAvg(d,k)?d.av[k].pct:d.b[k].pct, dk=asel&&hasAvg(d,k)?d.av[k].decks:d.b[k].decks;
    return `<button class="bk ${k===b?"on":""}" data-bsel="${k}" title="Show the ${LBL[k]} deck">${LBL[k]}: ${pc}% <small>(${n(dk)})</small></button>`;}).join("");
  const p=x.pw, bars=[["Speed",p.speed],["Interaction",p.interaction],["Ramp",p.ramp],["Draw",p.draw],["Tutor",p.tutor],["Combo",p.combo],["Game Changers",p.gc]]
    .map(([l,v])=>`<div class="seg"><div class="sf" style="width:${v*10}%"></div></div><span class="sl">${l} ${v}</span>`).join("");
  const eff=effDeck(d,b,x,sel), deckSet=new Set(eff.map(it=>it.i));
  const items=eff.concat(x.basics.map(([i,c])=>({i,kind:"",n:c})));
  const text=["Commander","1 "+front(d.cidx),"","Deck",...eff.map(it=>"1 "+front(it.i)),...x.basics.map(([i,c])=>c+" "+front(i))].join("\n")+"\n";
  const slot=r&&r.dataset.slot?+r.dataset.slot:null;
  return `<div class="top">${d.img?`<img class="cimg" src="${esc(d.img)}" alt="${esc(d.name)}" loading="lazy">`:""}
  <div class="info"><div class="tags">${tags}</div>${srcs}${tnote}<div class="bks">${bks}</div>
  ${numsHTML(x,b)}
  ${(x.core||[]).length?`<p>Built around: ${x.core.map(([k,v])=>`<span class="tag">${esc(k)} ${v}</span>`).join(" ")} <small>(cards in the 99 that share it with the commander)</small></p>`:""}
  <p>Deck: ${x.rec} ${x.avg?"from the average deck":"popular"} + <span class="kp">${x.pick||0} your picks</span>${x.cpc?` + <span class="kc">${x.cpc} combo pieces</span>`:""} + <span class="ks">${x.subs} substitutes</span> + <span class="kf">${x.fill} role fill</span>. Avg MV ${x.cmc}.</p>
  <p>Game Changers: ${x.gc} (${x.gcn.map(esc).join(", ")||"none"}). Combos in deck: ${(x.cin||[]).length}${x.c2?` (${x.c2} two-card)`:""}.</p>
  <div class="profile"><h4>Power profile (deck)</h4><div class="bars">${bars}</div></div></div></div>
  ${slot!=null?chooserHTML(d,b,x,slot,sel):""}${shopHTML(d,b,items,sel)}
  ${shapeHTML(items,hasAvg(d,b)?d.av[b].ref:null,b)}
  ${deckSection("Your deck",[d.cidx],items,text,`<a href="https://edhrec.com/${asel?"average-decks":"commanders"}/${d.slug}${pre}" target="_blank" rel="noopener">EDHREC</a>`)}
  <div class="vbar"><h3>Gaps &amp; substitutes</h3><span class="dim">${x.n_miss} ${x.avg?"average-deck":"popular"} cards missing, top ${x.gaps.length} shown${x.avg?" (most played first)":""}</span></div>
  ${gapsHTML(x.gaps,deckSet,new Set(eff.filter(it=>it.slot!=null).map(it=>it.slot)))}
  ${combosSection(d,b,x)}`;}

function render(){
  const b=bk(); $("bv").textContent=LBL[b];
  const q=$("q").value.toLowerCase(), c=$("c").value, p=+$("p").value, dk=+$("dk").value, th=$("th").value, cf=$("cf").value;
  const nc=d=>d.combos?d.combos.n_own:0;
  document.querySelectorAll(".srcsel .srcb").forEach(x=>x.classList.toggle("on",x.dataset.src===SRC));
  const rows=DATA.filter(d=>{const x=X(d,b); return x&&d.name.toLowerCase().includes(q)&&(!c||d.ci.includes(c))
    &&x.pct>=p&&x.decks>=dk&&(!th||d.tags.slice(0,3).some(t=>t[0]===th))
    &&(!cf||(cf==="own"?nc(d)>0:(x.cin||[]).length>0));});
  const so=$("so").value;
  const rdy=x=>(x.rd||[]).filter(c=>c[3]).length;
  rows.sort(so==="ready"?(a,z)=>rdy(X(z,b))-rdy(X(a,b))||X(z,b).pct-X(a,b).pct:so==="decks"?(a,z)=>X(z,b).decks-X(a,b).decks:so==="combos"?(a,z)=>nc(z)-nc(a)||X(z,b).pct-X(a,b).pct:(a,z)=>X(z,b).pct-X(a,b).pct);
  $("count").textContent=`${rows.length} commanders with ${SRC==="avg"?"an EDHREC average deck for "+LBL[b]:LBL[b]+" data"}`;
  $("list").innerHTML=rows.map(d=>{const x=X(d,b); return `<details class="row" data-i="${d.i}"><summary>
    <span class="pips">${pips(d.ci)}</span>
    <span class="nm">${esc(d.name)}<span class="mini">${d.tags.slice(0,3).map(t=>`<span class="tag">${esc(t[0])}</span>`).join("")}</span></span>
    <span class="bar"><b style="width:${x.pct}%"></b></span><span class="pct">${x.pct}%</span>
    <span class="dk">${n(x.decks)} decks</span><span class="cb" title="combos you own">${d.combos?d.combos.n_own+"⚡":"–"}</span></summary><div class="body"></div></details>`;}).join("");
}

/* ---------- imported decks ---------- */
function ibody(k){
  const items=k.cards.map(([i,o,q])=>({i,kind:o?"":"m",n:q}));
  const deckSet=new Set(k.cards.map(c=>c[0]));
  const text=["Commander",...k.cidx.map(i=>"1 "+front(i)),"","Deck",...k.cards.map(([i,o,q])=>q+" "+front(i))].join("\n")+"\n";
  return `<p>You own <strong>${k.own}</strong> of <strong>${k.total}</strong> non-basic cards (${k.pct}%).</p>
  ${deckSection("Deck",k.cidx,items,text,"")}
  <div class="vbar"><h3>Missing cards &amp; substitutes</h3><span class="dim">${k.gaps.length} missing</span></div>
  ${gapsHTML(k.gaps,deckSet)}
  ${comboHTML(k.combos,null,"Combos in this deck","One card away")}`;}
$("imp").innerHTML=DECKS.length?`<h2>Your imported decks</h2>`+DECKS.map((k,j)=>`<details class="row" data-k="${j}"><summary>
  <span class="pips">${pips(k.ci)}</span><span class="nm">${esc(k.title)}<span class="mini"><span class="tag">${esc(k.cmdr.join(" + ")||"commander not found")}</span></span></span>
  <span class="bar"><b style="width:${k.pct}%"></b></span><span class="pct">${k.pct}%</span><span class="dk">${k.own}/${k.total}</span>
  <span class="cb">${k.combos?k.combos.n_own+"⚡":"–"}</span></summary><div class="body"></div></details>`).join(""):"";

/* ---------- unused cards ---------- */
(function(){
  const U=ST.unused; if(!U) return;
  const intro=U.src==="decks_in"
    ?`<p><b>${n(U.n_unused)}</b> cards you own aren't in any of your ${U.n_decks} decks in <b>decks_in</b>. <b>${n(U.n_sugg)}</b> of them make it into the suggested deck of one of your commanders; ${n(U.n_home-U.n_sugg)} more are a weaker fit somewhere; ${n(U.n_unused-U.n_home)} have no real home.</p>`
    :`<p class="dim">Put your real decklists (.txt exports from Moxfield, Archidekt or ManaBox) in the <b>decks_in</b> folder and rerun to see which of your cards sit unused. For now this shows the <b>${n(U.n_unused)}</b> cards that none of the suggested decks use; ${n(U.n_home)} of them are a weaker fit somewhere.</p>`;
  const who=U.by_cmdr.map(([i,k])=>`<a href="#" class="tag" data-cmdr="${esc(DATA[i].name)}">${esc(DATA[i].name)} · ${k}</a>`).join(" ");
  const cards=U.cards.map(([c,H])=>`<div class="alt">${tile(c)}<small>${H.map(([i,r,why,ind])=>`<a href="#" data-cmdr="${esc(DATA[i].name)}">${esc(DATA[i].name.split(" // ")[0])}</a>${r?` ${r}% of decks`:""}${why?` · fits: ${esc(why)}`:""}${ind?" · in its suggested deck":""}`).join("<br>")}</small></div>`).join("");
  $("unused").innerHTML=`<h2>Unused cards</h2>${intro}
  ${who?`<h4>Commanders whose suggested deck uses the most of them</h4><div class="tags">${who}</div>`:""}
  <details class="more"><summary>Best homes for each card (${U.cards.length} shown, best first)</summary><div class="gap">${cards||"<p class='dim'>None.</p>"}</div></details>`;
})();

/* ---------- events ---------- */
document.addEventListener("toggle",e=>{const r=e.target; if(!r.matches||!r.matches("details.row")||!r.open||r.dataset.f)return;
  r.querySelector(".body").innerHTML=r.dataset.k!=null?ibody(DECKS[+r.dataset.k]):body(DATA[+r.dataset.i],rowB(r),r); r.dataset.f=1;},true);
const rowB=r=>(r.dataset.b&&DATA[+r.dataset.i].b[r.dataset.b])?r.dataset.b:bk();   // a bracket chosen in this row wins
function rerow(r){r.querySelector(".body").innerHTML=body(DATA[+r.dataset.i],rowB(r),r);}
document.addEventListener("click",e=>{const t=e.target;
  if(t.classList.contains("vt")){const bd=t.closest(".body");
    bd.querySelectorAll(".vt").forEach(x=>x.classList.toggle("on",x===t));
    bd.querySelectorAll(".view").forEach(v=>v.hidden=!v.classList.contains("v-"+t.dataset.v));}
  const bs=t.closest&&t.closest("[data-bsel]");
  if(bs){const r=bs.closest("details.row"); r.dataset.b=bs.dataset.bsel; r.dataset.slot=""; rerow(r); return;}
  const row=t.closest&&t.closest("details.row[data-i]");
  const ts=t.closest&&t.closest("[data-tsel]");
  if(ts){const r=ts.closest("details.row"); r.dataset.t=r.dataset.t===ts.dataset.tsel?"":ts.dataset.tsel; r.dataset.a=""; r.dataset.slot=""; rerow(r); return;}
  const as=t.closest&&t.closest("[data-asel]");
  if(as&&!as.disabled){const r=as.closest("details.row"); r.dataset.a=as.dataset.asel==="1"?"1":"0"; if(r.dataset.a==="1")r.dataset.t=""; r.dataset.slot=""; rerow(r); return;}
  const sr=t.closest&&t.closest("[data-src]");
  if(sr){SRC=sr.dataset.src; try{localStorage.setItem("dw:src",SRC);}catch(e){} render(); return;}
  if(row){const d=DATA[+row.dataset.i], b=rowB(row), tt=rowSel(d,b,row);
    const sw=t.closest("[data-swap]");
    if(sw){e.preventDefault(); row.dataset.slot=sw.dataset.swap; rerow(row); const c=row.querySelector(".chooser"); if(c&&c.scrollIntoView)c.scrollIntoView({block:"nearest"}); return;}
    const op=t.closest("[data-pick]");
    if(op&&!op.disabled){const ch=getCh(d,b,tt), f=op.dataset.slot, p=op.dataset.pick;
      if(p==="adv") delete ch[f]; else ch[f]=+p; setCh(d,b,ch,tt); row.dataset.slot=""; rerow(row); return;}
    if(t.closest(".opt-close")){row.dataset.slot=""; rerow(row); return;}
    if(t.closest(".reset-ch")){setCh(d,b,{},tt); row.dataset.slot=""; rerow(row); return;}
    const cps=t.closest(".cps"); if(cps){navigator.clipboard.writeText(cps.dataset.text); cps.textContent="Copied"; return;}}
  if(t.dataset&&t.dataset.cmdr){e.preventDefault();$("q").value=t.dataset.cmdr;render();$("list").scrollIntoView();}
  if(t.classList.contains("cp")){navigator.clipboard.writeText(t.closest(".body").querySelector("textarea").value);t.textContent="Copied";}});
const pv=$("pv");
if(matchMedia("(hover:hover)").matches){
  document.addEventListener("mouseover",e=>{const im=e.target.closest&&e.target.closest("img.c");
    if(!im){pv.style.display="none";return;} pv.src=im.src.replace("/normal/","/large/").replace("version=normal","version=large"); pv.style.display="block";});
  document.addEventListener("mousemove",e=>{if(pv.style.display!=="block")return; const w=300,h=418;
    let x=e.clientX+24,y=e.clientY-h/2; if(x+w>innerWidth-8)x=e.clientX-w-24;
    pv.style.left=Math.max(8,x)+"px"; pv.style.top=Math.max(8,Math.min(innerHeight-h-8,y))+"px";});}
["br","q","th","c","p","dk","cf","so"].forEach(id=>$(id).addEventListener("input",render));
render();
</script></body></html>"""

def js_data(obj):
    return json.dumps(obj, separators=(",", ":")).replace("</", "<\\/")

def render_report(results, stats, brackets, decks, cards, combos=(), strs=()):
    return (HTML.replace("__DATA__", js_data(results))
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

def serve(a, csv_path, child_args):
    """Local-only web app: serves report.html and accepts collection uploads."""
    out_html = os.path.join(a.out, "report.html")
    rb = Rebuild(child_args)

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
    a = ap.parse_args()
    if a.offline and a.refresh: ap.error("--offline and --refresh can't be combined")
    if a.serve and a.refresh: ap.error("--serve and --refresh can't be combined")
    csv_path = a.csv or find_collection()
    if not csv_path:
        ap.error(f"no ManaBox CSV found: put your export in the '{COLLECTION_DIR}' folder or pass --csv")
    if a.serve:   # rebuilds after an upload use the same options
        child = ["--out", a.out, "--brackets", a.brackets, "--decks-in", a.decks_in]
        child += ["--only", a.only] if a.only else []
        child += ["--limit", str(a.limit)] if a.limit else []
        child += [f for f, on in (("--no-combos", a.no_combos), ("--offline", a.offline), ("--no-themes", a.no_themes),
                                         ("--no-avg", a.no_avg)) if on]
        return serve(a, csv_path, child)
    global OFFLINE
    OFFLINE = a.offline
    brackets = [b for b in VALID_BRACKETS if b in {x.strip().lower() for x in a.brackets.split(",")}]

    cache_dir = os.path.join(a.out, "cache")
    coll = load_collection(csv_path)
    print(f"Collection file: {csv_path}")
    print(f"Collection: {len(coll)} printings, {sum(q for _, q in coll.values())} cards")
    meta = enrich_scryfall(list(coll), os.path.join(cache_dir, "scryfall.json"), a.refresh)
    owned = {}
    for sid in coll:
        m = meta.get(sid)
        if m and m["layout"] not in ("token", "emblem") and m["name"] not in BASIC_NAMES:
            owned[norm(m["name"])] = m
    ROLE_TAGS.update(fetch_role_tags(os.path.join(cache_dir, "role_tags.json"), a.refresh))
    if a.no_combos: CSB_DOWN[0] = True          # --no-combos: no Spellbook requests, cached flags only
    fetch_card_flags(owned, os.path.join(cache_dir, "spellbook_flags.json"), a.refresh)

    cands = []
    for m in owned.values():
        front = m["type_line"].split(" // ")[0]
        if m["commander_legal"] and "Legendary" in front and \
           ("Creature" in front or "can be your commander" in m["oracle"].lower()):
            cands.append(m)
    cands.sort(key=lambda m: m["name"])
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
    pages, themes, avgs, skipped = {}, {}, {}, 0
    for i, m in enumerate(cands, 1):
        slug = slugify(m["name"])
        base = fetch_page(slug, cache, a.refresh)
        if not base or not base["cards"]:
            skipped += 1; print(f"[{i}/{len(cands)}] {m['name']}: no EDHREC page"); continue
        pg = {"all": base}
        for b in brackets:
            p = fetch_page(f"{slug}/{b}", cache, a.refresh)
            if p and p["cards"]: pg[b] = p
        pages[m["name"]] = pg
        if not a.no_themes:
            th = {}
            for name, tslug, _ in base.get("tags", [])[:THEME_TOP]:
                tp = fetch_theme_page(f"{slug}/{tslug}", cache, a.refresh)
                if tp and tp["cards"]: th[tslug] = (name, tp)
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
    for pg in list(pages.values()) + [{t: tp for t, (_, tp) in th.items()} for th in themes.values()]:
        for p in pg.values():
            for k, (name, rate, *_) in p["cards"].items():
                if rate >= 0.10 and k not in owned and name not in BASIC_NAMES: want.add(name)
    for av in avgs.values():
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
        entry = {"name": m["name"], "ci": sorted(m["ci"]), "img": m.get("img", ""),
                 "slug": slugify(m["name"]), "tags": pg["all"]["tags"], "cidx": T.add(m["name"], m),
                 "b": {b: analyze(m, p, owned, name_meta, pool_info, b, T, pg["all"],
                                  (combos or {}).get("own"), profile=prof)
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
        def combo_info(x, b):
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
        # theme decks: the commander's EDHREC theme page (all brackets) built with each bracket's rules,
        # leaning into cards that match the theme; stored as differences from the normal deck
        entry["th"] = {}
        for tslug, (tname, tp) in (themes.get(m["name"]) or {}).items():
            per = {}
            for b in entry["b"]:
                tx = analyze(m, tp, owned, name_meta, pool_info, b, T, tp, own, focus=tname,
                             want_gaps=False, profile=prof)
                per[b] = combo_info(tx, b)
            entry["th"][tslug] = {"name": tname, "decks": tp["decks"], "b": per}
        # average decks: EDHREC's average 99 for each bracket, rebuilt with your cards (cards you own
        # stay, missing ones get stand-ins, same bracket rules); also stored as differences
        entry["av"] = {}
        for b, ap_ in (avgs.get(m["name"]) or {}).items():
            if b not in entry["b"]: continue
            apage, show = avg_as_page(ap_, pg[b], pg["all"], b)
            ax = analyze(m, apage, owned, name_meta, pool_info, b, T, apage, own, profile=prof, show=show)
            entry["av"][b] = combo_info(ax, b)
            ax["ref"] = avg_shape(ap_, owned, name_meta)
        for b, x in entry["b"].items():
            for t in entry["th"].values():         # now that the normal deck is final, keep only differences
                if b in t["b"]: t["b"][b] = deck_diff(x, t["b"][b])
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
        for fp in files:
            d = analyze_imported(fp, owned, name_meta, not a.no_combos, cache, T)
            decks.append(d)
            print(f"  {d['title']}: {d['pct']}% owned, {len(d['gaps'])} missing"
                  + (f", {d['combos']['n_own']} combos" if d["combos"] else ""))
        decks.sort(key=lambda d: -d["pct"])
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
             "coll": {"csv": os.path.basename(csv_path),
                      "at": time.strftime("saved %Y-%m-%d %H:%M", time.localtime(os.path.getmtime(csv_path))),
                      "diff": {k2: v for k, l in (diff or {}).items()
                               for k2, v in ((k, l[:40]), (k + "_n", len(l)))} if diff else None}}
    out_html = os.path.join(a.out, "report.html")
    with open(out_html + ".tmp", "w", encoding="utf-8") as f:   # swap in whole: the app never serves half a file
        f.write(render_report(results, stats, brackets, decks, T.rows, CT.rows, T.strs))
    os.replace(out_html + ".tmp", out_html)
    no_tags = sum(1 for r in results if not r["tags"])
    print(f"\nDone. {len(results)} analyzed, {skipped} had no EDHREC page, {no_tags} without theme tags."
          f"\nReport: {os.path.getsize(out_html) / 1e6:.1f} MB -> {out_html}")
    if not a.no_open:
        webbrowser.open("file://" + os.path.abspath(out_html))

if __name__ == "__main__":
    main()
