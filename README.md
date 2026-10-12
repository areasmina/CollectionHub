# CollectionHub

Your Magic: The Gathering collections next to EDHREC commander data: what you own shows normally, what you're missing is greyed out.

- **Two binders** (collection profiles), each with its own cards and saved decks, never merged. Discover marks a missing card with "in <other binder>" when your other binder has it.
- **Import**: ManaBox CSV, any CSV with a name (and quantity) column, Moxfield / Archidekt / Arena text (`1 Sol Ring`, `1x Sol Ring (CMM) 410 *F*`, section headers like `Commander`, `// Lands`, `Creatures (25)`), or a plain card list. The format is detected automatically; unknown names and bad lines are listed after the import.
- **Discover**: commanders in the active binder (or type any commander). For each: As Commander / Average Deck, Bracket All / 1–5, Budget Any / $ / $$$, tags with deck counts, EDHREC's card categories with inclusion % and synergy, and how much of it you own. An average deck can be saved to Decks.
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

Everything is stored in your browser's IndexedDB on each device (binders, decks, and caches of Scryfall cards and EDHREC pages; EDHREC pages are refreshed after a day). Nothing leaves the device unless you turn on sync. Clearing the site's data in the browser erases it, so export your binders now and then, or use sync.

Both APIs are called straight from the browser: EDHREC's JSON (`json.edhrec.com`) and Scryfall both allow cross-origin requests, so no proxy is needed. Scryfall lookups go in batches of 75 cards, at most two requests a second, with back-off when Scryfall asks for it. Only cards not already cached are looked up.

## Device sync (optional)

The app works fully without this. To use the same binders on your PC and phone:

1. Create a free account at [supabase.com](https://supabase.com) and click **New project** (any name, e.g. `collectionhub`; pick a region near you; save the database password somewhere, the app doesn't need it).
2. When the project is ready, open **SQL Editor → New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. It creates the `profiles`, `cards` and `decks` tables with row-level security (each account sees only its own rows).
3. Open **Authentication → URL Configuration**. Set **Site URL** to where you open the app (`http://localhost:5173` for now) and add every other address you use under **Redirect URLs** (e.g. your deployed URL, `http://192.168.x.x:5173`).
4. Open **Project Settings → API** (or **Connect**). Copy the **Project URL** and the **anon / publishable** key.
5. In this folder, copy `.env.example` to `.env` and fill them in:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
   `.env` is git-ignored. The anon key is meant to be public (row-level security protects the data); never put the `service_role` key here.
6. Restart `npm run dev`. Tap **⇅** in the header, enter your email, open the link from the email on that device.
7. **Push to cloud** on the device that has your data; **Pull from cloud** on the other one.

Sync is a whole snapshot: Push replaces the cloud copy, Pull replaces the device copy. Push after making changes, pull before using the other device.

## Deploy (optional)

`npm run build` makes a static site in `dist/`. Any static host works (Netlify, Vercel, Cloudflare Pages, GitHub Pages): build command `npm run build`, output folder `dist`, and set the two `VITE_SUPABASE_*` variables in the host's settings if you use sync. Add the deployed URL to Supabase's redirect URLs.

## Android app later (Capacitor)

`capacitor.config.json` is in place (`webDir: dist`). When wanted: `npm i @capacitor/core @capacitor/cli @capacitor/android`, `npm run build`, `npx cap add android`, `npx cap open android`.

## Project layout

```
src/lib/importers.ts   format detection and parsing (tested)
src/lib/compare.ts     owned / other binder / missing (tested)
src/lib/scryfall.ts    card lookups + cache
src/lib/edhrec.ts      EDHREC pages + cache
src/lib/db.ts          IndexedDB tables (Dexie)
src/lib/sync.ts        Supabase push / pull
src/views/             Discover, Commander, Collection, Decks, Sync
supabase/schema.sql    tables + row-level security
```
