# CollectionHub (DeckMage)

A Magic: The Gathering Commander app built around the cards you own: binders, EDHREC commander data, decks forged
from your collection, sync between devices. Owner: Guillermo (not a programmer: explain results in plain words).
Live: https://collection-hub-ashen.vercel.app (every merge to `main` deploys).

## Read first, every session

1. `docs/FEATURES.md` – what exists, its status and the tests that prove it. A Live feature is extended, never rebuilt.
2. `docs/DECISIONS.md` – choices already made with Guillermo. Follow them; don't re-ask or re-propose a rejected one.
3. `docs/MONOREPO.md` – how the folders of this repo fit together (what is active, what is reference only).
4. The code itself. Notes can be stale; the current `main` wins.

## Stack and commands

React 19 + TypeScript + Vite 6, Dexie (IndexedDB) as the local source of truth, PWA (vite-plugin-pwa), Vercel,
sync through a Cloudflare Worker (`worker/`). Scryfall and EDHREC are called from the browser; the rule-based brain
lives in `src/brain` (data files in `public/brain`, built by `scripts/`). No runtime AI.

```
npm ci
npm run dev            # http://localhost:5173
npx tsc -b             # type check
npm test               # unit tests (vitest, src/**/*.test.ts)
npm run test:screens   # browser checks (Playwright, e2e/): phone, tablet, desktop; Scryfall/EDHREC mocked
npm run build
```

CI (`.github/workflows/ci.yml`) runs all four checks on every pull request.

## How we work

- One feature or fix per pull request. Fill in the PR template's Checks section.
- A UI change adds or updates a check in `e2e/` (it runs at phone, tablet and desktop sizes). A logic or brain change
  adds a unit test next to the code.
- A feature counts as done only when CI is green on its PR's latest commit. Never skip or delete a test to get green.
- After a feature merges, update its row in `docs/FEATURES.md`; record any new agreed choice in `docs/DECISIONS.md`.
- Ask Guillermo first before: changing the Dexie schema or the sync snapshot format, adding a dependency, removing or
  replacing a working feature, or anything that could lose user data.
- User data is never lost: Dexie versions only add, imports never delete existing cards, sync never overwrites silently.
- Check every UI change at phone, tablet and desktop width. Dark mode only.
- Deck-building rules come from the Python Deck Wizard, now in `legacy/DeckWizard/` (read its `CLAUDE.md`); port its rules
  rather than reinventing them, with a test per rule.
- `legacy/` is reference only: read it, never edit it. If Card Hunt is added later it goes in `integrations/card-hunt/`:
  its own web page with no build step, and the app talks to it only through a small link or API, never by importing its code.
