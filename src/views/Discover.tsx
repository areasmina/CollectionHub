import { haptic } from '../lib/haptics';
import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { CardSpin } from './CardSpin';

const CommanderView = lazy(() => import('./Commander').then((m) => ({ default: m.CommanderView })));
import { db, type Card } from '../lib/db';
import { cachedPage, cachedPages, fetchPage, NoPage, pagePath } from '../lib/edhrec';
import { binderSig, loadStats, plan, saveStats, statOf, type SavedStat } from '../lib/cmdrstats';
import { slug } from '../lib/names';
import { openCollection } from '../lib/nav';
import { EmptyState, OptRow, Progress, ToolBar, usd, useStored, type Shared } from './shared';
import { Pips, Ransom, Title, EyeDoodle, ManaIcon, PageDecor } from './zine';
import { Meter } from './parts';

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
type Cmdr = Card & { added?: number };

// Stats are saved on the device per binder (lib/cmdrstats), so a reload shows them at once; this copy also skips the
// IndexedDB read when switching pages. Old EDHREC pages are re-downloaded quietly after everything is shown.
const REFRESH_MS = 7 * 864e5;
let memo: { profile: number; sig: string; map: Map<string, SavedStat> } | null = null;

/** First run (or a binder with no legends yet): three numbered steps instead of an empty page. */
function Welcome({ empty }: { empty: boolean }) {
  const steps: [string, string][] = [
    ['IMPORT YOUR CARDS', 'ManaBox CSV, Moxfield / Archidekt text or a plain list. No list yet? Try the sample collection there. Nothing leaves this device.'],
    ['SEE WHAT YOU CAN BUILD', 'Every commander you own, ranked by how much of its deck is already in your binder.'],
    ['OPEN ONE, SWAP FROM YOUR BINDER', 'Missing cards get stand-ins you own. Buy only what\'s worth it.'],
  ];
  return (
    <section className="welcome u-panel" aria-label="Getting started">
      <ol>
        {steps.map(([h, p], i) => (
          <li key={h}>
            <span className="wn">{i + 1}</span>
            <b>{h}</b>
            <span>{p}</span>
          </li>
        ))}
      </ol>
      <p className="count">{empty ? 'Your binder is empty.' : 'No commanders in this binder yet.'} You can also type any commander in the search above and press Enter.</p>
      <button className="u-btn primary" onClick={() => (haptic('select'), openCollection())}>
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
  const [zoom, setZoom] = useStored<'s' | 'm' | 'l'>('ch:discozoom', 'm', ['s', 'm', 'l']);
  const [phone, setPhone] = useState(() => (typeof matchMedia === 'function' ? matchMedia('(max-width: 700px)').matches : window.innerWidth <= 700));
  // up to tablets the eye sits on the logo (behind the letters) instead of taking a third of the first screen
  const [eyeOnLogo, setEyeOnLogo] = useState(() => (typeof matchMedia === 'function' ? matchMedia('(max-width: 1024px)').matches : window.innerWidth <= 1024));
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mp = matchMedia('(max-width: 700px)');
    const me = matchMedia('(max-width: 1024px)');
    const onP = () => setPhone(mp.matches);
    const onE = () => setEyeOnLogo(me.matches);
    mp.addEventListener('change', onP);
    me.addEventListener('change', onE);
    return () => (mp.removeEventListener('change', onP), me.removeEventListener('change', onE));
  }, []);
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

  // Stats for every commander. First recount from pages already on the device (fast bulk read, no network), then fetch missing
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
    let lastFlush = 0;
    let lastSave = 0;
    const flush = (force = false) => {
      const now = Date.now();
      if (!force && now - lastFlush < 250) return;
      lastFlush = now;
      memo = { profile, sig, map: new Map(map) };
      setSaved(memo);
      if (force || now - lastSave > 2000) {
        lastSave = now;
        void saveStats(profile, sig, map);
      }
    };
    (async () => {
      const refresh = new Set(work.refresh);
      if (work.recount.length) {
        const pairs = work.recount.map((k) => [k, pagePath('average', slug(byKey.get(k)!.name))] as const);
        const hits = await cachedPages(pairs.map(([, p]) => p));
        if (!live) return;
        let anyHit = false;
        for (const [k, p] of pairs) {
          const hit = hits.get(p);
          if (hit) {
            map.set(k, { stat: statOf(hit.page, s.mine, byKey.get(k)?.name), at: hit.at });
            anyHit = true;
          } else {
            refresh.add(k);
          }
        }
        if (anyHit) flush(true);
      }
      if (live) await saveStats(profile, sig, map);
      const queue = [...refresh].sort((a, b) => byKey.get(a)!.name.localeCompare(byKey.get(b)!.name));
      let idx = 0;
      const worker = async () => {
        while (live && idx < queue.length) {
          const k = queue[idx++];
          const path = pagePath('average', slug(byKey.get(k)!.name));
          // No EDHREC page = null; offline or an error: keep what's shown and try again next time.
          const stat = await fetchPage(path, REFRESH_MS)
            .then((p) => statOf(p, s.mine, byKey.get(k)!.name))
            .catch((e) => (e instanceof NoPage ? null : undefined));
          if (!live) return;
          if (stat !== undefined) {
            map.set(k, { stat, at: Date.now() });
            flush(false);
          }
        }
      };
      await Promise.all(Array.from({ length: 6 }, () => worker()));
      if (live) flush(true);
    })();
    return () => {
      live = false;
      saveStats(profile, sig, map);
    };
  }, [saved?.profile, sig, commanders.length, open, !!data]);

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
  const warmCmdr = (name: string) => {
    void import('./Commander');
    const sSlug = slug(name);
    void cachedPage(pagePath('average', sSlug));
    void cachedPage(pagePath('commander', sSlug));
  };

  const sortName = (SORTS.find(([v]) => v === sort)?.[1] ?? '').split(':')[0];
  const open1 = () => q.trim() && (setOpenNo(shown[0] ? 1 : undefined), setOpen(shown[0]?.name ?? q.trim()));

  // THE OVERHAUL, Discover: the loud frame (ransom title, the eye, one tagline) → one tool bar → a flat grid of commanders.
  return (
    <>
      <PageDecor
        seed={501}
        rays="46% 30%"
        sheet={{
          side: 'right',
          top: 520,
          rot: -6,
        }}
      />
      <main className="dpage disc">
      <section className="discohero" aria-label="What can I build?">
        {/* Up to tablets the eye blazes behind the title letters; wide screens give it its own cell. */}
        <Title
          text="WHAT CAN I BUILD?"
          label="What can I build?"
          size={phone ? 50 : 44}
          seed={7}
          behind={<EyeDoodle bare />}
          after={
            <>
              {commanders.length > 0 && (
                // The answer to the title, in the same cut-out letters: how many commander decks this binder can build.
                <p className="tanswer" aria-live="polite" aria-label={shown.length === commanders.length ? `${commanders.length} commander decks you can build` : `${shown.length} of ${commanders.length} commanders shown`}>
                  <Ransom text={shown.length === commanders.length ? `${commanders.length} DECK${commanders.length === 1 ? '' : 'S'}` : `${shown.length} OF ${commanders.length}`} size={phone ? 28 : 30} seed={23} />
                </p>
              )}
              <p className="tagline">Your collection. Real decks. No guesswork.</p>
            </>
          }
        />
      </section>

      {/* One tool bar: search (Enter opens the first match, or any commander by name), ⋮ holds colours and sort. */}
      <form className="dfind" aria-label="Find a commander" onSubmit={(e) => (e.preventDefault(), open1())}>
        <ToolBar
          q={q}
          setQ={setQ}
          placeholder="commander_"
          searchLabel="Search commander"
          label="Commanders: search and options"
          now={empty ? '' : [colours.join(' '), sortName].filter(Boolean).join(' · ')}
          extra={
            <label className="sortsel">
              <select aria-label="Sort commanders" value={sort} onChange={(e) => (haptic('select'), setSort(e.target.value))}>
                {SORTS.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          }
          quick={
            <button
              type="button"
              className="u-btn ghost qzoom-btn"
              title={{ s: 'Size: Small. Tap for Medium', m: 'Size: Medium. Tap for Large', l: 'Size: Large. Tap for Small' }[zoom]}
              aria-label={`Deck card size ${zoom.toUpperCase()}: tap to cycle size`}
              onClick={() => {
                haptic('select');
                setZoom(zoom === 's' ? 'm' : zoom === 'm' ? 'l' : 's');
              }}
            >
              SIZE {zoom.toUpperCase()}
            </button>
          }
        >
          {/* Mana identity filters first (owner request) */}
          <OptRow label="COLOUR">
            <div className="colours" role="group" aria-label="Filter by colour identity">
              {COLOURS.map(([l, n]) => (
                <button
                  type="button"
                  key={l}
                  data-c={l}
                  className="u-chip mana-filter-btn"
                  aria-pressed={colours.includes(l)}
                  aria-label={n}
                  title={n}
                  onClick={() => (haptic(colours.includes(l) ? 'tap' : 'select'), toggle(l))}
                >
                  <ManaIcon c={l} />
                </button>
              ))}
            </div>
          </OptRow>
          <OptRow label="SORT">
            <div className="sorts" role="radiogroup" aria-label="Sort">
              {SORTS.map(([v, t]) => (
                <button type="button" key={v} role="radio" className="u-chip" aria-checked={sort === v} onClick={() => (haptic('select'), setSort(v))}>
                  {t}
                </button>
              ))}
            </div>
          </OptRow>
        </ToolBar>
      </form>
      {/* What narrows the list is never hidden: one removable chip per colour, and an easy reset */}
      {colours.length > 0 && (
        <div className="fchips" role="group" aria-label="Active filters">
          {colours.map((l) => (
            <button key={l} type="button" className="fchip" aria-label={`Remove filter ${COLOURS.find(([x]) => x === l)?.[1] ?? l}`} onClick={() => (haptic('select'), toggle(l))}>
              {COLOURS.find(([x]) => x === l)?.[1] ?? l} <span aria-hidden="true">✕</span>
            </button>
          ))}
          <button type="button" className="fclear" onClick={() => (haptic('select'), setColours([]))}>
            Clear all
          </button>
          <span className="fcounts" role="status">
            {shown.length} of {commanders.length} commanders shown
          </span>
        </div>
      )}

      {pending > 0 && commanders.length > 0 && <Progress done={commanders.length - pending} total={commanders.length} what="Checking EDHREC average decks" />}
      {sort === 'added' && data?.undated && (
        <p className="count">Cards imported before dates were recorded have no date, so they're listed last. Re-import your ManaBox CSV with "Replace binder" (Collection tab) to use its real "Added" dates.</p>
      )}
      {/* The commander count is the title's answer ("335 DECKS"), so no count line here */}
      {!commanders.length && data && <Welcome empty={s.mine.size === 0} />}
      {!empty && shown.length === 0 && (
        <EmptyState
          title="No commander matches"
          action={
            <button type="button" className="u-btn" onClick={() => (haptic('select'), setQ(''), setColours([]))}>
              CLEAR SEARCH AND COLOURS
            </button>
          }
        >
          {q.trim() ? `None of your ${commanders.length} commanders matches “${q.trim()}”. Press Enter to open any commander by name.` : 'None of your commanders has all of these colours.'}
        </EmptyState>
      )}
      <ul className="cgrid" data-zoom={zoom} ref={gridRef}>
        {shown.map((c, i) => {
          const st = stats.get(c.key);
          const ready = st && st.missing === 0; // READY is kept for the build checks; this is ownership
          return (
            <li key={c.id}>
              <button
                type="button"
                className="ccard"
                onPointerEnter={() => warmCmdr(c.name)}
                onTouchStart={() => warmCmdr(c.name)}
                onClick={() => (setOpenNo(i + 1), setOpen(c.name))}
                aria-label={`${c.name}${st ? `, ${st.pct}% owned of the average EDHREC deck, ${st.missing} cards missing` : ''}`}
              >
                <span className="cart">{c.img && <img src={c.img.replace('/small/', '/art_crop/')} alt="" loading="lazy" />}</span>
                <span className="cinfo">
                  <span className={`nm${c.ci.length >= 4 ? ' wide-pips' : ''}`}>
                    <span>{c.name.split(' // ')[0]}</span>
                    <Pips ci={c.ci} size={zoom === 's' ? (c.ci.length >= 4 ? 12 : 14) : zoom === 'l' ? 22 : 17} />
                  </span>
                  {st ? (
                    <span className="cmatch">
                      <b>{st.pct}%</b>
                      <Meter pct={st.pct} label={`${st.pct}% of the average deck owned`} tone="discover" />
                    </span>
                  ) : (
                    <span className="own">{st === null ? 'No EDHREC deck yet' : 'Checking EDHREC…'}</span>
                  )}
                  <span className="cfoot">
                    <span>{[st?.decks != null ? `${st.decks.toLocaleString()} decks avg` : '', usd(c)].filter(Boolean).join(' · ')}</span>
                    {st && <span className={`cstate${ready ? ' ready' : ''}`}>{ready ? 'ALL OWNED' : `${st.missing} MISSING`}</span>}
                  </span>
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
