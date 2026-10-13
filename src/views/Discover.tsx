import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { statusOf } from '../lib/compare';
import { db, type Card } from '../lib/db';
import { fetchPage, pagePath } from '../lib/edhrec';
import { slug } from '../lib/names';
import { CommanderView } from './Commander';
import { Progress, usd, type Shared } from './shared';
import { CardDoodles, PageDecor, Pips, RiseBars, Tape, Title, EyeDoodle } from './zine';

export const isCommander = (type: string, text: string) => (/legendary/i.test(type) && /creature/i.test(type)) || /can be your commander/i.test(text);
const SORTS: [string, string][] = [
  ['name', 'NAME A→Z'],
  ['name-desc', 'NAME Z→A'],
  ['match', '% OWNED: MOST FIRST'],
  ['match-asc', '% OWNED: LEAST FIRST'],
  ['price-desc', 'PRICE: HIGH → LOW'],
  ['price', 'PRICE: LOW → HIGH'],
  ['added', 'RECENTLY ADDED'],
];
const COLOURS: [string, string, string][] = [
  ['W', 'White', '#F3E7B0'],
  ['U', 'Blue', '#2F7FD8'],
  ['B', 'Black', '#8C8C8C'],
  ['R', 'Red', '#E60012'],
  ['G', 'Green', '#2FA35A'],
];
const ROTS = [-1.2, 0.8, -0.5, 1.1, 0.6, -0.9, 0.4, -0.7, 1, -1.1];
const TAPES: React.CSSProperties[] = [
  { top: -14, left: -18, width: 86, height: 30, transform: 'rotate(-28deg)' },
  { top: -12, right: 14, width: 86, height: 30, transform: 'rotate(8deg)' },
];

type Cmdr = Card & { added?: number };
/** Per commander, from EDHREC's average deck: share owned, cards missing, EDHREC decks. */
type Stat = { pct: number; missing: number; decks?: number } | null;

// Results survive page switches: recomputed only when the binder's contents change or after a day.
const CACHE_MS = 864e5;
let statsCache: { sig: string; at: number; map: Map<string, Stat> } = { sig: '', at: 0, map: new Map() };
const binderSig = (profile: number, mine: Map<string, number>) => {
  // Which cards are owned is what matters (quantities don't change % owned); order-independent sum of name hashes.
  let sum = 0;
  for (const k of mine.keys()) {
    let h = 0;
    for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0;
    sum = (sum + (h >>> 0)) % 4294967296;
  }
  return `${profile}|${mine.size}|${sum}`;
};

