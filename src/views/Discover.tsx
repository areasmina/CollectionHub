import { haptic } from '../lib/haptics';
import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { CardSpin } from './CardSpin';

const CommanderView = lazy(() => import('./Commander').then((m) => ({ default: m.CommanderView })));
import { db, type Card } from '../lib/db';
import { cachedPage, fetchPage, NoPage, pagePath } from '../lib/edhrec';
import { binderSig, loadStats, plan, saveStats, statOf, type SavedStat } from '../lib/cmdrstats';
import { slug } from '../lib/names';
import { openCollection } from '../lib/nav';
import { Progress, usd, type Shared } from './shared';
import { CardDoodles, PageDecor, Pips, Ransom, RiseBars, Tape, Title, EyeDoodle, ManaIcon } from './zine';

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

// Stats are saved on the device per binder (lib/cmdrstats), so a reload shows them at once; this copy also skips the
// IndexedDB read when switching pages. Old EDHREC pages are re-downloaded quietly after everything is shown.
const REFRESH_MS = 7 * 864e5;
let memo: { profile: number; sig: string; map: Map<string, SavedStat> } | null = null;

/** First run (or a binder with no legends yet): three taped steps instead of an empty page. */
function Welcome({ empty }: { empty: boolean }) {
  const steps: [string, string][] = [
    ['IMPORT YOUR CARDS', 'ManaBox CSV, Moxfield / Archidekt text or a plain list. Nothing leaves this device.'],
    ['SEE WHAT YOU CAN BUILD', 'Every commander you own, ranked by how much of its deck is already in your binder.'],
    ['OPEN ONE, SWAP FROM YOUR BINDER', 'Missing cards get stand-ins you own. Buy only what\'s worth it.'],
  ];
  return (
    <section className="welcome" aria-label="Getting started">
      <ol>
        {steps.map(([h, p], i) => (
          <li key={h} className="gbox" style={{ transform: `rotate(${[-1.2, 0.8, -0.5][i]}deg)` }}>
            <Tape style={{ top: -12, left: 18, width: 70, height: 22, transform: `rotate(${[-8, 6, -4][i]}deg)` }} />
            <span className="wn">{i + 1}</span>
            <b>{h}</b>
            <span>{p}</span>
          </li>
        ))}
      </ol>
      <p className="count">{empty ? 'Your binder is empty.' : 'No commanders in this binder yet.'} You can also type any commander in the search above and press Enter.</p>
      <button className="btn" onClick={() => (haptic('select'), openCollection())}>
        IMPORT YOUR CARDS →
      </button>
    </section>
  );
}

