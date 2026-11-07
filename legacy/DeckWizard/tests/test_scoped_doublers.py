"""Positive and negative checks for Oracle-text-scoped trigger-doubler links."""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import deck_wizard as dw

cards = {}
for filename in ("scryfall.json", "scryfall_names.json"):
    path = os.path.join(ROOT, "cache", filename)
    with open(path, encoding="utf-8") as f:
        for card in json.load(f).values():
            if card:
                cards.setdefault(dw.norm(card["name"]), card)
dw.prepare_types(list(cards.values()))

def links(doubler, card):
    d, c = cards[dw.norm(doubler)], cards[dw.norm(card)]
    providers = {i for i, side in dw.card_relations(d)
                 if side == "enable" and dw._ENG_RX[i][0].startswith("doubles")}
    return bool(providers & dw.doubler_cons(c))

cases = [
    ("Elesh Norn, Mother of Machines", "Trostani, Selesnya's Voice", True),
    ("Elesh Norn, Mother of Machines", "Archaeomancer", True),
    ("Elesh Norn, Mother of Machines", "Oblivion Ring", True),
    ("Elesh Norn, Mother of Machines", "Lotus Cobra", True),
    ("Elesh Norn, Mother of Machines", "Zulaport Cutthroat", False),
    ("Panharmonicon", "Trostani, Selesnya's Voice", True),
    ("Panharmonicon", "Archaeomancer", True),
    ("Panharmonicon", "Oblivion Ring", False),
    ("Panharmonicon", "Lotus Cobra", False),
    ("Ancient Greenwarden", "Lotus Cobra", True),
    ("Ancient Greenwarden", "Trostani, Selesnya's Voice", False),
    ("Ancient Greenwarden", "Archaeomancer", False),
    ("Naban, Dean of Iteration", "Snapcaster Mage", True),
    ("Naban, Dean of Iteration", "Archaeomancer", True),
    ("Naban, Dean of Iteration", "Mulldrifter", False),
    ("Harmonic Prodigy", "Snapcaster Mage", True),
    ("Harmonic Prodigy", "Mulldrifter", False),
    ("Twinflame Travelers", "Mulldrifter", True),
    ("Twinflame Travelers", "Archaeomancer", False),
    ("Echoes of Eternity", "Psychosis Crawler", False),  # colorless scope held for 5c
    ("Echoes of Eternity", "Archaeomancer", False),
    ("Drivnod, Carnage Dominus", "Zulaport Cutthroat", True),
    ("Drivnod, Carnage Dominus", "Archaeomancer", False),
    ("Krang, the All-Powerful", "Psychosis Crawler", True),
    ("Krang, the All-Powerful", "Faerie Mastermind", True),
    ("Krang, the All-Powerful", "Mulldrifter", False),
    ("Krang, the All-Powerful", "Elvish Visionary", False),
    ("Krang, the All-Powerful", "Wall of Omens", False),
    ("Krang, the All-Powerful", "Zulaport Cutthroat", False),
    ("Veyran, Voice of Duality", "Guttersnipe", True),
    ("Veyran, Voice of Duality", "Trostani, Selesnya's Voice", False),
    ("Dr. Beverly Crusher", "Ajani's Pridemate", True),
    ("Traveling Chocobo", "Lotus Cobra", True),
    ("Traveling Chocobo", "Trostani, Selesnya's Voice", False),
    ("Roaming Throne", "Trostani, Selesnya's Voice", False),
    ("Delney, Streetwise Lookout", "Archaeomancer", False),
]

for doubler, card, expected in cases:
    assert dw.norm(doubler) in cards and dw.norm(card) in cards, ("missing cached card", doubler, card)
    actual = links(doubler, card)
    assert actual == expected, (doubler, card, expected, actual)

elesh = cards[dw.norm("Elesh Norn, Mother of Machines")]
assert dw.commander_relation(elesh, cards[dw.norm("Trostani, Selesnya's Voice")])[0] == dw.FIT_ENGINE
assert dw.commander_relation(elesh, cards[dw.norm("Jirina, Dauntless General")])[0] == dw.FIT_ONCE
assert dw.commander_relation(elesh, cards[dw.norm("Loran of the Third Path")])[0] == dw.FIT_ONCE
assert not any(name == "doubles colorless triggers" for name, *_ in dw.ENGINES)
print(f"{len(cases)} scope cases and 3 repeatability/self-reference checks passed")
