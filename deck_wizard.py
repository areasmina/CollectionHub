#!/usr/bin/env python3
"""
Deck Wizard v5 - ManaBox collection vs EDHREC (per bracket) + Commander Spellbook combos
+ collection substitutes for missing cards + visual card view (Scryfall images).
No AI, no accounts: only free public sites (Scryfall, EDHREC, Commander Spellbook).

Usage (Windows):  py deck_wizard.py --csv "Collection_ (1).csv"
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
"""
import argparse, csv, glob, hashlib, json, os, re, sys, time, unicodedata
import urllib.error, urllib.parse, urllib.request, webbrowser

UA = "DeckWizard/0.5 (personal collection tool)"
EDH = "https://json.edhrec.com/pages/commanders/"
CSB = "https://backend.commanderspellbook.com/find-my-combos"
BASICS = {"W": "Plains", "U": "Island", "B": "Swamp", "R": "Mountain", "G": "Forest"}
BASIC_NAMES = set(BASICS.values()) | {"Wastes", "Snow-Covered Plains", "Snow-Covered Island",
    "Snow-Covered Swamp", "Snow-Covered Mountain", "Snow-Covered Forest"}
LAND_TARGET = 35
MAX_LANDS = 12          # non-basic lands taken from EDHREC lists
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
            last = e; time.sleep(2 * (attempt + 1))
        except Exception as e:
            last = e; time.sleep(2 * (attempt + 1))
    print(f"  ! request failed: {url} ({last})", file=sys.stderr)
    return None

def load_json(path):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f: return json.load(f)
    return {}

def save_json(path, obj):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f: json.dump(obj, f)

# ------------------------------------------------------------ collection
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
    def __init__(self): self.rows, self.idx = [], {}
    def add(self, name, meta=None):
        k = norm(name)
        img = (meta or {}).get("img", "")
        if img.startswith(self.PREFIX): img = img[len(self.PREFIX):]
        if k in self.idx:
            i = self.idx[k]
            if img and not self.rows[i][1]: self.rows[i][1] = img
            return i
        if meta: row = [meta["name"], img, type_group(meta["type_line"]), 1 if meta.get("gc") else 0]
        else: row = [name, "", "Land" if name in BASIC_NAMES else "Other", 0]
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

def load_edhrec_cache(cache_dir, refresh=False):
    """EDHREC pages by path. The first time, seeds from the v3 cache so old pages stay usable
    offline; fetch_page upgrades them the next time they're needed online."""
    if refresh: return {}
    cache = load_json(os.path.join(cache_dir, EDH_CACHE))
    if not cache:   # v3 cached misses are dropped: some may have been 403 blocks
        cache = {k: v for k, v in load_json(os.path.join(cache_dir, "edhrec_v3.json")).items() if v}
    return cache

def fetch_page(path, cache, refresh=False):
    old = cache.get(path)
    if not refresh and old and old.get("v") == EDH_VERSION: return old
    if OFFLINE: return old              # older data beats none; nothing new is recorded
    data = http_json(EDH + path + ".json")
    time.sleep(0.8)
    if not data: return old             # missing page (EDHREC answers 403) or failure: never cached
    cache[path] = parse_edhrec(data)
    return cache[path]

# ------------------------------------------------------------ substitutes
def build_pool(ci, owned, exclude=""):
    """Owned cards a commander with color identity `ci` could play, indexed by role."""
    pool, by_role = [], {}
    for k, m in owned.items():
        if k == exclude or not m["commander_legal"] or not set(m["ci"]) <= ci: continue
        if m["layout"] in ("token", "emblem"): continue
        it = (k, m, roles_of(m), card_kind(m))
        pool.append(it)
        for r in it[2]: by_role.setdefault(r, []).append(it)
    return pool, by_role

