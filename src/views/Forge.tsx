import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { db, type Card, type DeckCard } from '../lib/db';
import { haptic } from '../lib/haptics';
import { norm } from '../lib/names';
import { searchByText } from '../lib/search';
import type { NotOffered } from '../lib/collsearch';
import { BASICS } from '../lib/compare';
import { isLand, roleOf, type DeckStats, type Role } from '../lib/deckstats';
import type { SubCard } from '../lib/subs';
import type { CardFilter } from '../lib/edhrec';
import { themeOf } from '../brain/themes';
import { deckNeeds, scoreCard, type DeckContext, type Part } from '../brain/score';
import type { Taken } from '../lib/copies';
import type { Aggression } from '../brain/win';
import { dragEnd, dragStart, fromOf, holdToDrag, lightOff, lightUp, DRAG_TYPE, type DropAt } from '../lib/drag';
import { usd } from './shared';
import { cad, shopUrl } from '../lib/prices';

/**
 * The Forge (approved plan, Nov 6): a focus mode for building a deck. The rest of the app steps back (nav, decoration);
 * the deck stays on the left, ANALYSIS + SUGGESTIONS (and TO BUY) on the right; on phones the suggestions are a bottom sheet. Suggestions are ranked by the
 * brain's needs-aware score (src/brain/score.ts) with its real parts as the reasons, never an invented number.
 */

/** Focus mode on the whole page while `on` (the nav and the page decoration step back). */
export function useForgeMode(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const el = document.documentElement;
    el.classList.add('forging');
    return () => el.classList.remove('forging');
  }, [on]);
}

/** Leave the Forge with Esc (unless a window is open on top) and undo the last change with Ctrl/Cmd+Z. */
function useForgeKeys(onLeave: () => void, onUndo?: () => void) {
  const live = useRef({ onLeave, onUndo });
  live.current = { onLeave, onUndo };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select');
      const over = document.querySelector('.swapnote, .note-pop, .cmenu, .leavenote, [role="dialog"], [role="alertdialog"]');
      if (e.key === 'Escape' && !over && !typing) return live.current.onLeave();
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing && live.current.onUndo) {
        e.preventDefault();
        haptic('undo');
        live.current.onUndo();
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);
}

/** The Forge's own top bar: FORGE stamp, the deck, the last undo, SAVE (commander page) and ✕ LEAVE. */
export function ForgeTop({ label, sub, undo, onLeave, onSave, saving, reserved }: { label: string; sub?: string; undo?: { text: string; run: () => void }; onLeave: () => void; onSave?: () => void; saving?: boolean; reserved?: boolean }) {
  useForgeKeys(onLeave, undo?.run);
  return (
    <div className="forgetop" role="toolbar" aria-label="Forge">
      <span className="fstamp" aria-hidden="true">
        FORGE
      </span>
      <span className="ftitle">
        <b>
          {label}
          {reserved && (
            <span className="fres" title="This deck holds its copies: other decks can't use them">
              RESERVED
            </span>
          )}
        </b>
        {sub && <small>{sub}</small>}
      </span>
      {undo && (
        <button className="u-btn ghost fundo" onClick={() => (haptic('undo'), undo.run())} title="Undo (Ctrl+Z)">
          ↺ UNDO <small>{undo.text}</small>
        </button>
      )}
      {onSave && (
        <button className="u-btn primary forge" onClick={onSave} disabled={saving}>
          SAVE
        </button>
      )}
      <button className="u-btn ghost fleave" onClick={() => (haptic('tap'), onLeave())} title="Leave the Forge (Esc)">
        ✕ LEAVE
      </button>
    </div>
  );
}

/**
 * Phones in the Forge (Guillermo, Nov 11): the deck area is a cube with three faces, swiped sideways or picked here:
 * CARDS · ANALYSIS · TO BUY. The faces are the deck grid's own panes (.lists, .forge-analysis, .forge-buy); the grid
 * becomes a sideways snap scroller under 700px (polish.css) and takes the height of the face in view.
 */
