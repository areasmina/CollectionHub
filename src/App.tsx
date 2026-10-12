import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { ownedMap } from './lib/compare';
import { db } from './lib/db';
import { Collection } from './views/Collection';
import { Decks } from './views/Decks';
import { Discover } from './views/Discover';
import { SyncPanel } from './views/SyncPanel';
import { PreviewLayer } from './views/shared';

type Tab = 'discover' | 'collection' | 'decks';
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* per-device convenience only */
    }
  },
};

export default function App() {
  const [tab, setTab] = useState<Tab>((store.get('ch:tab') as Tab) || 'discover');
  const [profile, setProfile] = useState(Number(store.get('ch:profile')) || 1);
  const [theme, setTheme] = useState(store.get('ch:theme') || 'system');
  const [sync, setSync] = useState(false);
  const profiles = useLiveQuery(() => db.profiles.toArray(), []) ?? [];
  const entries = useLiveQuery(() => db.entries.toArray(), []) ?? [];
  const other = profile === 1 ? 2 : 1;
  const mine = useMemo(() => ownedMap(entries.filter((e) => e.profile === profile)), [entries, profile]);
  const theirs = useMemo(() => ownedMap(entries.filter((e) => e.profile === other)), [entries, other]);
  const nameOf = (id: number) => profiles.find((p) => p.id === id)?.name ?? `Binder ${id}`;

  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    store.set('ch:theme', theme);
  }, [theme]);
  useEffect(() => store.set('ch:tab', tab), [tab]);
  useEffect(() => store.set('ch:profile', String(profile)), [profile]);

  const nextTheme = { system: 'light', light: 'dark', dark: 'system' }[theme] ?? 'system';
  const shared = { profile, mine, other: theirs, otherName: nameOf(other) };

  return (
    <div className="app">
      <header className="top">
        <strong className="logo">CollectionHub</strong>
        <select aria-label="Binder" value={profile} onChange={(e) => setProfile(Number(e.target.value))}>
          {[1, 2].map((id) => (
            <option key={id} value={id}>
              {nameOf(id)}
            </option>
          ))}
        </select>
        <button className="icon" onClick={() => setTheme(nextTheme)} aria-label={`Theme: ${theme}. Switch to ${nextTheme}`} title={`Theme: ${theme}`}>
          {theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}
        </button>
        <button className="icon" onClick={() => setSync(!sync)} aria-label="Sync between devices" aria-expanded={sync}>
          ⇅
        </button>
      </header>
      {sync && <SyncPanel onClose={() => setSync(false)} />}
      <PreviewLayer />
      <main>
        {tab === 'discover' && <Discover {...shared} />}
        {tab === 'collection' && <Collection profile={profile} name={nameOf(profile)} />}
        {tab === 'decks' && <Decks {...shared} />}
        <footer className="credits">
          Card data and images from <a href="https://scryfall.com">Scryfall</a>. Commander data from <a href="https://edhrec.com">EDHREC</a>. Not affiliated with
          Wizards of the Coast, Scryfall or EDHREC.
        </footer>
      </main>
      <nav className="tabs">
        {(['discover', 'collection', 'decks'] as Tab[]).map((t) => (
          <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
    </div>
  );
}
