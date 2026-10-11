"""Regression checks for off-colour abilities (colour_status / live_view / pins). Offline, cache/ only, ~20 s.
Usage: python tests/check_offcolour.py"""
import glob, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import deck_wizard as dw

fails = []
def check(ok, what):
    print(("  ok    " if ok else "  FAIL  ") + what)
    if not ok: fails.append(what)
def card(name, text, ci=()):
    return {"name": name, "ci": list(ci), "oracle": text, "type_line": "Artifact", "keywords": [], "produced": []}
G, W, UB = {"G"}, {"W"}, {"U", "B"}

print("Plural land types never raise (group is singular):")
for word in ("Plains", "Islands", "Swamps", "Mountains", "Forests", "Island", "Swamp", "Mountain", "Forest"):
    try:
        st = dw.colour_status(card("Test " + word, f"Creatures you control get +1/+1 for each {word} you control."), {"C"})[0]
        check(st == "inactive", f"'{word} you control' outside its colour -> {st}")
    except KeyError as e:
        check(False, f"'{word}' raised KeyError {e}")
check(dw.colour_status(card("Test Mix", "Spells you cast cost {1} less for each Islands and Swamps you control."), UB)[0] == "active",
      "'Islands and Swamps' inside U/B stays active")

print("Gating colour clause beats 'target':")
s = "Whenever you cast a black spell, target opponent loses 1 life."
check(dw.dead_sentence(s.lower(), G), f"dead in mono-G: {s}")
check(not dw.dead_sentence(s.lower(), {"B"}), "live in mono-B")
s2 = "As long as you control an Island, target creature you control has flying."
check(dw.dead_sentence(s2.lower(), G), f"dead in mono-G: {s2}")
print("Targeted effect stays active (colour clause doesn't gate it):")
s3 = "Return target creature and all white Auras you own attached to it to their owners' hands."
check(not dw.dead_sentence(s3.lower(), {"U"}), f"live in mono-U: {s3}")
s4 = "{2}, {T}: Gain control of target creature with power less than or equal to the number of Islands you control for as long as you control this artifact."
check(not dw.dead_sentence(s4.lower(), {"R"}), "live in mono-R: Shackles-style steal")

print("Your cards:")
dw.OFFLINE = True
csv = max(glob.glob("collection/*.csv"), key=os.path.getmtime)
_, owned, _ = dw.load_owned(csv, "cache")
dw.fetch_keyword_catalog("cache/keywords.json"); dw.prepare_types(owned.values())
def st(k, ci): return dw.colour_status(owned[k], ci)[0] if k in owned else "not owned"
check(st("jet medallion", G) == "inactive" and st("jet medallion", {"B"}) == "active", "Jet Medallion: inactive in G, active in B")
check(st("bontu's monument", G) == "partial" and st("bontu's monument", {"B"}) == "active", "Bontu's Monument: partial in G, active in B")
v = dw.live_view(owned["bontu's monument"], G)
check("creature spell" in v["oracle"] and "black" not in v["oracle"].lower(), "Bontu's live text keeps the drain, drops the cost cut")
check(st("god-pharaoh's faithful", W) == "inactive" and st("god-pharaoh's faithful", {"W", "B"}) == "active",
      "God-Pharaoh's Faithful: inactive in mono-W, active in W/B")

print("Pin overrides an inactive card:")
edh = dw.load_edhrec_cache("cache"); name_meta = dw.resolve_names(set(), "cache/scryfall_names.json")
tro = next(c for c in dw.commander_candidates(owned) if c["name"].startswith("Trostani, Selesnya"))
page, ci = edh[dw.slugify(tro["name"])], set(tro["ci"])
pool = dw.build_pool(ci, owned, dw.norm(tro["name"]))
check("jet medallion" not in {it[0] for it in pool[0]}, "Jet Medallion not in Trostani's pool")
for pins, want in ((None, None), (({"jet medallion"}, ()), "k")):
    T = dw.CardTable()
    x = dw.analyze(tro, page, owned, name_meta, pool, "all", T, page, None, pins=pins)
    got = next((e[1] for e in x["deck"] if T.rows[e[0]][0] == "Jet Medallion"), None)
    check(got == want, f"Trostani {'pinned' if pins else 'no pin'}: Jet Medallion -> {got or 'out'}")

print("\n" + ("ALL PASS" if not fails else f"{len(fails)} FAILED"))
sys.exit(1 if fails else 0)