const FACES = [
  ['.lists', 'CARDS'],
  ['.forge-analysis', 'ANALYSIS'],
  ['.forge-buy', 'TO BUY'],
] as const;
export function ForgeCube({ grid, buyCount }: { grid: { current: HTMLElement | null }; buyCount?: number }) {
  const [face, setFace] = useState(0);
  const bar = useRef<HTMLDivElement>(null);
  const faceRef = useRef(0);
  useEffect(() => {
    const g = grid.current;
    if (!g) return;
    const phone = matchMedia('(max-width: 700px)');
    const paneOf = (i: number) => g.querySelector<HTMLElement>(`:scope > ${FACES[i][0]}`);
    const fit = () => {
      if (!phone.matches) return void (g.style.height = '');
      const p = paneOf(faceRef.current);
      if (p) g.style.height = `${p.offsetHeight}px`;
    };
    const sync = () => {
      if (!phone.matches) return;
      let best = 0;
      FACES.forEach((_, i) => {
        const p = paneOf(i);
        const b = paneOf(best);
        if (p && b && Math.abs(p.offsetLeft - g.scrollLeft) < Math.abs(b.offsetLeft - g.scrollLeft)) best = i;
      });
      if (best !== faceRef.current) {
        faceRef.current = best;
        setFace(best);
        haptic('select');
        // the new face starts at the top: bring the cube's top back into view if the page was scrolled past it
        const top = bar.current?.getBoundingClientRect().top ?? 0;
        if (top < 0) bar.current?.scrollIntoView({ block: 'start' });
      }
      fit();
    };
    let t = 0;
    const onScroll = () => (clearTimeout(t), (t = window.setTimeout(sync, 60)));
    g.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(fit);
    FACES.forEach((_, i) => {
      const p = paneOf(i);
      if (p) ro.observe(p);
    });
    phone.addEventListener('change', fit);
    fit();
    return () => {
      clearTimeout(t);
      g.removeEventListener('scroll', onScroll);
      ro.disconnect();
      phone.removeEventListener('change', fit);
      g.style.height = '';
    };
  }, [grid]);
  const go = (i: number) => {
    const g = grid.current;
    const p = g?.querySelector<HTMLElement>(`:scope > ${FACES[i][0]}`);
    if (!g || !p) return;
    haptic('select');
    faceRef.current = i;
    setFace(i);
    g.style.height = `${p.offsetHeight}px`;
    g.scrollTo({ left: p.offsetLeft, behavior: 'smooth' });
    const top = bar.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) bar.current?.scrollIntoView({ block: 'start' });
  };
  return (
    <div className="fcube" ref={bar} role="tablist" aria-label="Deck faces: swipe sideways">
      {FACES.map(([, label], i) => (
        <button key={label} type="button" role="tab" aria-selected={face === i} onClick={() => go(i)}>
          {label}
          {label === 'TO BUY' && buyCount ? <small>{buyCount}</small> : null}
        </button>
      ))}
      <span className="fcube-dots" aria-hidden="true">
        {FACES.map((_, i) => (
          <i key={i} className={face === i ? 'on' : ''} />
        ))}
      </span>
    </div>
  );
}

