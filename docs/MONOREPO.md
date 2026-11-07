# One home for everything

| Folder | What it is | Status |
|---|---|---|
| `/` (`src/`, `e2e/`, `worker/`) | **CollectionHub**, the web app | Active |
| `legacy/DeckWizard/` | **DeckWizard**: the original Python / ManaBox deck builder | Reference only. Its ideas live on in `src/brain/` |

DeckWizard was imported with its **full git history** (83 commits), so `git log -- legacy/DeckWizard` and `git blame` still work. The original repo on GitHub was not touched or archived.

**Card Hunt** (`areasmina/card-hunt`) is deliberately *not* merged yet. It will come later, as `integrations/card-hunt/`, when we wire it into the "buy the missing cards" flow.

Ideas worth borrowing from the MIT-licensed Manafoundry deck generator (keep its copyright notice on any copied code): share links with Discord previews, "what to add since you last touched this deck", curve / land analysis, and "explain why" on each pick.