def find_subs(mm, rate_of, pool, by_role, used, allow_gc, n=3, penalize=()):
    """Best owned replacements for missing card `mm`: [(score, key, meta, reason)]."""
    kind = card_kind(mm)
    mroles = roles_of(mm) - {"land"}
    if kind == "land":
        need = set(mm.get("produced") or []) & set("WUBRG")
        cands = [it for it in pool if it[3] == "land"]
    elif mroles:
        seen, cands = set(), []
        for r in sorted(mroles):
            for it in by_role.get(r, []):
                if it[0] not in seen: seen.add(it[0]); cands.append(it)
    else:   # pure synergy piece: same card type, and played with this commander
        cands = [it for it in pool if it[3] == kind and rate_of(it[0]) > 0]
    out = []
    for k, m, rs, kd in cands:
        if k in used or (m["gc"] and not allow_gc): continue
        rate, why = rate_of(k), []
        if kind == "land":
            hit = (set(m.get("produced") or []) & set("WUBRG")) & need
            if need and not hit: continue
            s = 2 * len(hit)
            if hit: why.append("makes " + "".join(c for c in "WUBRG" if c in hit))
        else:
            if kd == "land": continue
            shared = rs & mroles
            s = 3 * len(shared) + (1.5 if kd == kind else 0)
            s -= 0.6 * abs(m["cmc"] - mm["cmc"])
            if shared: why.append("same role: " + ", ".join(sorted(shared)))
            why.append(f"{int(m['cmc'])} MV")
        if rate > 0:
            s += rate * 8
            why.append(f"in {round(rate * 100)}% of these decks")
        if k in penalize: s -= 2       # already in the deck: prefer fresh cards
        if s < 1: continue
        out.append((s, k, m, " · ".join(why)))
    out.sort(key=lambda x: (-x[0], x[1]))     # name breaks ties: same input, same deck
    return out[:n]

def role_text(mm):
    if not mm: return ""
    if card_kind(mm) == "land": return "land"
    return ", ".join(sorted(roles_of(mm)))

# --------------------------------------------------------------- analysis
def power_profile(roles, gc, avg_cmc):
    clamp = lambda v: max(0, min(10, int(v)))
    return {"speed": clamp(10 - avg_cmc),
            "interaction": clamp(roles.get("removal", 0) + roles.get("wipe", 0) + roles.get("counter", 0)),
            "ramp": clamp(roles.get("ramp", 0)), "draw": clamp(roles.get("draw", 0)),
            "tutor": clamp(roles.get("tutor", 0) * 3), "gc": clamp(gc * 3), "combo": 0}

