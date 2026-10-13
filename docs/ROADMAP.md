# CollectionHub roadmap: collection-first Commander plan

Source: Guillermo's 15-section plan (2026-10-12). Save point before this work: tag/branch `v1-save-point` (53d02a3).
Plan work happens on `plan/collection-first`; merged to `main` only when Guillermo approves.

Status: ✅ done · 🟡 in progress / partial · ⛔ blocked · ⬜ not started

## Audit baseline (2026-10-12, plan branch at 53d02a3)

| Check | Result |
|---|---|
| Type check `npx tsc -b` | ✅ clean |
| Unit tests `npm test` | ✅ 18/18 (importers, compare, subs, salt) |
| Production build `npm run build` | ✅ (one 636 kB JS chunk, warning only) |
| Lint | ⬜ no linter configured |
| End-to-end tests | ⬜ none; manual checks in the browser at 390 / 1440 px |

Stack: Vite 6 + React 19 + TypeScript, Dexie (IndexedDB) as the local source of truth, optional Supabase sync
(snapshot push/pull, row-level security), PWA (vite-plugin-pwa), Vercel. Data: Scryfall (cards, prices, images),
EDHREC JSON (commander, average-deck, salt pages), Frankfurter/ECB (USD→CAD). No backend of our own.

## Decisions already made

- Midnight Override stays the visual identity.
- 5.1: check brackets 3, 4, 5 × every budget; build the combination where the binder owns the most cards.
- Decks are virtual and may share cards. When decks together need more copies than owned, alert:
  "You'll need 1 more copy of X to have it in all decks".
- Collection Match stays in the commander header (As Commander view stays hidden).
- Deck Simulator and Analytics live inside the hidden ≡ menu, not as new visible tabs.
- Known limits, stated rather than faked: Moxfield import = pasted text only; prices are USD converted to CA$;
  value history starts from the first snapshot (today); card scanning likely needs a paid service.

## Already shipped (verified 2026-10-12)

- ✅ Google, GitHub and email sign-in + device sync (owner confirmed Google; migrations 002/003 run).
- ✅ Collection grid/list, quantity editing (− n +), group by set, hide empty sets, QTY label + taped prices.
- ✅ Card links: commander image → EDHREC; owned cards → Scryfall; missing cards → swap note + Scryfall.
- ✅ Deck price (whole + missing) on commander and deck pages and the deck list; deck note + tags (synced); salt
  (EDHREC top-1,000 salt list, sum; cards outside it count 0, stated in the UI).
- ✅ Commander page: deck price and salt moved from the white strip to under the commander's name (`HeroStats`); the
  strip keeps bracket, budget, collection match, missing cost and Save.
- 🟡 Top ticker banner: Discover page only, fixed slogans, decorative (aria-hidden). Not yet on every page, no
  updates / collection insights.

## Priority 0: security and data safety (do first)

- ⛔ **Leaked Google OAuth client secret** in `google sc.png` (committed 50fb302, private repo). File removed from the
  branch tip; it stays in history and in `v1-save-point`. Needs Guillermo: rotate the secret in Google Cloud and paste
  the new one into Supabase › Authentication › Google. Rewriting history (force push) only if he asks.
- ✅ Sync safety (phase 3a.1): Push refuses to send an empty device over a full cloud and Pull refuses an empty cloud
  over a full device (`syncRisk`, tested). Push now inserts the new copy first and deletes the old rows (ids up to the
  previous maximum) only after everything arrived; a failure removes the half-sent rows instead. Pull keeps a backup of
  this device first, and the sync panel offers UNDO LAST PULL. Not tested end-to-end against Supabase from here (needs
  a signed-in account); the guard logic is unit-tested.

## Priority 1: core collection and deck building

1. 🟡 Collection storage audit. Entries are per printing (`cardId` + set + number + foil), imports merge duplicates in
   one transaction. Missing per-entry: language, etched/other finishes, condition.
2. ✅ Copies across decks (phase 3a.2). Decks stay virtual lists that may share cards. `shortfalls()` (lib/copies,
   tested) adds up the copies all saved decks use per card and compares them with the copies owned; basics skipped,
   cards owned 0 times are "missing" instead. Alert "You'll need N more copies of X to have it in all decks" on the
   Decks page, on each deck (its own cards) and on the commander page (as if you built this deck too; saved decks of the
   same commander count as this deck). Ownership ignores cards Scryfall marks not legal in Commander (tokens, Un-cards,
   banned); the Collection page says how many. Not done: a per-card "available copies" column (comes with filters, item 3).
