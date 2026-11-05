# DeckMage

Your Magic: The Gathering collections next to EDHREC commander data: what you own shows normally, what you're missing is greyed out.

- **Two binders** (collection profiles), each with its own cards and saved decks, never merged. Discover marks a missing card with "in <other binder>" when your other binder has it.
- **Import**: ManaBox CSV, any CSV with a name (and quantity) column, Moxfield / Archidekt / Arena text (`1 Sol Ring`, `1x Sol Ring (CMM) 410 *F*`, section headers like `Commander`, `// Lands`, `Creatures (25)`), or a plain card list. The format is detected automatically; unknown names and bad lines are listed after the import.
- **Discover**: commanders in the active binder (or type any commander). For each: As Commander / Average Deck, Bracket All / 1–5, Budget Any / $ / $$$, tags with deck counts, EDHREC's card categories with inclusion % and synergy, and how much of it you own. An average deck can be saved to Decks.
- **Images and prices**: every card shows its Scryfall image, mana cost and price (USD = TCGplayer market price, € when no USD; tap a price to open TCGplayer). EDHREC's lists carry Scryfall ids but no prices, so prices come from Scryfall: the cheapest paper printing of each card (one Scryfall search per 40 cards, refreshed weekly). Your binder's value uses your own printings. Commander pages, decks and binders show what the missing cards / your binder cost.
- **Collection**: add to / replace / reset a binder, remove single entries, rename, export CSV or text.
- **Decks**: import a decklist, see what you own, export text or CSV, delete.
- Installable PWA (works offline for your saved data), light/dark theme (follows the system by default), mobile-first layout.

Card data and images come from [Scryfall](https://scryfall.com), commander data from [EDHREC](https://edhrec.com). Not affiliated with either, nor with Wizards of the Coast.

## Run it (Windows)

Needs [Node.js](https://nodejs.org) 20 or newer.

```powershell
npm install
npm run dev        # http://localhost:5173
npm test           # importer and owned/missing tests
npm run build      # production build in dist/
npm run preview    # serve dist/ (test the installable PWA)
```

To try it on your phone on the same Wi-Fi: `npm run dev -- --host`, then open the "Network" address it prints. Installing as an app needs HTTPS, so for that deploy `dist/` (below).

## Where data lives

Everything is stored in your browser's IndexedDB on each device (binders, decks, and caches of Scryfall cards and EDHREC pages; EDHREC pages are refreshed after a day). Nothing leaves the device unless you turn on sync (and then only encrypted). Clearing the site's data in the browser erases it, so export your binders now and then, or use sync.

Both APIs are called straight from the browser: EDHREC's JSON (`json.edhrec.com`) and Scryfall both allow cross-origin requests, so no proxy is needed. Scryfall lookups go in batches of 75 cards, at most two requests a second, with back-off when Scryfall asks for it. Only cards not already cached are looked up.

## Device sync (optional, no account)

The app works fully without this. To use the same binders and decks on your PC and phone:

1. Tap **⇅** in the hub → **Turn on sync**. You get a sync code (`xxxx-xxxx-xxxx-xxxx-xxxx`) and a link.
2. On the other device, open the link (or type the code under "Already turned it on somewhere else?") and tap **Link**.

That's it: no email, no Google or GitHub, no password. Changes sync on their own a few seconds after an edit and when you
open the app. If both devices changed, the app stops and asks which copy to keep; **Undo last pull** puts this device's
previous copy back.

How it's kept private: the code never leaves your devices. The app sends the sync server only a hash of the code (the
storage id) and a snapshot it already **encrypted** (AES-256-GCM, key derived from the code). The server can't read your
binders. The code is the only key: anyone with it can see and change your data (use **Change code** if it leaked), and
if you lose it on every device the cloud copy can't be opened (each device keeps its own copy).

### The sync server (one-time setup, free)

`worker/` is a small Cloudflare Worker (`sync.js`) with one Durable Object per code. It keeps the latest snapshot
(≤ 10 MB) and the one before it, refuses a save made from an out-of-date copy (so devices never overwrite each other
silently), and retires a code after **Change code**. Cloudflare's free plan covers it.

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com) (free plan; the same account as CardHunt's Worker).
2. In a terminal: `cd worker`, `npx wrangler login`, `npx wrangler deploy`.
3. It prints the address, e.g. `https://collectionhub-sync.<you>.workers.dev`. The app uses
   `https://collectionhub-sync.areasmina.workers.dev` by default; for another address set `VITE_SYNC_URL` in `.env` / Vercel.

Check it: opening the address shows "CollectionHub sync is running."

### Moving from the old sign-in sync

Earlier versions synced through Supabase with a Google / GitHub / email sign-in. A device still signed in shows
**Move to sync code** in the ⇅ panel: it fetches the old cloud copy if it's newer than the device (asks if both changed),
turns on a sync code and signs out of the old sync. Do this on one device, then link the others with the code. A device
with no data can still sign in once ("Used the old sign-in sync?") to bring the old copy back. This needs
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to stay set until every device has moved; then Supabase is removed.

## Deploy (Vercel)

1. vercel.com → Continue with GitHub (free Hobby plan) → Add New → Project → Import `CollectionHub`.
2. Framework preset is detected as Vite (`vercel.json` also sets it; it adds no-cache headers for the service worker so updates arrive). During the move from the old sign-in sync keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set → Deploy.

Every push to `main` redeploys. Other static hosts work the same way: build `npm run build`, output `dist`.

## Android app later (Capacitor)

`capacitor.config.json` is in place (`webDir: dist`). When wanted: `npm i @capacitor/core @capacitor/cli @capacitor/android`, `npm run build`, `npx cap add android`, `npx cap open android`.

## Project layout

```
src/lib/importers.ts   format detection and parsing (tested)
src/lib/compare.ts     owned / other binder / missing (tested)
src/lib/scryfall.ts    card lookups + cache
src/lib/edhrec.ts      EDHREC pages + cache
src/lib/db.ts          IndexedDB tables (Dexie)
src/lib/sync.ts        sync code: push / pull / turn on / link / change code
src/lib/synccode.ts    codes + encryption (tested)
src/lib/legacysync.ts  old Supabase sync, only for "Move to sync code"
worker/sync.js         the sync server (Cloudflare Worker, tested)
src/views/             Discover, Commander, Collection, Decks, Sync
supabase/schema.sql    old sync's tables (removed after the move)
```