def analyze(cmdr, edh, owned, name_meta, pool_info, bracket, T):
    ci, me = set(cmdr["ci"]), norm(cmdr["name"])
    pool, by_role = pool_info
    legal = {it[0] for it in pool}      # owned, commander-legal, inside the color identity
    gc_cap = GC_CAP.get(bracket)        # None = no cap
    chosen, lands = [], []
    def gc_room():
        return gc_cap is None or sum(1 for m, _, _ in chosen + lands if m["gc"]) < gc_cap
    cards = edh["cards"]
    rate_of = lambda k: (cards.get(k) or (None, 0.0))[1]
    rec = [(k, v[0], v[1]) for k, v in cards.items() if k != me and v[0] not in BASIC_NAMES]
    rec.sort(key=lambda x: -x[2])
    template = [x for x in rec if x[2] >= 0.10][:99] or rec[:99]
    tot_w = sum(x[2] for x in template) or 1
    own_w = sum(x[2] for x in template if x[0] in owned)
    own_n = sum(1 for x in template if x[0] in owned)
    missing = [x for x in template if x[0] not in owned]

    # 1) popular cards you own, 2) substitutes for popular cards you don't
    nonland = 99 - LAND_TARGET
    used, sub_for = {me}, {}
    for k, name, rate in rec:
        if k in used: continue
        if k in owned:
            m = owned[k]
            if k not in legal or (m["gc"] and not gc_room()): continue
            if card_kind(m) == "land":
                if len(lands) < MAX_LANDS and rate >= 0.15:
                    lands.append((m, "p", None)); used.add(k)
            elif len(chosen) < nonland:
                chosen.append((m, "p", None)); used.add(k)
        elif rate >= SUB_MIN:
            mm = name_meta.get(k)
            if not mm: continue
            is_land = card_kind(mm) == "land"
            if (is_land and len(lands) >= MAX_LANDS) or (not is_land and len(chosen) >= nonland): continue
            subs = find_subs(mm, rate_of, pool, by_role, used, gc_room(), 1)
            if subs:
                sk, sm = subs[0][1], subs[0][2]
                used.add(sk); sub_for[k] = sk
                (lands if is_land else chosen).append((sm, "s", mm))

    # 3) still short: fill by role need (ramp, draw, removal, wipes), then best leftovers
    if len(chosen) < nonland:
        counts = {r: 0 for r in ROLE_TARGETS}
        for m, _, _ in chosen:
            for r in roles_of(m):
                if r in counts: counts[r] += 1
        fill = [(k, m, rs) for k, m, rs, kd in pool
                if k not in used and kd != "land" and (gc_cap != 0 or not m["gc"])]
        fill.sort(key=lambda it: (-rate_of(it[0]), it[1]["cmc"]))
        def take(it):
            chosen.append((it[1], "f", None)); used.add(it[0])
            for r in it[2]:
                if r in counts: counts[r] += 1
        ok = lambda it: it[0] not in used and (not it[1]["gc"] or gc_room())
        for role, target in ROLE_TARGETS.items():
            for it in fill:
                if len(chosen) >= nonland or counts[role] >= target: break
                if ok(it) and role in it[2]: take(it)
        for it in fill:
            if len(chosen) >= nonland: break
            if ok(it): take(it)

    n_basics = 99 - len(chosen) - len(lands)
    colors = [c for c in "WUBRG" if c in ci]
    tally = {}
    for i in range(n_basics):
        b = BASICS[colors[i % len(colors)]] if colors else "Wastes"
        tally[b] = tally.get(b, 0) + 1
    arena = ["Commander", f"1 {cmdr['name'].split(' // ')[0]}", "", "Deck"]
    arena += [f"1 {m['name'].split(' // ')[0]}" for m, _, _ in chosen + lands]
    arena += [f"{c} {b}" for b, c in tally.items()]

    # gaps: top missing cards with up to 3 owned alternatives
    gaps = []
    for k, name, rate in missing[:GAP_SHOW]:
        mm = name_meta.get(k)
        subs = find_subs(mm, rate_of, pool, by_role, {me}, gc_cap != 0, 3, used) if mm else []
        rows = [[T.add(sm["name"], sm), why] for _, sk, sm, why in subs]
        used_sub = sub_for.get(k)
        if used_sub and used_sub not in [s[1] for s in subs]:
            sm = owned[used_sub]
            rows = ([[T.add(sm["name"], sm), "swapped into your deck"]] + rows)[:3]
        gaps.append([T.add(name, mm), round(rate * 100), rows,
                     T.add(owned[used_sub]["name"], owned[used_sub]) if used_sub else -1, role_text(mm)])

    roles = {r: 0 for r in ROLE_NAMES}
    for m, _, _ in chosen:
        for r in roles_of(m):
            if r in roles: roles[r] += 1
    gc_names = [m["name"] for m, _, _ in chosen + lands if m["gc"]]
    cmcs = [m["cmc"] for m, _, _ in chosen]
    avg_cmc = round(sum(cmcs) / max(len(cmcs), 1), 2)
    allc = chosen + lands
    return {
        "decks": edh["decks"], "pct": round(100 * own_w / tot_w, 1),
        "own_n": own_n, "tmpl_n": len(template), "n_miss": len(missing),
        "rec": sum(1 for c in allc if c[1] == "p"),
        "subs": sum(1 for c in allc if c[1] == "s"),
        "fill": sum(1 for c in allc if c[1] == "f"),
        "gc": len(gc_names), "gcn": gc_names, "cmc": avg_cmc,
        "pw": power_profile(roles, len(gc_names), avg_cmc),
        "deck": [[T.add(m["name"], m), kind, T.add(f["name"], f) if f else -1] for m, kind, f in allc],
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
        resp = http_json(url, body)
        if not resp: return None
        for k, v in (resp.get("results") or {}).items():
            if isinstance(v, list): merged.setdefault(k, []).extend(v)
        url = resp.get("next"); pages += 1
        time.sleep(0.3)
    return merged if pages else None

def compact_combos(variants, have, keep):
    out, seen = [], set()
    for v in variants:
        vid = str(v.get("id", ""))
        if not vid or vid in seen: continue
        seen.add(vid)
        cards = [u["card"]["name"] for u in v.get("uses", []) if isinstance(u.get("card"), dict)]
        req = [r["template"]["name"] for r in v.get("requires", []) if isinstance(r.get("template"), dict)]
        prod = [p["feature"]["name"] for p in v.get("produces", []) if isinstance(p.get("feature"), dict)]
        out.append({"id": vid, "cards": cards, "req": req[:3], "prod": prod[:3],
                    "pop": v.get("popularity") or 0,
                    "miss": [c for c in cards if norm(c) not in have]})
    out.sort(key=lambda c: -c["pop"])
    return {"n": len(out), "list": out[:keep]}

def combos_for_commander(m, owned, cache, refresh):
    ci, me = set(m["ci"]), norm(m["name"])
    pool = sorted(x["name"] for k, x in owned.items()
                  if k != me and set(x["ci"]) <= ci and x["commander_legal"])
    key = slugify(m["name"]) + ":" + hashlib.md5("\n".join(pool).encode()).hexdigest()[:10]
    if not refresh and key in cache: return cache[key]
    res = csb_find([m["name"]], pool)
    if res is None: return None            # don't cache failures
    have = set(owned)
    own = compact_combos(res.get("included", []), have, 30)
    near = compact_combos(res.get("almostIncluded", []), have, 20)
    out = {"own": own["list"], "n_own": own["n"], "near": near["list"], "n_near": near["n"]}
    cache[key] = out
    return out

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
    deck_keys = {norm(n) for _, n in allc}
    cards_out, gaps = [], []
    for q, n in main:
        m = meta(n)
        have = n.split(" // ")[0] in BASIC_NAMES or norm(n) in owned
        cards_out.append([T.add(m["name"] if m else n, m), 1 if have else 0, q])
    for _, n in sorted(nonbasic, key=lambda x: (-rate_of(norm(x[1])), x[1])):
        if norm(n) in owned: continue
        mm = meta(n)
        subs = find_subs(mm, rate_of, pool, by_role, deck_keys, True, 3) if mm else []
        gaps.append([T.add(mm["name"] if mm else n, mm), round(rate_of(norm(n)) * 100),
                     [[T.add(sm["name"], sm), why] for _, _, sm, why in subs], -1, role_text(mm)])
    combos = None
    if do_combos:
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
:root{--bg:#111827;--ink:#e5e7eb;--mut:#9ca3af;--line:#374151;--acc:#2dd4bf;--card:#1f2937;--bar:#374151;--fill:#a78bfa}
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
.bk{font-size:.75rem;padding:3px 8px;border:1px solid var(--line);border-radius:6px;color:var(--mut)}.bk.on{border-color:var(--acc);color:var(--ink)}
.profile h4{margin:10px 0 6px;font-size:.85rem;color:var(--mut)}
.bars{display:grid;grid-template-columns:1fr auto;gap:2px 8px;align-items:center;max-width:420px}
.seg{height:7px;background:var(--bar);border-radius:3px;overflow:hidden}.sf{height:100%;background:var(--acc)}
.sl{font-size:.75rem;color:var(--mut);font-variant-numeric:tabular-nums}
.ks{color:var(--acc)}.kf{color:var(--fill)}
.vbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:16px 0 4px;padding-top:12px;border-top:1px solid var(--line)}
.vbar h3{margin:0 8px 0 0;font-size:1rem}
.legend{font-size:.75rem;color:var(--mut);display:flex;gap:6px;align-items:center;margin-left:auto}
.lg{display:inline-block;width:12px;height:12px;border-radius:3px;border:2px solid}.lg.s{border-color:var(--acc)}.lg.f{border-color:var(--fill)}.lg.m{background:#555;border-color:#555}
.grp h5{margin:14px 0 6px;font-size:.85rem;color:var(--mut);font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px}
.ct{position:relative;display:block;line-height:0;border-radius:6px}
img.c{width:100%;aspect-ratio:488/680;border-radius:4.75%/3.5%;background:var(--bar);object-fit:cover}
.ct.sub img.c{outline:3px solid var(--acc);outline-offset:-2px}
.ct.fill img.c{outline:3px solid var(--fill);outline-offset:-2px}
.ct.miss img.c{filter:grayscale(1) brightness(.5)}
.badge{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.8);color:#fff;font:700 .75rem/1 system-ui;padding:4px 6px;border-radius:4px}
.note{position:absolute;left:4px;right:4px;bottom:6px;background:rgba(0,0,0,.82);color:#fff;font:600 .65rem/1.25 system-ui;padding:3px 5px;border-radius:4px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gap{display:flex;gap:10px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line);flex-wrap:wrap}
.alt{width:122px;display:flex;flex-direction:column;gap:4px}.alt small{font-size:.72rem;line-height:1.3;color:var(--mut)}
.arrow{align-self:center;font-size:1.4rem;color:var(--mut)}
.adv{flex:1;min-width:180px;align-self:center;color:var(--mut);font-size:.85rem;margin:0}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
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
<div class="slider"><label for="br">Bracket</label><input id="br" type="range" min="0" step="1" value="0"><span id="bv"></span></div>
<div class="tools">
<input id="q" type="search" placeholder="Search commanders" aria-label="Search">
<select id="th" aria-label="Archetype"><option value="">Any archetype</option></select>
<select id="c" aria-label="Color"><option value="">Any color</option><option>W</option><option>U</option><option>B</option><option>R</option><option>G</option></select>
<select id="p" aria-label="Min owned"><option value="0">Any %</option><option value="40">40%+</option><option value="60">60%+</option><option value="80">80%+</option></select>
<select id="dk" aria-label="Min decks"><option value="0">Any deck count</option><option value="20">20+ decks</option><option value="100">100+ decks</option><option value="500">500+ decks</option><option value="1000">1000+ decks</option><option value="5000">5000+ decks</option></select>
<select id="cf" aria-label="Combos"><option value="">Any combos</option><option value="own">Owns 1+ combo</option><option value="skel">Combo in deck</option></select>
<select id="so" aria-label="Sort"><option value="pct">Sort: % owned</option><option value="decks">Sort: deck count</option><option value="combos">Sort: combos owned</option></select>
</div>
<div id="imp"></div>
<div id="count"></div>
<div id="list"></div>
</main><img id="pv" alt=""><script>
const DATA=__DATA__, BR=__BR__, ST=__STATS__, DECKS=__DECKS__, CARDS=__CARDS__;
const LBL={all:"All decks",exhibition:"B1 Exhibition",core:"B2 Core",upgraded:"B3 Upgraded",optimized:"B4 Optimized",cedh:"B5 cEDH"};
const PIP={W:"#e8e2c8",U:"#7fb3e0",B:"#6b5f73",R:"#e07a5f",G:"#7bb274"};
const GL={Creature:"Creatures",Planeswalker:"Planeswalkers",Battle:"Battles",Instant:"Instants",Sorcery:"Sorceries",Artifact:"Artifacts",Enchantment:"Enchantments",Land:"Lands",Other:"Other"};
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const n=v=>Number(v).toLocaleString();
const front=i=>CARDS[i][0].split(" // ")[0];
DATA.forEach((d,i)=>d.i=i);
$("stats").innerHTML=`<li><strong>${n(ST.cards)}</strong>cards</li><li><strong>${n(ST.unique)}</strong>unique</li><li><strong>${ST.cands}</strong>commanders</li><li><strong>${DATA.length}</strong>analyzed</li>`;
const br=$("br"); br.max=BR.length-1;
const themes=new Set(); DATA.forEach(d=>d.tags.slice(0,3).forEach(t=>themes.add(t[0])));
[...themes].sort().forEach(t=>{const o=document.createElement("option");o.value=o.textContent=t;$("th").appendChild(o);});
const pips=ci=>ci.length?ci.map(c=>`<i class="pip" style="background:${PIP[c]}">${c}</i>`).join(""):`<i class="pip" style="background:#bbb">C</i>`;
const bk=()=>BR[+br.value];

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
      cls:{s:"sub",f:"fill",m:"miss"}[it.kind]||"",badge:(it.n||1)>1?"×"+it.n:"",
      note:it.kind==="s"&&it.f>=0?"for "+front(it.f):it.kind==="f"?"role fill":it.kind==="m"?"missing":""})).join("")+`</div></div>`;});
  return h;}