export function Discover(s: Shared) {
  const [open, setOpen] = useState<string | null>(null);
  const [openNo, setOpenNo] = useState<number>();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('match'); // most owned first
  const [colours, setColours] = useState<string[]>([]);
  const [fOpen, setFOpen] = useState(false); // phones: filters collapsed until asked for
  const phone = window.innerWidth <= 700;
  const sig = binderSig(s.profile, s.mine);
  const [stats, setStatsState] = useState<Map<string, Stat>>(() => (statsCache.sig === sig && Date.now() - statsCache.at < CACHE_MS ? statsCache.map : new Map()));
  const setStats = (f: (m: Map<string, Stat>) => Map<string, Stat>) =>
    setStatsState((m) => {
      const next = f(m);
      statsCache = { sig, at: statsCache.sig === sig ? statsCache.at : Date.now(), map: next };
      return next;
    });
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

  // Stats for every commander, loaded in the background (EDHREC pages are paced and cached a day).
  const pending = commanders.filter((c) => !stats.has(c.key)).sort((a, b) => a.name.localeCompare(b.name));
  // Binder changed (import, quantity edit, other binder picked): start over.
  useEffect(() => {
    if (statsCache.sig !== sig || Date.now() - statsCache.at >= CACHE_MS) {
      statsCache = { sig, at: Date.now(), map: new Map() };
      setStatsState(new Map());
    }
  }, [sig]);
  useEffect(() => {
    if (!pending.length || open) return;
    let live = true;
    (async () => {
      for (const c of pending) {
        if (!live) return;
        const st: Stat = await fetchPage(pagePath('average', slug(c.name)))
          .then((p) => {
            const names = [...new Set(p.lists.flatMap((l) => l.cards.map((x) => x.name)))];
            const missing = names.filter((n) => statusOf(n, s.mine) !== 'owned').length;
            return { pct: names.length ? Math.round((100 * (names.length - missing)) / names.length) : 0, missing, decks: p.numDecks };
          })
          .catch(() => null);
        if (live) setStats((m) => new Map(m).set(c.key, st));
      }
    })();
    return () => {
      live = false;
    };
  }, [commanders.length, s.mine, open]);

  if (open) return <CommanderView name={open} s={s} no={openNo} onBack={() => setOpen(null)} />;

  // Numeric sort with unknown values (no EDHREC deck, no price) always last.
  const byNum = (get: (c: Cmdr) => number | null | undefined, dir: 1 | -1) => (a: Cmdr, b: Cmdr) => {
    const x = get(a),
      y = get(b);
    const ux = x == null || Number.isNaN(x),
      uy = y == null || Number.isNaN(y);
    return ux || uy ? Number(ux) - Number(uy) : dir * (x - y);
  };
  const price = (c: Cmdr) => (c.usd ? Number(c.usd) : null);
  const pct = (c: Cmdr) => stats.get(c.key)?.pct;
  const cmp: Record<string, (a: Cmdr, b: Cmdr) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    'name-desc': (a, b) => b.name.localeCompare(a.name),
    match: byNum(pct, -1),
    'match-asc': byNum(pct, 1),
    'price-desc': byNum(price, -1),
    price: byNum(price, 1),
    added: byNum((c) => c.added, -1),
  };
  const shown = commanders
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))
    .filter((c) => colours.every((col) => c.ci.includes(col)))
    .sort((a, b) => cmp[sort](a, b) || a.name.localeCompare(b.name));
  const toggle = (col: string) => setColours((cs) => (cs.includes(col) ? cs.filter((x) => x !== col) : [...cs, col]));
  const tick = ['★ WHAT CAN YOU BUILD WITH WHAT YOU OWN?', '★ OWN IT · BUILD IT · SLEEVE IT', '★ MISSING CARDS GET SWAPPED FROM YOUR BINDER'];

  return (
    <>
      <PageDecor seed={501} rays="46% 30%" sheet={{ side: 'right', top: 560, rot: -6 }} />
      <div className="ticker" aria-hidden="true">
        <span>
          {[...tick, ...tick].map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </span>
      </div>
      <main>
        <section className="hero">
          <Title text="WHAT CAN I BUILD?" label="What can I build?" size={phone ? 64 : 44} seed={7} />
          {!phone && <EyeDoodle />}
          <div className={`filters${phone && !fOpen ? ' shut' : ''}`}>
            <div className="fhead">
              <svg aria-hidden="true" width="260" height="34" viewBox="0 0 260 34" style={{ marginLeft: 6, filter: 'url(#worn)', color: 'var(--fh)' }}>
                <path d="M4 22 C40 8 70 26 104 14 S168 4 196 16 L208 6 L214 20 C226 12 240 14 256 4 L250 24 C220 30 196 22 170 30 S80 26 60 32 S20 30 4 22 Z" fill="currentColor" />
              </svg>
              <div className="frow">
                <h2>
                  <span className="worn" aria-hidden="true" />
                  {phone ? (
                    <button className="ftoggle" aria-expanded={fOpen} aria-controls="fpanel" onClick={() => setFOpen(!fOpen)}>
                      FILTERS {fOpen ? '▲' : '▼'}
                    </button>
                  ) : (
                    'FILTERS'
                  )}
                </h2>
                {phone && !fOpen && (
                  <span className="fhint">
                    {[SORTS.find(([v]) => v === sort)?.[1].split(':')[0], colours.join(' '), q.trim() && `"${q.trim()}"`].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            </div>
            <form
              id="fpanel"
              className="fpanel"
              aria-label="Find a commander"
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim()) (setOpenNo(shown[0] ? 1 : undefined), setOpen(shown[0]?.name ?? q.trim()));
              }}
            >
              <span className="worn" aria-hidden="true" style={{ inset: -2 }} />
              <Tape style={{ top: -12, left: -16, width: 90, height: 24, transform: 'rotate(-24deg)' }} />
              <Tape style={{ bottom: -10, right: -12, width: 90, height: 24, transform: 'rotate(-20deg)' }} />
              <label className="sbox search">
                <span className="tab">SEARCH</span>
                <input type="search" placeholder="commander name, Enter opens any_" enterKeyHint="go" value={q} onChange={(e) => setQ(e.target.value)} />
                <span aria-hidden="true" className="hfade fade" />
              </label>
              <label className="sbox sort">
                <span className="tab">SORT</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {SORTS.map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
                <span className="arrow" aria-hidden="true">
                  <span>▼</span>
                </span>
              </label>
              <div className="colours" role="group" aria-label="Filter by colour identity">
                {COLOURS.map(([l, n, bar]) => (
                  <button type="button" key={l} aria-pressed={colours.includes(l)} aria-label={n} onClick={() => toggle(l)}>
                    {l}
                    <i aria-hidden="true" style={{ background: bar }} />
                  </button>
                ))}
              </div>
            </form>
            <p className="caption">
              <span>
                &gt; Your binder vs EDHREC. Missing cards get filled from cards you own<span className="cur">_</span>
              </span>
            </p>
          </div>
        </section>

        {pending.length > 0 && commanders.length > 0 && <Progress done={commanders.length - pending.length} total={commanders.length} what="Checking EDHREC average decks" />}
        {sort === 'added' && data?.undated && (
          <p className="count">Cards imported before dates were recorded have no date, so they're listed last. Re-import your ManaBox CSV with "Replace binder" (Collection tab) to use its real "Added" dates.</p>
        )}
        <p className="count">
          {commanders.length ? `${shown.length} of ${commanders.length} commanders in this binder.` : 'No commanders yet: import a collection in the Collection tab, or type any commander above and press Enter.'}
        </p>
        <ul className="cgrid">
          {shown.map((c, i) => {
            const st = stats.get(c.key);
            const ready = st && st.pct >= 90;
            return (
              <li key={c.id}>
                <button className="ccard" style={{ transform: `rotate(${ROTS[i % ROTS.length]}deg)` }} onClick={() => (setOpenNo(i + 1), setOpen(c.name))} aria-label={`${c.name}${st ? `, ${st.pct}% owned, ${st.missing} cards missing` : ''}`}>
                  <span className="worn" aria-hidden="true" />
                  <span className="hair" aria-hidden="true" />
                  {i % 3 !== 2 && <Tape style={TAPES[i % 3]} />}
                  <CardDoodles i={i} />
                  <span className="nm">
                    <span>{c.name.split(' // ')[0]}</span>
                    <Pips ci={c.ci} />
                  </span>
                  <span className="mat">
                    <span className="frame">
                      {/* Commanders listed here are in the binder: full colour. */}
                      {c.img && <img src={c.img.replace('/small/', '/art_crop/')} alt="" loading="lazy" />}
                    </span>
                  </span>
                  <span className="own">{st ? `Own ${st.pct}% of the deck. ${st.missing} cards missing.` : st === null ? 'No EDHREC deck yet.' : 'Checking EDHREC…'}</span>
                  {st && <span className={`badge${ready ? ' ready' : ''}`}>{ready ? '[READY TO SLEEVE!]' : `[${st.missing} TO BUY]`}</span>}
                  <span className="foot">
                    <span className="mono">
                      NO. {String(i + 1).padStart(3, '0')}
                      <br />
                      {st?.decks != null ? `${st.decks.toLocaleString()} decks` : '— decks'}
                      <br />
                      {usd(c)}
                    </span>
                    {st && (
                      <span className="pct">
                        {st.pct}%
                        <RiseBars pct={st.pct} />
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