/** The cube's TO BUY face on a saved deck: the cards you don't own, cheapest first, each price a shop link. */
export function BuyList({ items, binder }: { items: { name: string; qty: number; cad?: number }[]; binder: string }) {
  const total = items.reduce((n, c) => n + (c.cad ?? 0) * c.qty, 0);
  const rows = [...items].sort((a, b) => (a.cad ?? 1e9) - (b.cad ?? 1e9) || a.name.localeCompare(b.name));
  return (
    <section className="fbuylist" aria-label="To buy">
      <h3>
        TO BUY <small>{items.reduce((n, c) => n + c.qty, 0)} cards{total > 0 ? ` · ≈${cad(total)}` : ''}</small>
      </h3>
      {rows.length === 0 ? (
        <p className="fbuy-none">Nothing to buy: every card is in {binder}.</p>
      ) : (
        <ul>
          {rows.map((c) => (
            <li key={c.name}>
              <span className="nm">
                {c.qty > 1 ? `${c.qty}× ` : ''}
                {c.name}
              </span>
              {c.cad != null ? (
                <a className="u-sticker" href={shopUrl(c.name)} target="_blank" rel="noreferrer" title={`Find ${c.name} in a shop`}>
                  ≈{cad(c.cad)}
                </a>
              ) : (
                <a className="fbuy-find" href={shopUrl(c.name)} target="_blank" rel="noreferrer">
                  FIND ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const METERS: [Role | 'lands' | 'mv', string][] = [
  ['lands', 'LANDS'],
  ['ramp', 'RAMP'],
  ['draw', 'DRAW'],
  ['removal', 'REMOVAL'],
  ['wipes', 'WIPES'],
  ['mv', 'AVG MV'],
];
const ROLE_WORD: Record<Role, string> = { ramp: 'ramp', draw: 'draw', removal: 'removal', wipes: 'wipes', tutors: 'tutors' };
type Range = (r: Role) => [number, number] | undefined;

/** What the deck is short of, in plain words: "draw (2 short)". */
export function shortOf(st: DeckStats, range: Range) {
  return (['draw', 'ramp', 'removal', 'wipes'] as Role[]).flatMap((r) => {
    const rg = range(r);
    return rg && st.roles[r] < rg[0] ? [{ role: r, short: rg[0] - st.roles[r] }] : [];
  });
}

/**
 * ANALYSIS meters for the Forge: lands, ramp, draw, removal, wipes and average mana value, each against the range the
 * brain's dial asks for. A meter that moved with the last change tweens and shows +1 / −1; the curve bar that changed
 * lights up; a yellow NEEDS line says what the list below is now chasing.
 */
export function ForgeMeters({
  st,
  range,
  match,
  expanded: controlledExpanded,
  onToggleExpand,
}: {
  st: DeckStats;
  range: Range;
  match?: number;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const [localExpanded, setLocalExpanded] = useState(() => {
    try {
      return localStorage.getItem('ch:forge:an_expanded') !== 'false';
    } catch {
      return true;
    }
  });
  const expanded = controlledExpanded !== undefined ? controlledExpanded : localExpanded;
  const toggle = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setLocalExpanded((v) => {
        try {
          localStorage.setItem('ch:forge:an_expanded', String(!v));
        } catch {}
        return !v;
      });
    }
    haptic('tap');
  };

  const now: Record<string, number> = { lands: st.lands, mv: Math.round(st.avgMv * 100) / 100, ...st.roles };
  const prev = useRef<{ v: Record<string, number>; curve: number[] } | null>(null);
  const [delta, setDelta] = useState<{ v: Record<string, number>; curve: Set<number>; at: number }>({ v: {}, curve: new Set(), at: 0 });
  const sig = JSON.stringify([now, st.curve]);
  useEffect(() => {
    const p = prev.current;
    prev.current = { v: now, curve: st.curve };
    if (!p || st.unknown) return;
    const v: Record<string, number> = {};
    for (const k of Object.keys(now)) if (now[k] !== p.v[k]) v[k] = Math.round((now[k] - p.v[k]) * 100) / 100;
    const curve = new Set(st.curve.flatMap((n, i) => (n !== p.curve[i] ? [i] : [])));
    if (Object.keys(v).length || curve.size) setDelta({ v, curve, at: Date.now() });
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const needs = shortOf(st, range);
  const top = Math.max(1, ...st.curve);

  // Veteran MTG Player Analytics
  const earlyPlays = st.curve.slice(0, 4).reduce((a, b) => a + b, 0); // CMC 0, 1, 2, 3
  const nonLandTotal = Math.max(1, st.total - st.lands);
  const earlyPct = Math.round((earlyPlays / nonLandTotal) * 100);

  const pipColors = (['W', 'U', 'B', 'R', 'G'] as const).filter((c) => (st.pips?.[c] ?? 0) > 0);
  const totalPips = pipColors.reduce((sum, c) => sum + (st.pips[c] ?? 0), 0);
  const dominantColor = useMemo(() => {
    if (!totalPips || !pipColors.length) return null;
    let max = pipColors[0];
    for (const c of pipColors) {
      if ((st.pips[c] ?? 0) > (st.pips[max] ?? 0)) max = c;
    }
    const colorNames: Record<string, string> = {
      W: 'White',
      U: 'Blue',
      B: 'Black',
      R: 'Red',
      G: 'Green',
    };
    return {
      symbol: max,
      name: colorNames[max] ?? max,
      pct: Math.round(((st.pips[max] ?? 0) / totalPips) * 100),
      count: st.pips[max] ?? 0,
    };
  }, [st.pips, totalPips, pipColors]);

  const typeCounts = [
    ['Creatures', st.groups?.get('Creatures') ?? 0],
    ['Instants', st.groups?.get('Instants') ?? 0],
    ['Sorceries', st.groups?.get('Sorceries') ?? 0],
    ['Artifacts', st.groups?.get('Artifacts') ?? 0],
    ['Enchantments', st.groups?.get('Enchantments') ?? 0],
    ['Planeswalkers', st.groups?.get('Planeswalkers') ?? 0],
    ['Lands', st.lands],
  ].filter(([, count]) => (count as number) > 0) as [string, number][];

  return (
    <section className={`fmeters ${expanded ? 'expanded' : 'contracted mini'}`} aria-label="Forge analysis">
      <div className="fmeters-header">
        <h3>
          ANALYSIS
          {match != null && <span className="fmatch">MATCH {match}%</span>}
        </h3>
        <button
          type="button"
          className="fexp-btn"
          title={expanded ? 'Contract analysis (compact animated curve)' : 'Expand analysis (veteran MTG breakdown)'}
          aria-label={expanded ? 'Contract analysis' : 'Expand analysis'}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          {expanded ? 'CONTRACT ◂' : 'EXPAND ⤢'}
        </button>
      </div>

      {/* The Animated Mana Curve Graph (always shown & animated!) */}
      <div
        className={`fcurve${!expanded ? ' mini-curve' : ''}`}
        role="img"
        aria-label={`Mana curve: ${st.curve.map((n, i) => `${i === 7 ? '7+' : i}: ${n}`).join(', ')}`}
        onClick={!expanded ? toggle : undefined}
        style={{ cursor: !expanded ? 'pointer' : undefined }}
        title={!expanded ? 'Tap to expand full analysis' : undefined}
      >
        {st.curve.map((n, i) => (
          <span key={i} className={delta.curve.has(i) ? 'lit' : ''} data-at={delta.curve.has(i) ? delta.at : undefined}>
            <i style={{ height: `${Math.round((n / top) * 100)}%` }} />
            <small>{i === 7 ? '7+' : i}</small>
          </span>
        ))}
      </div>

      {!expanded ? (
        /* Contracted / Mini View: compact animated dock with curve, lands, avg MV and role health dots */
        <div className="fm-mini-body" onClick={toggle} title="Tap to expand full analysis" style={{ cursor: 'pointer' }}>
          <div className="fm-mini-row">
            <span className="fm-mini-chip"><b>{st.lands}</b> lands</span>
            <span className="fm-mini-chip"><b>{st.avgMv.toFixed(2)}</b> avg</span>
          </div>
          <div className="fm-mini-dots" title="Role health: Lands · Ramp · Draw · Removal · Wipes">
            {METERS.map(([k, label]) => {
              const rg = k === 'lands' ? ([33, 38] as [number, number]) : k === 'mv' ? undefined : range(k);
              const v = now[k];
              const tone = !rg ? '' : v < rg[0] ? 'low' : v > rg[1] ? 'high' : 'ok';
              return (
                <span
                  key={k}
                  className={`fm-dot ${tone}`}
                  title={`${label}: ${v}${rg ? ` (target ${rg[0]}–${rg[1]})` : ''}`}
                />
              );
            })}
          </div>
        </div>
      ) : (
        /* Expanded View: Full Veteran MTG Analysis */
        <>
          <div className="fm-velocity-bar">
            <span><b>{st.avgMv.toFixed(2)}</b> non-land MV</span>
            <span><b>{earlyPlays}</b> early plays (CMC ≤ 3, {earlyPct}%)</span>
          </div>

          <ul>
            {METERS.map(([k, label]) => {
              const rg = k === 'lands' ? ([33, 38] as [number, number]) : k === 'mv' ? undefined : range(k);
              const v = now[k];
              const d = delta.v[k];
              const fill = k === 'mv' ? Math.min(1, v / 5) : Math.min(1, v / Math.max(1, (rg?.[1] ?? v) * 1.25));
              const tone = !rg ? '' : v < rg[0] ? ' low' : v > rg[1] ? ' high' : ' ok';
              return (
                <li key={k} className={`fm${tone}`} title={rg ? `${label.toLowerCase()}: ${v} (usual ${rg[0]}–${rg[1]})` : `${label.toLowerCase()}: ${v}`}>
                  <span className="fl">{label}</span>
                  <span className="fbar" aria-hidden="true">
                    <i style={{ width: `${Math.round(fill * 100)}%` }} />
                  </span>
                  <b>{k === 'mv' ? v.toFixed(2) : v}</b>
                  {d ? (
                    <span key={delta.at} className={`fdelta${d > 0 ? ' up' : ' down'}`}>
                      {d > 0 ? '+' : '−'}
                      {k === 'mv' ? Math.abs(d).toFixed(2) : Math.abs(d)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {totalPips > 0 && (
            <div className="fm-pips-sec">
              <div className="fm-sec-title">MANA PIP BALANCE</div>
              <div className="fm-pips-track">
                {pipColors.map((c) => {
                  const pct = Math.round(((st.pips[c] ?? 0) / totalPips) * 100);
                  return (
                    <span
                      key={c}
                      className={`fm-pip-bar col-${c}`}
                      style={{ width: `${pct}%` }}
                      title={`${c}: ${st.pips[c]} pips (${pct}%)`}
                    />
                  );
                })}
              </div>
              <div className="fm-pips-legend">
                {pipColors.map((c) => (
                  <span key={c} className={`fm-pip-chip col-${c}`}>
                    <b>{c}</b> {Math.round(((st.pips[c] ?? 0) / totalPips) * 100)}% <small>({st.pips[c]})</small>
                  </span>
                ))}
              </div>
              {dominantColor && (
                <p className="fm-pip-advice">
                  <b>{dominantColor.name}</b> is dominant ({dominantColor.pct}% of color symbols).
                </p>
              )}
            </div>
          )}

          {typeCounts.length > 0 && (
            <div className="fm-types-sec">
              <div className="fm-sec-title">TYPE BREAKDOWN</div>
              <div className="fm-type-chips">
                {typeCounts.map(([t, n]) => (
                  <span key={t} className="fm-type-chip">
                    <b>{n}</b> {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {needs.length > 0 && (
            <p className="fneeds" role="status">
              NEEDS: {needs.map((n) => `${n.short} more ${ROLE_WORD[n.role]}`).join(' · ')}
            </p>
          )}
        </>
      )}
    </section>
  );
}

export type ForgeSort = 'ours' | 'lift' | 'pop';
const SORTS: [ForgeSort, string, string][] = [
  ['ours', 'OUR PICK', "EDHREC's lift and play rate, plus cards you own and what the deck is short of"],
  ['lift', 'EDHREC LIFT', 'How much more this commander’s decks play the card than decks in general (EDHREC lift)'],
  ['pop', 'POPULAR', 'How many of this commander’s EDHREC decks play the card'],
];
type Tab = 'all' | 'owned' | 'missing';
/** How many of your matching cards a search lists at once (the suggestions list stops at 60 too). */
const SEARCH_MAX = 60;
const OWN_W = 0.1; // a card you own is a card you can play tonight: a small, stated nudge

interface Row {
  c: SubCard;
  owned: number;
  card?: Card;
  total: number;
  parts: Part[];
  blocked?: string;
  roles: Role[];
  fits: boolean;
}

/**
 * The live suggestions list. Sources: EDHREC's cards for this commander (or the theme picked) plus every card you own
 * in its colours. Sort OUR PICK · EDHREC LIFT · POPULAR; search your own cards; chips for what the deck needs, themes
 * and EDHREC's With / Without card filter; tabs ALL · OWNED · TO BUY. Prices are shown and never change the order.
 */
export function ForgeSuggest({
  profile,
  deck,
  commander,
  bracket,
  candidates,
  cardOf,
  ownedOf,
  taken,
  imgOf,
  themes = [],
  theme: pageTheme = '',
  buy,
  cf,
  onCf,
  cfNote,
  placing,
  onPlace,
  onAdd,
  onCut,
  loading,
  aggression: dial,
  expanded: controlledExpanded,
  onToggleExpand,
  onJustBuild,
  building,
  openSearch = 0,
  whyNot,
}: {
  aggression?: Aggression; // the page's dial (the commander page sets it from POWER); else your brain setting
  profile: number;
  deck: DeckCard[];
  commander?: string;
  bracket: number;
  candidates: SubCard[];
  cardOf: (name: string) => Card | undefined;
  ownedOf: (name: string) => number;
  taken?: (name: string) => Taken | undefined; // copies your other decks already use
  imgOf: (name: string) => string | undefined;
  themes?: { slug: string; value: string; count: number }[];
  theme?: string; // the theme picked on the page (EDHREC tag slug): suggestions start filtered to it
  buy?: ReactNode; // the TO BUY receipt, as a second pane
  cf?: CardFilter;
  onCf?: (f: CardFilter) => void;
  cfNote?: string;
  placing: string | null;
  onPlace: (name: string | null) => void;
  onAdd?: (name: string) => void; // saved decks: a card can be added (the commander page swaps slots only)
  onCut?: (name: string) => void; // a deck card dropped back on the list
  loading?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onJustBuild?: () => void;
  building?: boolean;
  openSearch?: number; // goes up each time the page's + MY CARDS button is tapped: the panel opens on the search, focused
  whyNot?: (q: string) => NotOffered; // your cards that match the search but can't be added here, and why
}) {
  const [localExpanded, setLocalExpanded] = useState(() => {
    try {
      return localStorage.getItem('ch:forge:sug_expanded') !== 'false';
    } catch {
      return true;
    }
  });
  const expanded = controlledExpanded !== undefined ? controlledExpanded : localExpanded;
  const toggle = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setLocalExpanded((v) => {
        try {
          localStorage.setItem('ch:forge:sug_expanded', String(!v));
        } catch {}
        return !v;
      });
    }
    haptic('tap');
  };
  const brain = useLiveQuery(() => db.profiles.get(profile), [profile])?.brain;
  const aggression = (dial ?? brain?.aggression ?? 'hungry') as Aggression;
  const [sort, setSort] = useState<ForgeSort>('ours');
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [more, setMore] = useState(false);
  const [sheet, setSheet] = useState(false); // phones: the bottom sheet is pulled up
  const [pane, setPane] = useState<'sugg' | 'buy'>('sugg');
  // Theme chips (EDHREC's tags as rules-text tests, brain/themes.ts): the picked one filters the list and adds "fits <theme>".
  const [theme, setTheme] = useState(pageTheme);
  useEffect(() => setTheme(pageTheme), [pageTheme]);
  const tagOf = themes.find((t) => t.slug === theme);
  const focus = useMemo(() => (tagOf ? themeOf(tagOf.value) : undefined), [tagOf?.value]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cfDraft, setCfDraft] = useState({ inc: cf?.inc[0] ?? '', exc: cf?.exc[0] ?? '' });
  // + MY CARDS on the page's bar: show the suggestions pane, pull the phone sheet up, open the full list and put the
  // cursor in the search, so "look through my collection" is one tap from the deck.
  const qBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!openSearch) return;
    setPane('sugg');
    setSheet(true);
    if (!expanded) toggle();
    const t = setTimeout(() => qBox.current?.focus({ preventScroll: false }), 60);
    return () => clearTimeout(t);
  }, [openSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx: DeckContext = { deck, cardOf, commander, bracket, aggression, taste: brain?.taste, focus, taken };
  // which candidates have no copy to spare changes with the other decks, not with this one
  const takenKey = taken ? candidates.map((c) => taken(c.name)).filter(Boolean).map((t) => `${t!.used}/${t!.own}`).join(',') : '';
  const deckKey = deck.map((c) => `${c.name}×${c.qty}`).join('|');
  // recount when the deck, its card data (it loads after the names), the dial, your taste or the picked theme change
  // (the theme sets the enabler / payoff balance, so a stale count would nudge the wrong half of the engine)
  const sigNeeds = [deckKey, deck.filter((c) => cardOf(c.name)).length, aggression, bracket, brain?.taste?.length ?? 0, brain?.taste?.at(-1)?.at ?? 0, tagOf?.value ?? ''].join('#');
  const needs = useMemo(() => deckNeeds(ctx), [sigNeeds]); // eslint-disable-line react-hooks/exhaustive-deps
  // The list is rebuilt when the candidates themselves change, not only their number (a swap of one owned card for
  // another kept the old rows before), and when a card's EDHREC numbers arrive.
  const candKey = candidates.map((c) => `${c.name}:${c.incl ?? ''}:${c.lift ?? ''}`).join('|') + '#' + takenKey;
  const rows: Row[] = useMemo(() => {
    const seen = new Set<string>();
    const out: Row[] = [];
    for (const c of candidates) {
      const k = norm(c.name);
      if (seen.has(k) || needs.names.has(k) || BASICS.has(k) || (commander && k === norm(commander))) continue;
      seen.add(k);
      const card = cardOf(c.name);
      const owned = ownedOf(c.name);
      const sc = scoreCard({ ...c, type: c.type ?? card?.type, cmc: c.cmc ?? card?.cmc }, ctx, needs);
      const parts = owned ? [...sc.parts, { label: 'owned', value: OWN_W, source: 'deck needs' as const }] : sc.parts;
      out.push({ c, owned, card, total: sc.total + (owned ? OWN_W : 0), parts, blocked: sc.blocked, roles: card && !isLand(card.type) ? roleOf({ ...card, name: c.name }) : [], fits: !!(focus && card && focus.test(card)) });
    }
    return out;
  }, [needs, focus, candKey, candidates.filter((c) => cardOf(c.name)).length]); // eslint-disable-line react-hooks/exhaustive-deps

  const short = shortOf(needs.stats, needs.range);
  const searching = q.trim().length >= 2;
  const value = (r: Row) => (sort === 'ours' ? r.total : sort === 'lift' ? (r.c.lift ?? (r.c.synergy != null ? 1 + r.c.synergy : 0)) : (r.c.incl ?? 0));
  let list = rows.filter((r) => (tab === 'owned' ? r.owned > 0 : tab === 'missing' ? r.owned === 0 : true) && (!role || r.roles.includes(role)) && (!focus || r.fits));
  // The search covers every card of yours that can go in this deck (in the commander's colours, not already in it):
  // name, rules text, type line. It looks past the OWNED / NOT OWNED tab, the role chip and the theme chip, which only
  // narrow the suggestions: a card you own is found even when the app would not have suggested it.
  if (searching) list = searchByText(rows.filter((r) => r.owned > 0), q, (r) => ({ name: r.c.name, type: r.card?.type ?? r.c.type, text: r.card?.text }));
  else list = [...list].sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked) || value(b) - value(a) || a.c.name.localeCompare(b.c.name));
  const shown = list.slice(0, searching ? SEARCH_MAX : more ? 60 : 20);
  const narrowed = tab !== 'all' || !!role || !!focus;
  const not = searching && whyNot ? whyNot(q) : undefined;

  // Rows that change place slide to it (FLIP) with a green flash, so you see what the last change moved.
  const box = useRef<HTMLOListElement>(null);
  const tops = useRef(new Map<string, number>());
  const order = shown.map((r) => r.c.name).join('|');
  useLayoutEffect(() => {
    const ul = box.current;
    if (!ul) return;
    const calm = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, number>();
    for (const li of ul.querySelectorAll<HTMLElement>(':scope > li[data-name]')) {
      const n = li.dataset.name!;
      const top = li.offsetTop;
      next.set(n, top);
      const was = tops.current.get(n);
      if (was == null || was === top || calm || !li.animate) continue;
      li.animate([{ transform: `translateY(${was - top}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
      if (was > top) li.animate([{ backgroundColor: 'rgba(57, 255, 136, .35)' }, { backgroundColor: 'transparent' }], { duration: 900 });
    }
    tops.current = next;
  }, [order]);

  const reasons = (r: Row) => {
    const own = r.owned ? ['owned'] : [];
    const top = r.parts
      .filter((p) => p.label !== 'owned' && p.value !== 0)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 3)
      .map((p) => p.label.replace(/^fills (\S+(?: \S+)?) \(deck has (\d+), \w+ wants (\d+)–\d+\)$/, (_, w, h, lo) => `fills: ${w} (${Number(lo) - Number(h)} short)`))
      .map((t) => t.replace(/^([\d.]+)x lift$/, (_, x) => `+${Math.round((Number(x) - 1) * 100)}% lift`));
    return [...top, ...own];
  };

  return (
    <section
      className={`fsugg${sheet ? ' up' : ''} ${expanded ? 'expanded' : 'contracted mini'}`}
      aria-label="Suggestions"
      onDragOver={(e) => onCut && e.dataTransfer.types.includes(DRAG_TYPE) && fromOf(e) === 'deck' && (e.preventDefault(), lightUp(e.target as Element))}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && lightOff()}
      onDrop={(e) => {
        const n = e.dataTransfer.getData(DRAG_TYPE);
        dragEnd();
        if (n && onCut && fromOf(e) === 'deck') (e.preventDefault(), haptic('warn'), onCut(n));
      }}
    >
      <button className="fgrab" aria-expanded={sheet} aria-label={sheet ? 'Lower the suggestions' : 'Show all suggestions'} onClick={() => (haptic('open'), setSheet(!sheet))}>
        <span aria-hidden="true" />
      </button>
      <div className="fsugg-header">
        <div className="fpanes-wrap">
          {buy ? (
            <div className="fpanes" role="tablist" aria-label="Forge panel">
              <button role="tab" aria-selected={pane === 'sugg'} onClick={() => (haptic('select'), setPane('sugg'))}>
                SUGGESTIONS <small>{loading ? '…' : list.length}</small>
              </button>
              <button role="tab" aria-selected={pane === 'buy'} onClick={() => (haptic('select'), setPane('buy'))}>
                TO BUY
              </button>
            </div>
          ) : (
            <h3>
              SUGGESTIONS
              <small>{loading ? 'asking EDHREC…' : `${list.length} ${list.length === 1 ? 'card' : 'cards'}`}</small>
            </h3>
          )}
        </div>
        <button
          type="button"
          className="fexp-btn"
          title={expanded ? 'Contract suggestions (mini suggested cards dock)' : 'Expand suggestions (full list, search & reasons)'}
          aria-label={expanded ? 'Contract suggestions' : 'Expand suggestions'}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          {expanded ? 'CONTRACT ▸' : 'EXPAND ⤢'}
        </button>
      </div>

      {onJustBuild && (
        <div className="just-build-banner sugg-top-action">
          <button
            type="button"
            className="btn-just-build"
            onClick={() => void onJustBuild()}
            disabled={building}
            title="Build a 100-card deck from your binder using the brain (Karsten mana math + strategy stack)"
          >
            <span className="build-text">
              <strong>JUST BUILD IT!</strong>
              <small>Auto-craft 100 cards from your binder</small>
            </span>
            <span className="build-arrow">BUILD 100 →</span>
          </button>
        </div>
      )}

      {!expanded ? (
        /* Contracted / Mini View: compact vertical dock with top suggested cards and quick role filters */
        <div className="fsugg-mini-body" onClick={toggle} title="Tap to expand suggestions" style={{ cursor: 'pointer' }}>
          <div className="fsugg-mini-label">
            <span>TOP PICKS</span>
            <small>{list.length}</small>
          </div>
          <div className="fsugg-mini-cards">
            {list.slice(0, 4).map((r) => {
              const img = imgOf(r.c.name);
              const lift = r.c.lift ? `+${Math.round((r.c.lift - 1) * 100)}%` : r.c.incl ? `in ${Math.round(r.c.incl * 100)}%` : '';
              return (
                <div
                  key={r.c.name}
                  className={`fsugg-mini-card${r.owned > 0 ? ' owned' : ''}${placing === r.c.name ? ' placing' : ''}`}
                  title={`${r.c.name}${lift ? ` (${lift})` : ''} · Click to place/swap`}
                  onClick={(e) => {
                    e.stopPropagation();
                    haptic('select');
                    onPlace(placing === r.c.name ? null : r.c.name);
                  }}
                >
                  {img ? (
                    <img src={img} alt={r.c.name} className="mini-card-thumb" loading="lazy" />
                  ) : (
                    <div className="mini-card-thumb-fallback">{r.c.name.slice(0, 2)}</div>
                  )}
                  <div className="mini-card-info">
                    <span className="mini-card-name">{r.c.name}</span>
                    {lift && <span className="mini-card-lift">{lift}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="fsugg-mini-roles" onClick={(e) => e.stopPropagation()}>
            {(['draw', 'ramp', 'removal', 'wipes'] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                className={`mini-role-pill${role === r ? ' active' : ''}`}
                title={`Filter by ${ROLE_WORD[r]}`}
                onClick={() => {
                  haptic('select');
                  setRole(role === r ? '' : r);
                  if (!expanded) toggle();
                }}
              >
                {ROLE_WORD[r]}
              </button>
            ))}
          </div>
        </div>
      ) : pane === 'buy' && buy ? (
        <div className="fbuy">{buy}</div>
      ) : (
      <>
      <div className="fsorts" role="radiogroup" aria-label="Sort suggestions">
        {SORTS.map(([v, t, tip]) => (
          <button key={v} role="radio" aria-checked={sort === v} title={tip} onClick={() => (haptic('select'), setSort(v))}>
            {t}
          </button>
        ))}
      </div>
      <label className="sbox fq">
        <span className="tab">MY CARDS</span>
        <input ref={qBox} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search my cards_" aria-label="Search my cards (name or rules text)" autoComplete="off" />
      </label>
      <div className="fchips" role="group" aria-label="Filter suggestions">
        {short.map((n) => (
          <button key={n.role} className="need" aria-pressed={role === n.role} onClick={() => (haptic('select'), setRole(role === n.role ? '' : n.role))}>
            needs: {ROLE_WORD[n.role]}
          </button>
        ))}
        {(['draw', 'ramp', 'removal', 'wipes'] as Role[])
          .filter((r) => !short.some((n) => n.role === r))
          .map((r) => (
            <button key={r} aria-pressed={role === r} onClick={() => (haptic('select'), setRole(role === r ? '' : r))}>
              {ROLE_WORD[r]}
            </button>
          ))}
      </div>
      {themes.length > 0 && (
        <div className="themes fthemes" role="group" aria-label="EDHREC themes">
          {themes.map((t) => (
            <button
              key={t.slug}
              type="button"
              className="u-chip theme"
              aria-pressed={theme === t.slug}
              title={`Cards whose rules text fits ${t.value} (EDHREC theme, ${t.count.toLocaleString()} decks)`}
              onClick={() => (haptic('select'), setTheme(theme === t.slug ? '' : t.slug))}
            >
              #{t.value.toLowerCase()}
            </button>
          ))}
        </div>
      )}
      {onCf && (
        <details className="fcf">
          <summary>WITH / WITHOUT A CARD{cf && (cf.inc.length || cf.exc.length) ? ' ·  on' : ''}</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              haptic('select');
              onCf({ inc: cfDraft.inc.trim() ? [cfDraft.inc.trim()] : [], exc: cfDraft.exc.trim() ? [cfDraft.exc.trim()] : [] });
            }}
          >
            <label className="sbox">
              <span className="tab">WITH</span>
              <input value={cfDraft.inc} onChange={(e) => setCfDraft({ ...cfDraft, inc: e.target.value })} placeholder="card in the deck_" aria-label="With card" />
            </label>
            <label className="sbox">
              <span className="tab">WITHOUT</span>
              <input value={cfDraft.exc} onChange={(e) => setCfDraft({ ...cfDraft, exc: e.target.value })} placeholder="card left out_" aria-label="Without card" />
            </label>
            <button className="u-btn">APPLY</button>
            {cf && (cf.inc.length > 0 || cf.exc.length > 0) && (
              <button type="button" className="u-btn ghost" onClick={() => (haptic('undo'), setCfDraft({ inc: '', exc: '' }), onCf({ inc: [], exc: [] }))}>
                CLEAR
              </button>
            )}
          </form>
        </details>
      )}
      {cfNote && <p className="small fcfnote" role="status">{cfNote}</p>}
      <div className="ftabs" role="tablist" aria-label="Which cards">
        {(
          [
            ['all', 'ALL'],
            ['owned', 'OWNED'],
            ['missing', 'NOT OWNED'],
          ] as [Tab, string][]
        ).map(([v, t]) => (
          <button key={v} role="tab" aria-selected={tab === v} onClick={() => (haptic('select'), setTab(v))}>
            {t}
          </button>
        ))}
      </div>
      {placing && (
        <p className="fplace" role="status">
          Tap a deck card to swap in <b>{placing}</b>
          {onAdd ? ' (or + ADD)' : ''}.{' '}
          <button onClick={() => onPlace(null)}>cancel</button>
        </p>
      )}
      {searching && shown.length > 0 && (
        <p className="small fqnote" role="status">
          {list.length} of your cards {list.length === 1 ? 'matches' : 'match'}
          {narrowed ? ' (the search looks at all your cards, past the filters above)' : ''}.
        </p>
      )}
      <ol ref={box} className="frows">
        {shown.map((r) => {
          const img = imgOf(r.c.name);
          return (
            <li key={r.c.name} data-name={r.c.name} className={`${r.owned ? 'own' : 'buy'}${placing === r.c.name ? ' sel' : ''}${r.blocked ? ' blocked' : ''}`}>
              <button
                className="frow"
                draggable
                onDragStart={(e) => (dragStart(e, r.c.name, 'sugg'), onPlace(null))}
                onDragEnd={dragEnd}
                onPointerDown={(e) => holdToDrag(e, { label: r.c.name, img, onDrop: (at: DropAt) => dropRow(r.c.name, at) })}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => (haptic('select'), setSheet(false), onPlace(placing === r.c.name ? null : r.c.name))}
                aria-pressed={placing === r.c.name}
                title={r.blocked ?? 'Tap, then tap a deck card to swap it in. Or drag it onto one.'}
              >
                {img ? <img src={img} alt="" loading="lazy" draggable={false} /> : <span className="noimg" aria-hidden="true" />}
                <span className="fbody">
                  <b>{r.c.name}</b>
                  <span className="whys">
                    {r.blocked ? <span className="cwarn">▲ {r.blocked}</span> : reasons(r).map((t) => <span key={t} className={t.startsWith('fills') ? 'cgain' : t.startsWith('fits ') ? 'cfit' : t === 'owned' ? 'cown' : ''}>{t}</span>)}
                  </span>
                </span>
                <span className="fprice">{r.owned ? '✓ yours' : usd(r.card)}</span>
              </button>
              {onAdd && (
                <button className="fadd" aria-label={`Add ${r.c.name} to the deck`} onClick={() => (haptic('success'), onAdd(r.c.name))}>
                  + ADD
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {!searching && list.length > 20 && (
        <button className="fmore" onClick={() => (haptic('open'), setMore(!more))}>
          {more ? 'FEWER' : `MORE (${Math.min(60, list.length) - 20})`}
        </button>
      )}
      {searching && list.length > SEARCH_MAX && <p className="small">Showing the first {SEARCH_MAX} of {list.length} matches. Type more of the name to narrow it.</p>}
      {!shown.length && <p className="small">{searching ? `No card of yours that can go in this deck matches “${q}”.` : loading ? 'Loading suggestions…' : 'Nothing matches these filters.'}</p>}
      {not && (not.inDeck.length > 0 || not.offColour.length > 0 || not.never.length > 0) && (
        <ul className="small fwhynot" aria-label="Your cards that match but can't be added">
          {not.inDeck.length > 0 && <li>Already in this deck: {not.inDeck.join(', ')}.</li>}
          {not.offColour.length > 0 && <li>Yours, but outside this commander's colours (a Commander rule): {not.offColour.join(', ')}.</li>}
          {not.never.length > 0 && <li>Yours, but marked NEVER USE here: {not.never.join(', ')}.</li>}
        </ul>
      )}
      <p className="small fsrc">Reasons come from EDHREC (play rate, lift), Scryfall Tagger roles, card text and your deck. Prices never change the order.</p>
      </>
      )}
    </section>
  );

  function dropRow(name: string, at: DropAt) {
    if (at.zone !== 'deck') return;
    haptic('success');
    if (at.card) window.dispatchEvent(new CustomEvent('forge-drop', { detail: { from: name, onto: at.card } }));
    else if (onAdd) onAdd(name);
  }
}

/** Deck side of the drag and drop: drop a suggestion on a deck card (swap) or on the deck (add). */
export function useDeckDrop(onSwap: (onto: string, card: string) => void, onAdd?: (card: string) => void) {
  const live = useRef({ onSwap, onAdd });
  live.current = { onSwap, onAdd };
  // touch drops come as an event from the suggestion row
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ from: string; onto: string }>).detail;
      live.current.onSwap(d.onto, d.from);
    };
    addEventListener('forge-drop', f);
    return () => removeEventListener('forge-drop', f);
  }, []);
  return {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE) || fromOf(e) !== 'sugg') return;
      const onCard = (e.target as HTMLElement).closest?.('[data-card]');
      if (!onCard && !live.current.onAdd) return;
      e.preventDefault();
      lightUp(e.target as Element);
    },
    onDragLeave: (e: React.DragEvent) => !e.currentTarget.contains(e.relatedTarget as Node) && lightOff(),
    onDrop: (e: React.DragEvent) => {
      const card = e.dataTransfer.getData(DRAG_TYPE);
      const from = fromOf(e);
      dragEnd();
      if (!card || from !== 'sugg') return;
      const onto = (e.target as HTMLElement).closest?.<HTMLElement>('[data-card]')?.dataset.card;
      e.preventDefault();
      haptic('success');
      if (onto) live.current.onSwap(onto, card);
      else live.current.onAdd?.(card);
    },
  };
}