function gapsHTML(gaps,deckSet){
  if(!gaps.length) return `<p class="dim">No gaps: you own every popular card.</p>`;
  return gaps.map(([i,r,subs,used,roles])=>{
    const alts=subs.map(([s,why])=>`<div class="alt">${tile(s,{cls:s===used?"sub":"",note:s===used?"in your deck":deckSet.has(s)?"already in deck":""})}<small>${esc(why)}</small></div>`).join("");
    const adv=subs.length?"":`<p class="adv">No close match in your collection for this ${esc(roles||"synergy")} slot.${r>=25?" It's a core card for this commander, worth picking up.":" The deck fills this slot with other cards you own."}</p>`;
    return `<div class="gap"><div class="alt">${tile(i,{cls:"miss",note:r?r+"% of decks":"missing"})}<small>${esc(roles||"synergy piece")}</small></div><span class="arrow" aria-hidden="true">→</span>${alts}${adv}</div>`;}).join("");}
function deckSection(title,cmdrs,items,text,link){
  return `<div class="vbar"><h3>${title}</h3><button class="vt on" data-v="cards">Cards</button><button class="vt" data-v="list">List</button><button class="cp">Copy list</button>${link||""}
  <span class="legend"><i class="lg s"></i>substitute <i class="lg f"></i>role fill <i class="lg m"></i>missing</span></div>
  <div class="view v-cards">${grid(cmdrs,items)}</div>
  <div class="view v-list" hidden><textarea readonly rows="16">${esc(text)}</textarea></div>`;}