3. 🟡 Collection organisation/editing: search by name, set grouping, qty edit done. Missing: sort, filters (colour,
   type, rarity, MV, price, foil, in deck / not in deck).
4. ✅ Valuation (phase 3a.3). One stated method (`PRICE_METHOD`, in every price tooltip): cards you own = your
   printing and finish (foil copies use Scryfall's foil, else etched price; non-foil when no foil price exists); deck
   price, missing cost and buy lists = the cheapest paper printing (non-foil first). "Scryfall prices fetched <dates>"
   under the binder value, both deck prices and the TO BUY receipt (`fetchedNote`, tested). Collection prices older than
   a week are fetched again when the Collection opens (they never refreshed before). Every cached card is fetched once
   more to pick up foil prices (card-data version `pv` 2). Also fixed: a text line naming its printing ("1x Sol Ring (CMM)
   410 *F*") was matched to whichever printing of that name was cached; it now gets the named printing. Entries imported
   from text before this fix may point at another printing (ManaBox CSV imports use Scryfall ids and were fine);
   re-import such a list to correct it.
5. ✅ Collection Match in the commander header (owned of total, %, missing, missing cost) + copies alert.
6. ⬜ Suggested Deck (5.1): scan B3/B4/B5 × budgets, pick the most-owned page, build a 100-card deck from owned cards
   first, fill gaps with owned substitutes, list purchases separately.
7. 🟡 My Decks: import text, view, price, missing, note/tags, export, delete. Deck page rebuilt (Moxfield-like):
   commander-style header (commander art, ransom name, pips, price · salt · bracket under the name, owned %), grid/list,
   group by type or mana value with counts, analysis panel (cost to complete, mana curve, types, colour pips, a short
   read against the usual 35–38 lands / 9–12 ramp / 9–12 draw / 7–10 removal / 2–4 wipes; roles counted from rules
   text). Missing: edit, rename, duplicate, create from scratch; cards the import couldn't match are dropped.
8. ⬜ Legality and completeness: 100 cards, singleton, colour identity, banned, commander legality.
9. 🟡 Owned vs missing is shown everywhere (colour vs greyed, TO BUY receipt); purchases not yet a separate section of a
   generated deck.

## Priority 2: data quality and analysis

1. 🟡 EDHREC attribution: deck counts shown on commander pages; timestamp, archetype size and inclusion % per card not
   shown.
2. 🟡 Pricing: provider (TCGplayer via Scryfall), rate (ECB, date), method and fetch dates shown. Missing: Scryfall's
   own update time (not in its API), original USD next to CA$.
3. 🟡 Salt ✅ (EDHREC). Bracket estimate ✅ on the deck page (`bracketOf`, tested): Game Changers (Scryfall
   `is:gamechanger`, cached a week), mass land denial, extra turns, tutors; floor II, never V; reasons shown.
   Two-card combos (Commander Spellbook) ⬜.
4. ⬜ Advanced collection search (Scryfall-style fields we actually store; no full query language).
5. ⬜ Collection analytics + daily value snapshots (history starts at the first snapshot) — in the ≡ menu.
6. ⬜ Deck Simulator (opening hands, mulligans, draws, exact hypergeometric odds, Monte Carlo with a seed) — in ≡.
7. 🟡 Tests: importers, ownership, substitutes, salt. Missing: allocation, valuation, currency, deck validation,
   bracket, simulator.

## Priority 3: integrations and usability

1. 🟡 External links: EDHREC and Scryfall done. Commander Spellbook, Moxfield, Archidekt search links ⬜ (links only;
   no Moxfield API, Archidekt read API undocumented).
2. ⬜ Custom lists (trade, buy, reserved, upgrade, sell, wishlist, custom) without duplicating entries.
3. 🟡 Presentation modes: grid, list, by set done; compact grid, by colour, by value ⬜.
4. 🟡 Banner + animations: ticker on Discover, page animations, reduced motion respected; banner on every page with
   real updates ⬜.
5. ✅ Google sign-in and sync. ⬜ Sync of new data (lists, prefs, snapshots, simulator configs).
6. ⬜ Card scanning: investigate only (needs an image-recognition service; likely paid).
7. 🟡 Docs: README covers setup, sync, data. Add a linter and keep this file current.

## Recommended first implementation phase

**Phase 3a — ownership, allocation and valuation core** (Priority 0 sync safety + P1 items 2 and 4):
one `copies` model (owned per card, needed per deck, shortfall across decks), the "need N more copies" alert in
Decks and the commander page, foil-correct prices with one documented method, sync guards against empty-cloud Pull.
Tests for each. The Suggested Deck (P1.6) builds on this, so it comes next.
