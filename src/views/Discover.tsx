import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { summarize } from '../lib/compare';
import { db, type Card } from '../lib/db';
import { fetchPage, pagePath } from '../lib/edhrec';
import { slug } from '../lib/names';
import { cad, toCad } from '../lib/prices';
import { CommanderView } from './Commander';
import { Progress, type Shared } from './shared';

const isCommander = (type: string, text: string) => (/legendary/i.test(type) && /creature/i.test(type)) || /can be your commander/i.test(text);
const DAY = 864e5;
const SORTS: [string, string][] = [
  ['name', 'Name A→Z'],
  ['name-desc', 'Name Z→A'],
  ['match', 'Collection match: most owned first'],
  ['match-asc', 'Collection match: least owned first'],
  ['price-desc', 'Commander price: high → low'],
  ['price', 'Commander price: low → high'],
  ['added', 'Recently added first'],
];

type Cmdr = Card & { added?: number };

export function Discover(s: Shared) {
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name');
  const [recent, setRecent] = useState(false);
  const [match, setMatch] = useState<Map<string, number | null>>(new Map());
  const data = useLiveQuery(async () => {
    const entries = await db.entries.where('profile').equals(s.profile).toArray();
    const cards = await db.cards.bulkGet([...new Set(entries.map((e) => e.cardId))]);
    const byId = new Map(cards.filter(Boolean).map((c) => [c!.id, c!]));
    const out = new Map<string, Cmdr>();
    for (const e of entries) {
      const c = byId.get(e.cardId);
      if (!c || !c.legal || !isCommander(c.type, c.text)) continue;
      const prev = out.get(c.key);
      const added = Math.min(prev?.added ?? Infinity, e.added ?? Infinity);
      out.set(c.key, { ...(prev ?? c), added: added === Infinity ? undefined : added });
    }
    return { commanders: [...out.values()], undated: entries.some((e) => !e.added) };
  }, [s.profile]);
  const commanders = data?.commanders ?? [];

  // Collection match = share of EDHREC's average deck you own. Fetched only when that sort is picked, then cached a day.
  const needMatch = sort.startsWith('match');
  const pending = needMatch ? commanders.filter((c) => !match.has(c.key)) : [];
  useEffect(() => {
    if (!pending.length) return;
    let live = true;
    (async () => {
      for (const c of pending) {
        if (!live) return;
        const pct = await fetchPage(pagePath('average', slug(c.name)))
          .then((p) => summarize([...new Set(p.lists.flatMap((l) => l.cards.map((x) => x.name)))], s.mine).pct)
          .catch(() => null);
        if (live) setMatch((m) => new Map(m).set(c.key, pct));
      }
    })();
    return () => {
      live = false;
    };
  }, [needMatch, commanders.length, s.mine]);
  useEffect(() => setMatch(new Map()), [s.mine]);

  if (open) return <CommanderView name={open} s={s} onBack={() => setOpen(null)} />;

  // Numeric sort with unknown values (no EDHREC deck, no price) always last.
  const byNum = (get: (c: Cmdr) => number | null | undefined, dir: 1 | -1) => (a: Cmdr, b: Cmdr) => {
    const x = get(a), y = get(b);
    const ux = x == null || Number.isNaN(x), uy = y == null || Number.isNaN(y);
    return ux || uy ? Number(ux) - Number(uy) : dir * (x - y);
  };
  const price = (c: Cmdr) => (c.usd ? Number(c.usd) : null);
  const cmp: Record<string, (a: Cmdr, b: Cmdr) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    'name-desc': (a, b) => b.name.localeCompare(a.name),
    match: byNum((c) => match.get(c.key), -1),
    'match-asc': byNum((c) => match.get(c.key), 1),
    'price-desc': byNum(price, -1),
    price: byNum(price, 1),
    added: byNum((c) => c.added, -1),
  };
  const shown = commanders
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
    .filter((c) => !recent || (c.added && Date.now() - c.added < 30 * DAY))
    .sort((a, b) => cmp[sort](a, b) || a.name.localeCompare(b.name));
  const done = commanders.length - pending.length;

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
      <div className="row">
        <label className="grow">
          <span className="sr">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort commanders">
            {SORTS.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={recent} onChange={(e) => setRecent(e.target.checked)} /> Added in the last 30 days
        </label>
      </div>
      {needMatch && pending.length > 0 && <Progress done={done} total={commanders.length} what="Checking EDHREC average decks" />}
      {(sort === 'added' || recent) && data?.undated && (
        <p className="muted small">Cards imported before dates were recorded have no date, so they're left out of this. Re-import your ManaBox CSV with "Replace binder" (Collection tab) to use its real "Added" dates.</p>
      )}
      <p className="muted">
        {commanders.length
          ? `${shown.length} of ${commanders.length} commanders in this binder.`
          : 'No commanders yet: import a collection in the Collection tab, or type any commander above.'}
      </p>
      <ul className="grid">
        {shown.map((c) => (
          <li key={c.id}>
            <button className="cmdr" onClick={() => setOpen(c.name)}>
              {c.img && <img src={c.img.replace('/small/', '/normal/')} alt="" loading="lazy" />}
              <span>{c.name}</span>
              <small className="muted">
                {c.ci.join('') || 'C'}
                {match.get(c.key) != null && ` · ${match.get(c.key)}% owned`}
                {c.usd && ` · ≈${cad(toCad(c.usd)!)}`}
              </small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