/* ---------- combos ---------- */
function comboHTML(C,inSkel,labOwn,labNear){
  if(!C) return '<h4>Combos</h4><p class="dim">Combo data unavailable (rerun to retry).</p>';
  const inS=new Set(inSkel||[]);
  const own=[...C.own].sort((a,z)=>inS.has(z.id)-inS.has(a.id));
  const li=c=>`<li><a href="https://commanderspellbook.com/combo/${esc(c.id)}/" target="_blank" rel="noopener">${c.cards.map(x=>c.miss.includes(x)?`<b class="miss">${esc(x)}</b>`:esc(x)).join(" + ")}</a>${c.req.length?` <small>+ ${c.req.map(esc).join(", ")}</small>`:""}${inS.has(c.id)?' <span class="tag">in deck</span>':""}<br><small>${c.prod.map(esc).join(" · ")}</small></li>`;
  const more=(k,l)=>k>l?`<li class="dim">+${k-l} more on Commander Spellbook</li>`:"";
  return `<div class="vbar"><h3>Combos</h3></div><div class="cols"><div><h4>${labOwn} (${C.n_own})</h4><ul class="cl">${own.map(li).join("")||"<li>None found</li>"}${more(C.n_own,C.own.length)}</ul></div>
  <div><h4>${labNear} (${C.n_near}) <small>missing card in red</small></h4><ul class="cl">${C.near.map(li).join("")||"<li>None found</li>"}${more(C.n_near,C.near.length)}</ul></div></div>`;}

