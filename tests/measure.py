#!/usr/bin/env python3
"""
Deck-quality numbers for every cached commander, offline (cache/ only, no network).
Used to compare deckbuilding versions: run before and after a change, diff the summaries.

Usage:  py tests/measure.py --csv "Collection_ (1).csv" --save tests/baseline_v5.json
        py tests/measure.py --csv "Collection_ (1).csv" --compare tests/baseline_v5.json
Combos come from the Spellbook cache (a colour identity without a cached answer gets none).
"""
import argparse, json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import deck_wizard as dw

GC_CAP = {"exhibition": 0, "core": 0, "upgraded": 3}
ROLES = ["ramp", "draw", "removal", "wipe", "counter", "tutor"]
NUM = ["size", "popular", "picks", "combo_pieces", "subs", "fill", "basics", "nonbasic_lands",
       "owned_lands", "avg_mv", "gc", "pct", "on_list", "low_rate", "avg_syn", "combos_in"] + ROLES
CHECKS = ["bad_size", "dupes", "off_color", "illegal", "gc_over_cap"]

def setup(csv_path):
    dw.OFFLINE = True
    coll = dw.load_collection(csv_path)
    meta = dw.enrich_scryfall(list(coll), "cache/scryfall.json")
    owned = {}
    for sid in coll:
        m = meta.get(sid)
        if m and m["layout"] not in ("token", "emblem") and m["name"] not in dw.BASIC_NAMES:
            owned[dw.norm(m["name"])] = m
    dw.ROLE_TAGS.update(dw.fetch_role_tags("cache/role_tags.json"))
    name_meta = dw.resolve_names(set(), "cache/scryfall_names.json")
    dw.prepare_types(list(owned.values()) + [x for x in name_meta.values() if x])
    edh = dw.load_edhrec_cache("cache")
    combos = dw.load_json("cache/spellbook.json")
    combo_cards = dw.fetch_combo_cards("cache/spellbook_cards.json")
    return owned, name_meta, edh, combos, combo_cards

def measure_deck(m, page, bracket, owned, name_meta, pool_info, base=None, combos=None):
    T = dw.CardTable()
    x = dw.analyze(m, page, owned, name_meta, pool_info, bracket, T, base, combos)
    ci, rate = set(m["ci"]), lambda k: (page["cards"].get(k) or (None, 0.0))[1]
    deck = [owned[dw.norm(T.rows[i][0])] for i, _, _ in x["deck"]]
    keys = [dw.norm(c["name"]) for c in deck]
    nonland = [c for c in deck if dw.card_kind(c) != "land"]
    basics = sum(c for _, c in x["basics"])
    r = {"size": len(deck) + basics,
         "popular": x["rec"], "picks": sum(1 for (i, k, _), c in zip(x["deck"], deck) if k == "y" and dw.card_kind(c) != "land"), "combo_pieces": x.get("cpc", 0), "subs": x["subs"], "fill": x["fill"], "basics": basics,
         "nonbasic_lands": len(deck) - len(nonland),
         "owned_lands": sum(1 for it in pool_info[0] if it[3] == "land"),
         "avg_mv": x["cmc"], "gc": x["gc"], "pct": x["pct"],
         "on_list": sum(1 for k in keys if rate(k) > 0),
         "low_rate": sum(1 for (i, kind, _), k in zip(x["deck"], keys) if kind == "p" and rate(k) < 0.05)}
    syn = [(page["cards"].get(k) or [0, 0, None])[2:3] for k, c in zip(keys, deck) if dw.card_kind(c) != "land"]
    syn = [v[0] if v and v[0] is not None else 0 for v in syn]
    r["avg_syn"] = round(sum(syn) / max(1, len(syn)), 4)
    names = set(keys) | {dw.norm(m["name"])}
    r["combos_in"] = sum(1 for c in combos or [] if all(dw.norm(n) in names for n in c["cards"]))
    for role in ROLES:
        r[role] = sum(1 for c in nonland if role in dw.roles_of(c))
    r["bad_size"] = int(r["size"] != 99)
    r["dupes"] = len(keys) - len(set(keys))
    r["off_color"] = sum(1 for c in deck if not set(c["ci"]) <= ci)
    r["illegal"] = sum(1 for c in deck if not c["commander_legal"])
    r["gc_over_cap"] = int(bracket in GC_CAP and x["gc"] > GC_CAP[bracket])
    return r

def run(csv_path):
    owned, name_meta, edh, csb, combo_cards = setup(csv_path)
    out = {}
    for m in sorted(owned.values(), key=lambda m: m["name"]):
        front = m["type_line"].split(" // ")[0]
        if not (m["commander_legal"] and "Legendary" in front and
                ("Creature" in front or "can be your commander" in m["oracle"].lower())): continue
        slug = dw.slugify(m["name"])
        base = edh.get(slug)
        if not base or not base["cards"]: continue
        pool_info = dw.build_pool(set(m["ci"]), owned, dw.norm(m["name"]))
        combos = (dw.combos_for_commander(m, owned, csb, combo_cards) or {}).get("own")
        for b in ["all"] + dw.VALID_BRACKETS:
            page = base if b == "all" else edh.get(f"{slug}/{b}")
            if page and page["cards"]:
                out[f"{m['name']}|{b}"] = measure_deck(m, page, b, owned, name_meta, pool_info, base, combos)
    return out

def summarize(res):
    by = {}
    for key, r in res.items(): by.setdefault(key.split("|")[1], []).append(r)
    summ = {}
    for b in ["all"] + dw.VALID_BRACKETS:
        rows = by.get(b)
        if not rows: continue
        s = {"decks": len(rows)}
        s.update({k: round(sum(r[k] for r in rows) / len(rows), 2) for k in NUM})
        s.update({k: sum(1 for r in rows if r[k]) for k in CHECKS})
        summ[b] = s
    return summ

def table(summ, base=None):
    cols = list(summ)
    print(f"{'metric':16}" + "".join(f"{c:>18}" for c in cols))
    for k in ["decks"] + NUM + CHECKS:
        cells = []
        for c in cols:
            v = summ[c][k]; cell = f"{v:g}"
            if base and c in base and k in base[c] and base[c][k] != v: cell = f"{base[c][k]:g} -> {v:g}"
            cells.append(f"{cell:>18}")
        print(f"{k:16}" + "".join(cells))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--save", help="write per-deck numbers + summary to this JSON file")
    ap.add_argument("--compare", help="baseline JSON to diff against")
    a = ap.parse_args()
    res = run(a.csv)
    summ = summarize(res)
    base = None
    if a.compare:
        with open(a.compare, encoding="utf-8") as f: base = json.load(f)["summary"]
    print("\nDeck metrics (averages; checks = number of decks failing)")
    table(summ, base)
    if a.save:
        with open(a.save, "w", encoding="utf-8") as f:
            json.dump({"summary": summ, "decks": res}, f, indent=1, sort_keys=True)
        print(f"\nSaved {len(res)} decks -> {a.save}")

if __name__ == "__main__":
    main()
