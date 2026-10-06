# Deck Wizard v1

Checks your ManaBox collection against EDHREC and builds a deck skeleton for every commander you own.

## Run it (Windows)
1. Install Python 3.9+ from python.org (tick "Add to PATH"). No other installs needed.
2. Put `deck_wizard.py` and `Collection_.csv` in one folder.
3. Open a terminal in that folder and run a small test first:
   `py deck_wizard.py --csv Collection_.csv --limit 10`
4. If it works, run everything (about 5 minutes the first time, seconds after that):
   `py deck_wizard.py --csv Collection_.csv`

Output: `report.html` (opens in your browser) and one text file per commander in `decks/`.
Single commander: `py deck_wizard.py --csv Collection_.csv --only "Sephiroth, Fabled SOLDIER"`

## Updating your collection
- Export your collection from ManaBox (CSV) into the `collection` folder and double-click
  `Update Deck Wizard.bat`. The newest CSV there is used automatically.
- Or double-click `Deck Wizard App.bat` and use the **Upload new collection CSV** button in the report.
  Keep its window open while you use it.
- The report shows which file was used and what changed (new cards, removed cards, new commanders).

## Notes
- Scryfall and EDHREC responses are cached in `cache/`, so reruns are fast. `--refresh` ignores the cache.
- EDHREC has no official API. The tool reads the same JSON the site uses, so it may break if they change it.
- The skeleton is a starting point: popular cards you own first, then fill cards chosen by role.
- Next up: Commander Spellbook combos, Archidekt decklists, power profile.