/* ---------- commander rows ---------- */
function body(d,b){
  const x=d.b[b], tot=d.b.all.decks||1, pre=b==="all"?"":"/"+b;
  const tags=d.tags.slice(0,3).map(t=>`<a class="tag" href="https://edhrec.com/commanders/${d.slug}${pre}/${t[1]}" target="_blank" rel="noopener">${esc(t[0])} · ${Math.round(100*t[2]/tot)}%</a>`).join("")||'<span class="tag dim">no themes found</span>';
  const bks=BR.filter(k=>d.b[k]).map(k=>`<span class="bk ${k===b?"on":""}">${LBL[k]}: ${d.b[k].pct}% <small>(${n(d.b[k].decks)})</small></span>`).join("");
  const p=x.pw, bars=[["Speed",p.speed],["Interaction",p.interaction],["Ramp",p.ramp],["Draw",p.draw],["Tutor",p.tutor],["Combo",p.combo],["Game Changers",p.gc]]
    .map(([l,v])=>`<div class="seg"><div class="sf" style="width:${v*10}%"></div></div><span class="sl">${l} ${v}</span>`).join("");
  const deckSet=new Set(x.deck.map(r=>r[0]));
  const items=x.deck.map(([i,k,f])=>({i,kind:k,f})).concat(x.basics.map(([i,c])=>({i,kind:"",n:c})));
  const text=["Commander","1 "+front(d.cidx),"","Deck",...x.deck.map(([i])=>"1 "+front(i)),...x.basics.map(([i,c])=>c+" "+front(i))].join("\n")+"\n";
  return `<div class="top">${d.img?`<img class="cimg" src="${esc(d.img)}" alt="${esc(d.name)}" loading="lazy">`:""}
  <div class="info"><div class="tags">${tags}</div><div class="bks">${bks}</div>
  <p>You own <strong>${x.own_n}</strong> of the top <strong>${x.tmpl_n}</strong> cards in ${n(x.decks)} ${LBL[b]} decks.
  Deck: ${x.rec} popular + <span class="ks">${x.subs} substitutes</span> + <span class="kf">${x.fill} role fill</span>. Avg MV ${x.cmc}.</p>
  <p>Game Changers: ${x.gc} (${x.gcn.map(esc).join(", ")||"none"}). Combos in deck: ${(x.cin||[]).length}${x.c2?` (${x.c2} two-card)`:""}.</p>
  <div class="profile"><h4>Power profile (deck)</h4><div class="bars">${bars}</div></div></div></div>
  ${deckSection("Your deck",[d.cidx],items,text,`<a href="https://edhrec.com/commanders/${d.slug}${pre}" target="_blank" rel="noopener">EDHREC</a>`)}
  <div class="vbar"><h3>Gaps &amp; substitutes</h3><span class="dim">${x.n_miss} popular cards missing, top ${x.gaps.length} shown</span></div>
  ${gapsHTML(x.gaps,deckSet)}
  ${comboHTML(d.combos,x.cin,"Combos in your collection","One card away")}`;}