export function Discover(s: Shared) {
  const [open, setOpen] = useState<string | null>(null);
  const [openNo, setOpenNo] = useState<number>();
  // Scrolling through commanders: a soft detent tick as each card comes into view (throttled in haptic()).
  const gridRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const ul = gridRef.current;
    if (!ul || typeof IntersectionObserver === 'undefined') return;
    let armed = false;
    const arm = () => (armed = true);
    addEventListener('scroll', arm, { passive: true });
    const io = new IntersectionObserver((es) => armed && es.some((e) => e.isIntersecting) && haptic('tick'), { rootMargin: '0px 0px -35% 0px' });
    ul.querySelectorAll(':scope > li').forEach((li) => io.observe(li));
    return () => (io.disconnect(), removeEventListener('scroll', arm));
  });
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('match'); // most owned first
  const [colours, setColours] = useState<string[]>([]);
  const [fOpen, setFOpen] = useState(false); // phones: filters collapsed until asked for
  const phone = window.innerWidth <= 700;
  // up to tablets the eye sits on the logo (behind the letters) instead of taking a third of the first screen
  const eyeOnLogo = window.innerWidth <= 1024;
  // The tagline lines up under the word BUILD: measured from the title's 4th cut-out word, kept in step on resize.
  const underObs = useRef<ResizeObserver | null>(null);
  const underBuild = (el: HTMLParagraphElement | null) => {
    underObs.current?.disconnect();
    underObs.current = null;
    const wrap = el?.parentElement;
    if (!el || !wrap) return;
    const place = () => {
      const word = wrap.querySelector<HTMLElement>('.ztitle .rword:nth-child(4)');
      if (!word) return;
      const w = wrap.getBoundingClientRect();
      const b = word.getBoundingClientRect();
      // one line when it fits the title's width: slid left as far as needed so its end stays on the slash
      el.style.whiteSpace = 'nowrap';
      el.style.maxWidth = `${Math.round(w.width - 8)}px`;
      const left = Math.max(0, Math.min(b.left - w.left, w.width - el.offsetWidth - 8));
      el.style.left = `${Math.round(left)}px`;
      el.style.top = `${Math.round(b.bottom - w.top + 6)}px`;
    };
    place();
    underObs.current = new ResizeObserver(place);
    underObs.current.observe(wrap);
  };
  const sig = binderSig(s.profile, s.mine);
  // Saved stats of this binder (from memory, else from the device); shown even while a changed binder is recounted.
  const [saved, setSaved] = useState<{ profile: number; sig: string; map: Map<string, SavedStat> } | null>(() => (memo?.profile === s.profile ? memo : null));
  useEffect(() => {
    if (memo?.profile === s.profile) return setSaved(memo);
    let live = true;
    setSaved(null);
    loadStats(s.profile).then((r) => live && setSaved((memo = { profile: s.profile, ...r })));
    return () => {
      live = false;
    };
  }, [s.profile]);
  const stats = new Map([...(saved?.map ?? [])].map(([k, v]) => [k, v.stat]));
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

  // Stats for every commander. First recount from pages already on the device (fast, no network), then fetch missing
  // or old pages from EDHREC one by one (paced, cached), saving as it goes. Paused while a commander is open.
  const work = saved && data ? plan(commanders.map((c) => c.key), saved.map, saved.sig === sig, Date.now(), REFRESH_MS) : null;
  // The progress bar counts only commanders with nothing to show yet or a recount under way; old pages refresh silently.
  const pending = work ? new Set([...work.recount, ...work.refresh.filter((k) => !saved!.map.has(k))]).size : commanders.length;
  useEffect(() => {
    if (!saved || !data || !work || open || (!work.recount.length && !work.refresh.length)) return;
    let live = true;
    const profile = s.profile;
    const byKey = new Map(commanders.map((c) => [c.key, c]));
    const map = saved.sig === sig ? new Map(saved.map) : new Map([...saved.map].filter(([k]) => byKey.has(k)));
    const put = (k: string, v: SavedStat) => {
      map.set(k, v);
      memo = { profile, sig, map: new Map(map) };
      setSaved(memo);
    };
    (async () => {
      const refresh = new Set(work.refresh);
      for (const k of work.recount) {
        if (!live) return;
        const hit = await cachedPage(pagePath('average', slug(byKey.get(k)!.name)));
        if (hit) put(k, { stat: statOf(hit.page, s.mine), at: hit.at });
        else refresh.add(k);
      }
      if (live) await saveStats(profile, sig, map);
      for (const k of [...refresh].sort((a, b) => byKey.get(a)!.name.localeCompare(byKey.get(b)!.name))) {
        if (!live) return;
        const path = pagePath('average', slug(byKey.get(k)!.name));
        // No EDHREC page = null; offline or an error: keep what's shown and try again next time.
        const stat = await fetchPage(path, REFRESH_MS)
          .then((p) => statOf(p, s.mine))
          .catch((e) => (e instanceof NoPage ? null : undefined));
        if (!live) return;
        if (stat !== undefined) put(k, { stat, at: Date.now() });
        else continue;
        await saveStats(profile, sig, map);
      }
    })();
    return () => {
      live = false;
      saveStats(profile, sig, map);
    };
  }, [saved?.profile, saved ? saved.sig === sig : false, sig, commanders.length, open, !!data]);

  if (open)
    return (
      <Suspense fallback={<CardSpin page />}>
        <CommanderView name={open} s={s} no={openNo} onBack={() => setOpen(null)} />
      </Suspense>
    );

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
  const empty = commanders.length === 0; // nothing to sort or filter yet
  const toggle = (col: string) => setColours((cs) => (cs.includes(col) ? cs.filter((x) => x !== col) : [...cs, col]));

  return (
    <>
      <PageDecor seed={501} rays="46% 30%" sheet={{ side: 'right', top: 560, rot: -6 }} />
      <main>
        <section className="hero">
          {/* Phones: a big eye (fire, rays and orbit, no dark landscape) blazes behind the title letters. */}
          <Title
            text="WHAT CAN I BUILD?"
            label="What can I build?"
            size={phone ? 50 : 44}
            seed={7}
            behind={eyeOnLogo ? <EyeDoodle bare /> : undefined}
            after={
              <>
                {/* wider screens: the tagline sits under the word BUILD (empty binder too) */}
                {!phone && <p className="tagline tunder" ref={underBuild}>Your collection. Real decks. No guesswork.</p>}
                {commanders.length > 0 && (
                // The answer to the title, in the same cut-out letters: how many commander decks this binder can build.
                // It tucks in behind the letters.
                <p className="tanswer" aria-live="polite" aria-label={shown.length === commanders.length ? `${commanders.length} commander decks you can build` : `${shown.length} of ${commanders.length} commanders shown`}>
                  <Ransom text={shown.length === commanders.length ? `${commanders.length} DECK${commanders.length === 1 ? '' : 'S'}` : `${shown.length} OF ${commanders.length}`} size={phone ? 28 : 30} seed={23} />
                </p>
                )}
              </>
            }
          />
          {!eyeOnLogo && <EyeDoodle />}
          {phone && !empty && (
            <button
              type="button"
              className={`ftag${fOpen ? ' open' : ''}`}
              aria-expanded={fOpen}
              aria-controls="fpanel"
              onClick={() => (haptic('open'), setFOpen(!fOpen))}
            >
              <span className="string" aria-hidden="true" />
              <span className="tagbody">
                <span className="hole" aria-hidden="true" />
                <b>FILTERS</b>
                <small>{[q.trim() && `"${q.trim()}"`, SORTS.find(([v]) => v === sort)?.[1].split(':')[0], colours.join(' ')].filter(Boolean).join(' · ')}</small>
                <span className="chev" aria-hidden="true">
                  {fOpen ? '▲' : '▼'}
                </span>
              </span>
            </button>
          )}
          {phone && <p className="tagline">Your collection. Real decks. No guesswork.</p>}
          {/* Same controls at every width (phones fold them behind the FILTERS tag). With nothing to filter yet, only the
              search shows, open, at every width. */}
          <div className={`filters${phone && !fOpen && !empty ? ' shut' : ''}${empty ? ' bare' : ''}`}>
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
                <input type="search" placeholder="commander_" aria-label="Search commander" title="Type a name; Enter opens it" enterKeyHint="go" value={q} onChange={(e) => setQ(e.target.value)} />
                <span aria-hidden="true" className="hfade fade" />
              </label>
              {!empty && (<div className="flap" id="fflap">
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
                  <button type="button" key={l} aria-pressed={colours.includes(l)} aria-label={n} onClick={() => (haptic(colours.includes(l) ? 'tap' : 'select'), toggle(l))}>
                    <ManaIcon c={l} />
                    <b aria-hidden="true">{l}</b>
                    <i aria-hidden="true" style={{ background: bar }} />
                  </button>
                ))}
              </div>
              </div>)}
            </form>
          </div>
        </section>

        {pending > 0 && commanders.length > 0 && <Progress done={commanders.length - pending} total={commanders.length} what="Checking EDHREC average decks" />}
        {sort === 'added' && data?.undated && (
          <p className="count">Cards imported before dates were recorded have no date, so they're listed last. Re-import your ManaBox CSV with "Replace binder" (Collection tab) to use its real "Added" dates.</p>
        )}
        {/* The commander count is the title's answer ("335 DECKS"), so no count line here */}
        {!commanders.length && data && <Welcome empty={s.mine.size === 0} />}
        <ul className="cgrid" ref={gridRef}>
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
                  {/* The % and battery below say how much is owned; the tag says what's left (no sentence repeating both). */}
                  {!st && <span className="own">{st === null ? 'No EDHREC deck yet.' : 'Checking EDHREC…'}</span>}
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
