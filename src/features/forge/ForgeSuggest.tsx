import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { deckNeeds, scoreCard, type DeckContext, type Part } from '../../brain/score';
import { readDeck, upgradeLine } from '../../brain/session';
import { themeOf } from '../../brain/themes';
import type { Aggression } from '../../brain/win';
import type { NotOffered } from '../../lib/collsearch';
import { BASICS } from '../../lib/compare';
import type { Taken } from '../../lib/copies';
import { db, type Card, type DeckCard } from '../../lib/db';
import { isLand, roleOf, type Role } from '../../lib/deckstats';
import { dragEnd, dragStart, fromOf, holdToDrag, lightOff, lightUp, DRAG_TYPE, type DropAt } from '../../lib/drag';
import type { CardFilter } from '../../lib/edhrec';
import { haptic } from '../../lib/haptics';
import { norm } from '../../lib/names';
import { searchByText } from '../../lib/search';
import type { SubCard } from '../../lib/subs';
import { usd } from '../../views/shared';
import { ROLE_WORD, shortOf } from './ForgeMeters';

export type ForgeSort = 'ours' | 'lift' | 'pop';
const SORTS: [ForgeSort, string, string][] = [
  ['ours', 'OUR PICK', "EDHREC's lift and play rate, plus cards you own and what the deck is short of"],
  ['lift', 'EDHREC LIFT', 'How much more this commander’s decks play the card than decks in general (EDHREC lift)'],
  ['pop', 'POPULAR', 'How many of this commander’s EDHREC decks play the card'],
];
const SEARCH_MAX = 60;
const OWN_W = 0.1;

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
  onSwap,
  onBalance,
  partner,
  pinned,
  deckTotal,
  loading,
  aggression: dial,
  expanded: controlledExpanded,
  onToggleExpand,
  onJustBuild,
  building,
  openSearch = 0,
  whyNot,
}: {
  aggression?: Aggression;
  profile: number;
  deck: DeckCard[];
  commander?: string;
  partner?: string;
  pinned?: string[];
  deckTotal?: number;
  bracket: number;
  candidates: SubCard[];
  cardOf: (name: string) => Card | undefined;
  ownedOf: (name: string) => number;
  taken?: (name: string) => Taken | undefined;
  imgOf: (name: string) => string | undefined;
  themes?: { slug: string; value: string; count: number }[];
  theme?: string;
  buy?: ReactNode;
  cf?: CardFilter;
  onCf?: (f: CardFilter) => void;
  cfNote?: string;
  placing: string | null;
  onPlace: (name: string | null) => void;
  onAdd?: (name: string) => void;
  onCut?: (name: string) => void;
  onSwap?: (from: string, to: string) => void;
  onBalance?: () => void;
  loading?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onJustBuild?: () => void;
  building?: boolean;
  openSearch?: number;
  whyNot?: (q: string) => NotOffered;
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
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [more, setMore] = useState(false);
  const [allThemes, setAllThemes] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [pane, setPane] = useState<'sugg' | 'upgrades' | 'buy'>('sugg');
  const [theme, setTheme] = useState(pageTheme);
  useEffect(() => setTheme(pageTheme), [pageTheme]);
  const tagOf = themes.find((t) => t.slug === theme);
  const focus = useMemo(() => (tagOf ? themeOf(tagOf.value) : undefined), [tagOf?.value]); // eslint-disable-line react-hooks/exhaustive-deps
  const [cfDraft, setCfDraft] = useState({ inc: cf?.inc[0] ?? '', exc: cf?.exc[0] ?? '' });
  const qBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!openSearch) return;
    setPane('sugg');
    setSheet(true);
    if (!expanded) toggle();
    const t = setTimeout(() => qBox.current?.focus({ preventScroll: false }), 60);
    return () => clearTimeout(t);
  }, [openSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx: DeckContext = { deck, cardOf, commander, partner, bracket, aggression, taste: brain?.taste, focus, taken };
  const takenKey = taken ? candidates.map((c) => taken(c.name)).filter(Boolean).map((t) => `${t!.used}/${t!.own}`).join(',') : '';
  const deckKey = deck.map((c) => `${c.name}×${c.qty}`).join('|');
  const sigNeeds = [deckKey, deck.filter((c) => cardOf(c.name)).length, aggression, bracket, brain?.taste?.length ?? 0, brain?.taste?.at(-1)?.at ?? 0, tagOf?.value ?? ''].join('#');
  const needs = useMemo(() => deckNeeds(ctx), [sigNeeds]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const upgrades = useMemo(() => {
    if (!onSwap) return [];
    const ownedPool = rows.filter((r) => r.owned > 0 && !r.blocked).map((r) => r.c);
    if (!ownedPool.length) return [];
    const recMap = new Map(ownedPool.map((c) => [norm(c.name), c]));
    return readDeck({
      ctx,
      candidates: ownedPool,
      recOf: (n) => recMap.get(norm(n)),
      pinned: [...(pinned ?? []), ...(partner ? [partner] : [])],
      cuts: 10,
    }).upgrades;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(onSwap), needs, candKey, rows.length]);

  const short = shortOf(needs.stats, needs.range);
  const searching = q.trim().length >= 2;
  const value = (r: Row) => (sort === 'ours' ? r.total : sort === 'lift' ? (r.c.lift ?? (r.c.synergy != null ? 1 + r.c.synergy : 0)) : (r.c.incl ?? 0));
  let list = rows.filter((r) => r.owned > 0 && (!role || r.roles.includes(role)) && (!focus || r.fits));
  if (searching) list = searchByText(rows.filter((r) => r.owned > 0), q, (r) => ({ name: r.c.name, type: r.card?.type ?? r.c.type, text: r.card?.text }));
  else list = [...list].sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked) || value(b) - value(a) || a.c.name.localeCompare(b.c.name));
  const shown = list.slice(0, searching ? SEARCH_MAX : more ? 60 : 20);
  const narrowed = !!role || !!focus;
  const not = searching && whyNot ? whyNot(q) : undefined;

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
    return r.parts
      .filter((p) => p.label !== 'owned' && p.value !== 0)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 3)
      .map((p) => p.label.replace(/^fills (\S+(?: \S+)?) \(deck has (\d+), \w+ wants (\d+)–\d+\)$/, (_, w, h, lo) => `fills: ${w} (${Number(lo) - Number(h)} short)`))
      .map((t) => t.replace(/^([\d.]+)x lift$/, (_, x) => `+${Math.round((Number(x) - 1) * 100)}% lift`));
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
          {buy || onSwap ? (
            <div className="fpanes" role="tablist" aria-label="Forge panel">
              <button role="tab" aria-selected={pane === 'sugg'} onClick={() => (haptic('select'), setPane('sugg'))}>
                SUGGESTIONS <small>{loading ? '…' : list.length}</small>
              </button>
              {onSwap && (
                <button role="tab" aria-selected={pane === 'upgrades'} onClick={() => (haptic('select'), setPane('upgrades'))}>
                  UPGRADES <small>{upgrades.length}</small>
                </button>
              )}
              {buy && (
                <button role="tab" className="fpanes-buy" aria-selected={pane === 'buy'} onClick={() => (haptic('select'), setPane('buy'))}>
                  TO BUY
                </button>
              )}
            </div>
          ) : (
            <h3>
              SUGGESTIONS
              <small>{loading ? 'asking EDHREC…' : `${list.length} of your cards fit`}</small>
            </h3>
          )}
        </div>
        <button
          type="button"
          className="fexp-btn corner"
          title={expanded ? 'Contract suggestions (mini suggested cards dock)' : 'Expand suggestions (full list, search & reasons)'}
          aria-label={expanded ? 'Contract suggestions' : 'Expand suggestions'}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          <span className="fexp-sign" aria-hidden="true">
            {expanded ? '−' : '+'}
          </span>
        </button>
      </div>

      {onJustBuild && expanded && (
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
      {!onJustBuild && onBalance && expanded && (
        <div className="just-build-banner sugg-top-action">
          <button
            type="button"
            className="btn-just-build"
            onClick={() => (haptic('open'), onBalance())}
            title="Propose adds and cuts from your binder to land on 100 cards with balanced roles"
          >
            <span className="build-text">
              <strong>BALANCE TO 100</strong>
              <small>{deckTotal && deckTotal !== 100 ? `Currently ${deckTotal} cards · review adds & cuts` : 'Tune roles & swaps from your binder'}</small>
            </span>
            <span className="build-arrow">BALANCE →</span>
          </button>
        </div>
      )}

      {!expanded ? (
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
                  className={`fsugg-mini-card${placing === r.c.name ? ' placing' : ''}`}
                  title={`${r.c.name}${lift ? ` (${lift})` : ''} · Click to place/swap`}
                  onClick={(e) => {
                    e.stopPropagation();
                    haptic('select');
                    onPlace(placing === r.c.name ? null : r.c.name);
                  }}
                >
                  {img ? <img src={img} alt={r.c.name} className="mini-card-thumb" loading="lazy" /> : <div className="mini-card-thumb-fallback">{r.c.name.slice(0, 2)}</div>}
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
      ) : pane === 'upgrades' && onSwap ? (
        <div className="fupgrades">
          {upgrades.length === 0 ? (
            <p className="small" style={{ margin: '12px 0' }}>
              No clear owned role upgrades found for weak slots right now. Check SUGGESTIONS or BALANCE TO 100 for full edits.
            </p>
          ) : (
            <ol className="frows">
              {upgrades.map((u) => {
                const img = imgOf(u.in);
                return (
                  <li key={`${u.out}->${u.in}`} className="own">
                    <div className="frow">
                      {img ? <img src={img} alt="" loading="lazy" /> : <span className="noimg" aria-hidden="true" />}
                      <span className="fbody">
                        <b>
                          {u.in} <small style={{ fontWeight: 400, opacity: 0.75 }}>for {u.out}</small>
                        </b>
                        <span className="whys">
                          <span className="cgain">{u.job}</span>
                          <span>{upgradeLine(u)}</span>
                        </span>
                      </span>
                    </div>
                    <button
                      type="button"
                      className="fadd"
                      aria-label={`Swap ${u.out} for ${u.in}`}
                      onClick={() => (haptic('success'), onSwap(u.out, u.in))}
                    >
                      ⇄ SWAP
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
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
              {(allThemes ? themes : themes.slice(0, 8)).map((t) => (
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
              {themes.length > 8 && (
                <button type="button" className="u-chip theme" onClick={() => (haptic('select'), setAllThemes((v) => !v))}>
                  {allThemes ? 'LESS' : `+${themes.length - 8} MORE`}
                </button>
              )}
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
          {cfNote && (
            <p className="small fcfnote" role="status">
              {cfNote}
            </p>
          )}
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
                        {r.blocked ? (
                          <span className="cwarn">▲ {r.blocked}</span>
                        ) : (
                          reasons(r).map((t) => (
                            <span key={t} className={t.startsWith('fills') ? 'cgain' : t.startsWith('fits ') ? 'cfit' : ''}>
                              {t}
                            </span>
                          ))
                        )}
                      </span>
                    </span>
                    {!r.owned && <span className="fprice">{usd(r.card)}</span>}
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
