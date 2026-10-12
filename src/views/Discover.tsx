import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../lib/db';
import { CommanderView } from './Commander';
import type { Shared } from './shared';

const isCommander = (type: string, text: string) => (/legendary/i.test(type) && /creature/i.test(type)) || /can be your commander/i.test(text);

export function Discover(s: Shared) {
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const commanders =
    useLiveQuery(async () => {
      const entries = await db.entries.where('profile').equals(s.profile).toArray();
      const cards = await db.cards.bulkGet([...new Set(entries.map((e) => e.cardId))]);
      const seen = new Set<string>();
      return cards.filter((c) => c && c.legal && isCommander(c.type, c.text) && !seen.has(c.key) && seen.add(c.key)).sort((a, b) => a!.name.localeCompare(b!.name));
    }, [s.profile]) ?? [];

  if (open) return <CommanderView name={open} s={s} onBack={() => setOpen(null)} />;
  const shown = commanders.filter((c) => c!.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <section>
      <h1>Discover</h1>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) setOpen(shown[0]?.name ?? q.trim());
        }}
      >
        <input type="search" placeholder="Filter your commanders or type any commander" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Commander" />
        <button type="submit">Open</button>
      </form>
      <p className="muted">
        {commanders.length ? `${commanders.length} commanders in this binder.` : 'No commanders yet: import a collection in the Collection tab, or type any commander above.'}
      </p>
      <ul className="grid">
        {shown.map((c) => (
          <li key={c!.id}>
            <button className="cmdr" onClick={() => setOpen(c!.name)}>
              {c!.img && <img src={c!.img} alt="" loading="lazy" />}
              <span>{c!.name}</span>
              <small className="muted">{c!.ci.join('') || 'C'}</small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