function render(){
  const b=bk(); $("bv").textContent=LBL[b];
  const q=$("q").value.toLowerCase(), c=$("c").value, p=+$("p").value, dk=+$("dk").value, th=$("th").value, cf=$("cf").value;
  const nc=d=>d.combos?d.combos.n_own:0;
  const rows=DATA.filter(d=>{const x=d.b[b]; return x&&d.name.toLowerCase().includes(q)&&(!c||d.ci.includes(c))
    &&x.pct>=p&&x.decks>=dk&&(!th||d.tags.slice(0,3).some(t=>t[0]===th))
    &&(!cf||(cf==="own"?nc(d)>0:(x.cin||[]).length>0));});
  const so=$("so").value;
  rows.sort(so==="decks"?(a,z)=>z.b[b].decks-a.b[b].decks:so==="combos"?(a,z)=>nc(z)-nc(a)||z.b[b].pct-a.b[b].pct:(a,z)=>z.b[b].pct-a.b[b].pct);
  $("count").textContent=`${rows.length} commanders with ${LBL[b]} data`;
  $("list").innerHTML=rows.map(d=>{const x=d.b[b]; return `<details class="row" data-i="${d.i}"><summary>
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

/* ---------- events ---------- */
document.addEventListener("toggle",e=>{const r=e.target; if(!r.matches||!r.matches("details.row")||!r.open||r.dataset.f)return;
  r.querySelector(".body").innerHTML=r.dataset.k!=null?ibody(DECKS[+r.dataset.k]):body(DATA[+r.dataset.i],bk()); r.dataset.f=1;},true);
document.addEventListener("click",e=>{const t=e.target;
  if(t.classList.contains("vt")){const bd=t.closest(".body");
    bd.querySelectorAll(".vt").forEach(x=>x.classList.toggle("on",x===t));
    bd.querySelectorAll(".view").forEach(v=>v.hidden=!v.classList.contains("v-"+t.dataset.v));}
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

def render_report(results, stats, brackets, decks, cards):
    return (HTML.replace("__DATA__", js_data(results))
                .replace("__BR__", json.dumps(["all"] + brackets))
                .replace("__STATS__", json.dumps(stats))
                .replace("__DECKS__", js_data(decks))
                .replace("__CARDS__", js_data(cards)))

# -------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", required=True)
    ap.add_argument("--out", default=".")
    ap.add_argument("--brackets", default="core,upgraded,optimized,cedh")
    ap.add_argument("--only", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--no-open", action="store_true")
    ap.add_argument("--no-combos", action="store_true")
    ap.add_argument("--decks-in", default="decks_in")
    ap.add_argument("--offline", action="store_true")
    a = ap.parse_args()
    if a.offline and a.refresh: ap.error("--offline and --refresh can't be combined")
    global OFFLINE
    OFFLINE = a.offline
    brackets = [b for b in VALID_BRACKETS if b in {x.strip().lower() for x in a.brackets.split(",")}]

    cache_dir = os.path.join(a.out, "cache")
    coll = load_collection(a.csv)
    print(f"Collection: {len(coll)} printings, {sum(q for _, q in coll.values())} cards")
    meta = enrich_scryfall(list(coll), os.path.join(cache_dir, "scryfall.json"), a.refresh)
    owned = {}
    for sid in coll:
        m = meta.get(sid)
        if m and m["layout"] not in ("token", "emblem") and m["name"] not in BASIC_NAMES:
            owned[norm(m["name"])] = m
    ROLE_TAGS.update(fetch_role_tags(os.path.join(cache_dir, "role_tags.json"), a.refresh))

    cands = []
    for m in owned.values():
        front = m["type_line"].split(" // ")[0]
        if m["commander_legal"] and "Legendary" in front and \
           ("Creature" in front or "can be your commander" in m["oracle"].lower()):
            cands.append(m)
    cands.sort(key=lambda m: m["name"])
    if a.only:
        wanted = {norm(x) for x in a.only.split(";") if x.strip()}
        cands = [m for m in cands if norm(m["name"]) in wanted]
    if a.limit: cands = cands[:a.limit]
    print(f"Commander candidates: {len(cands)} | brackets: {', '.join(brackets)}")

    # pass 1: EDHREC pages
    edh_path = os.path.join(cache_dir, EDH_CACHE)
    cache = load_edhrec_cache(cache_dir, a.refresh)
    pages, skipped = {}, 0
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
        if i % 25 == 0:
            save_json(edh_path, cache); print(f"[{i}/{len(cands)}] EDHREC pages loaded")
    save_json(edh_path, cache)

    # Scryfall data for popular cards you don't own (needed to find substitutes)
    want = set()
    for pg in pages.values():
        for p in pg.values():
            for k, (name, rate, *_) in p["cards"].items():
                if rate >= 0.10 and k not in owned and name not in BASIC_NAMES: want.add(name)
    name_meta = resolve_names(want, os.path.join(cache_dir, "scryfall_names.json"), a.refresh)

    # pass 2: build decks, substitutes, combos
    csb_path = os.path.join(cache_dir, "spellbook.json")
    csb_cache = {} if a.refresh else load_json(csb_path)
    T, results = CardTable(), []
    done = [m for m in cands if m["name"] in pages]
    for i, m in enumerate(done, 1):
        pg = pages[m["name"]]
        pool_info = build_pool(set(m["ci"]), owned, norm(m["name"]))
        entry = {"name": m["name"], "ci": sorted(m["ci"]), "img": m.get("img", ""),
                 "slug": slugify(m["name"]), "tags": pg["all"]["tags"], "cidx": T.add(m["name"], m),
                 "b": {b: analyze(m, p, owned, name_meta, pool_info, b, T) for b, p in pg.items()}}
        entry["combos"] = None if a.no_combos else combos_for_commander(m, owned, csb_cache, a.refresh)
        for x in entry["b"].values():
            names = x.pop("_names")
            inside = [c for c in (entry["combos"] or {}).get("own", [])
                      if all(norm(nm) in names for nm in c["cards"])]
            x["cin"] = [c["id"] for c in inside]
            x["c2"] = sum(1 for c in inside if len(c["cards"]) <= 2)
            x["pw"]["combo"] = max(0, min(10, len(inside) * 3))
        results.append(entry)
        if i % 10 == 0: save_json(csb_path, csb_cache)
        al = entry["b"]["all"]
        print(f"[{i}/{len(done)}] {m['name']}: {al['pct']}% | {al['subs']} subs | "
              + (f"{entry['combos']['n_own']} combos" if entry["combos"] else "combos n/a"))
    save_json(csb_path, csb_cache)

    # imported decklists
    decks = []
    files = sorted(glob.glob(os.path.join(a.decks_in, "*.txt")))
    if files:
        print(f"\nImported decks: {len(files)} in {a.decks_in}")
        extra = set()
        for fp in files:
            c_, m_ = parse_decklist(fp)
            extra |= {nm for _, nm in c_ + m_ if norm(nm) not in owned}
        name_meta = resolve_names(extra, os.path.join(cache_dir, "scryfall_names.json"))
        for fp in files:
            d = analyze_imported(fp, owned, name_meta, not a.no_combos, cache, T)
            decks.append(d)
            print(f"  {d['title']}: {d['pct']}% owned, {len(d['gaps'])} missing"
                  + (f", {d['combos']['n_own']} combos" if d["combos"] else ""))
        decks.sort(key=lambda d: -d["pct"])
    else:
        os.makedirs(a.decks_in, exist_ok=True)

    os.makedirs(os.path.join(a.out, "decks"), exist_ok=True)
    for r in results:
        for b, x in r["b"].items():
            with open(os.path.join(a.out, "decks", f"{r['slug']}_{b}.txt"), "w", encoding="utf-8") as f:
                f.write(x.pop("arena"))
    stats = {"cards": sum(q for _, q in coll.values()), "unique": len(owned), "cands": len(cands)}
    out_html = os.path.join(a.out, "report.html")
    with open(out_html, "w", encoding="utf-8") as f:
        f.write(render_report(results, stats, brackets, decks, T.rows))
    no_tags = sum(1 for r in results if not r["tags"])
    print(f"\nDone. {len(results)} analyzed, {skipped} had no EDHREC page, {no_tags} without theme tags."
          f"\nReport: {os.path.getsize(out_html) / 1e6:.1f} MB -> {out_html}")
    if not a.no_open:
        webbrowser.open("file://" + os.path.abspath(out_html))

if __name__ == "__main__":
    main()
