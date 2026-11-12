import { haptic } from '../lib/haptics';
import { DECK_COLOURS, deckColour } from '../lib/deckcolor';
import { searchByText } from '../lib/search';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BASICS, statusOf, summarize } from '../lib/compare';
import { deckShareOf, deckShares } from '../lib/deckshare';
import { addToDeck, removeFromDeck, replaceInDeck, savePin, setCommander } from '../lib/deckedit';
import { noPins, pinOf, PIN_FILTER_MIN_DECKS, withPins } from '../lib/pins';
import { rankSubs, recInfoOf, type SubCard } from '../lib/subs';
import { binderCandidates } from '../brain/candidates';
import { offIdentity } from '../brain/identity';
import { AGGRESSION, killCheck } from '../brain/win';
import { recordTaste } from '../brain/store';
import { roleSource } from '../lib/deckstats';
import { BRACKETS, cachedPages, fetchFiltered, fetchPage, pagePath, showPage, type CardFilter, type EdhPage } from '../lib/edhrec';
import { bracketFit, readiness, type BracketFit, type Readiness } from '../brain/validate';
import { whyCard } from '../brain/why';
import { commanderThemes, themeOf, type Theme } from '../brain/themes';

import { ReadyTiles } from './Verdict';
import { Meter } from './parts';
import { allocate } from '../lib/allocation';
import { inUseChip } from '../brain/chips';
import { SwapNote, type SwapOption } from './SwapNote';
import { CardMenu } from './CardMenu';
import { db, type Card, type Cheap, type Deck, type DeckCard } from '../lib/db';
import { analysis, bracketOf, deckStats, GROUPS, groupOf, isLand, refShapeOf, type BracketCall, type DeckStats, type RefShape } from '../lib/deckstats';
import { deckArena, deckCsv, deckText, download } from '../lib/export';
import { norm, slug } from '../lib/names';
import { cad, fetchedNote, PRICE_METHOD, shopUrl, toCad } from '../lib/prices';
import { commanderSlug, guessCommander, pairIdentity } from '../lib/commander';
import { onlyOk, ONLYS, shows, sortBy, SHOWS, SORTS, type Only, type Show, type SortKey } from '../lib/arrange';
import { cardsByIds, cheapest, gameChangers, resolveRows, withCheapest } from '../lib/scryfall';
import { BuyList, ForgeCube, ForgeMeters, ForgeSuggest, ForgeTop, useDeckDrop, useForgeMode } from './Forge';
import { shortfalls, takenBy } from '../lib/copies';
import { freeDeckName, onOpenDeck, openCollection, setBack, takeDeck } from '../lib/nav';
import { importDeck } from '../lib/actions';
import { CardLine, CardTile, CmdrCard, SaltStat, priced as atFinish, priceSum, scryfallUrl, ShortAlert, Pick, DeckLight, ToolBar, OptRow, PhoneView, useBinder, useStored, useMenuPress, type Shared } from './shared';
import { CompactIcon, Pips, Ransom, Tape, Title, GridIcon, ListIcon, PageDecor } from './zine';

import { addCounts, calculateDeckOwnership } from '../lib/ownership';
import { getDeckSnapshots, restoreDeckSnapshot, saveDeckSnapshot } from '../lib/deckhistory';
import { getDraftCheckpoint, setDraftCheckpoint, clearDraftCheckpoint } from '../lib/drafts';

/** A deck's own note and tags (saved on this device, synced on Push). */
function DeckNotes({ deck }: { deck: Deck }) {
  const [tag, setTag] = useState('');
  const tags = deck.tags ?? [];
  const draftKey = `deck_note_${deck.id}`;
  const initialNote = getDraftCheckpoint<string>(draftKey) ?? deck.note ?? '';
  const [noteText, setNoteText] = useState(initialNote);

  const addTag = () => {
    const t = tag.trim().toLowerCase().slice(0, 30);
    if (t && !tags.includes(t)) db.decks.update(deck.id!, { tags: [...tags, t] });
    setTag('');
  };

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNoteText(val);
    setDraftCheckpoint(draftKey, val);
  };

  const handleNoteBlur = async () => {
    if (noteText !== (deck.note ?? '')) {
      await db.decks.update(deck.id!, { note: noteText });
    }
    clearDraftCheckpoint(draftKey);
  };

  return (
    <section className="decknotes" aria-label="Deck note and tags">
      <label className="notebook">
        <textarea
          aria-label="Deck note"
          rows={3}
          placeholder="game plan, who it's for, what to swap next_"
          value={noteText}
          onChange={handleNoteChange}
          onBlur={handleNoteBlur}
        />
      </label>
      <div className="tagrow">
        {tags.map((t) => (
          <button key={t} className="dtag" aria-label={`Remove tag ${t}`} onClick={() => db.decks.update(deck.id!, { tags: tags.filter((x) => x !== t) })}>
            #{t} <span aria-hidden="true">×</span>
          </button>
        ))}
        <input aria-label="New tag" placeholder="+ tag_" value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} onBlur={addTag} />
      </div>
    </section>
  );
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
type Grouping = 'type' | 'mv' | 'own' | 'none';
const GROUPINGS: [Grouping, string][] = [
  ['type', 'CARD TYPE'],
  ['mv', 'MANA VALUE'],
  ['own', 'OWNED / MISSING'],
  ['none', 'NO GROUPS'],
];

/** GROUP box: how sections are split, plus a "show only" filter in the same picker (one less box). */
function GroupPick({ grouping, show, onGroup, onShow }: { grouping: Grouping; show: Show; onGroup: (g: Grouping) => void; onShow: (v: Show) => void }) {
  const tag = show === 'owned' ? ' · OWNED' : show === 'missing' ? ' · MISSING' : '';
  return (
    <label className="sbox pick">
      <span className="tab">GROUP</span>
      <select
        value={grouping}
        aria-label={`Group by, and which cards to show${tag ? `: ${show} only` : ''}`}
        onChange={(e) => {
          haptic('select');
          const v = e.target.value;
          if (v.startsWith('show:')) onShow(v.slice(5) as Show);
          else onGroup(v as Grouping);
        }}
      >
        <optgroup label="Group by">
          {GROUPINGS.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
              {tag}
            </option>
          ))}
        </optgroup>
        <optgroup label="Show">
          {SHOWS.map(([v, t]) => (
            <option key={v} value={`show:${v}`}>
              {show === v ? '✓ ' : '\u2003'}
              {t}
            </option>
          ))}
        </optgroup>
      </select>
      <span className="arrow" aria-hidden="true">
        <span>▼</span>
      </span>
    </label>
  );
}

/** Bracket estimate stamp; tap shows the reasons. */
function BracketStat({ call, cedh }: { call: BracketCall; cedh?: boolean }) {
  // Bracket 5 is about intent, so it is never guessed. When you forged the deck from EDHREC's cEDH list, that is the intent.
  const plus = cedh && call.bracket === 4;
  return (
    <details className="scrap bracket">
      <summary aria-label={`Estimated bracket ${call.bracket}${plus ? ' or 5, built from cEDH data' : ''}. Show why`}>
        <span className="k">BRACKET</span>
        <span className="bstamp">
          {ROMAN[call.bracket]}
          {plus && '+'}
        </span>
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </summary>
      <ul className="popnote">
        {plus && (
          <li>
            <b>IV+ · built from cEDH data</b>: forged from EDHREC's cEDH list, so it's meant for bracket 5 tables
          </li>
        )}
        {call.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
        {call.gameChangers.length > 0 && (
          <li>
            Game Changers: <b>{call.gameChangers.join(', ')}</b>
          </li>
        )}
        {call.combos.length > 0 && (
          <li>
            Two-card combos (Commander Spellbook): <b>{call.combos.map((c) => `${c.cards.join(' + ')}${c.early ? ' (early)' : ''}`).join(', ')}</b>
          </li>
        )}
        <li className="small">
          An estimate from the official bracket rules we can check: Game Changers, mass land denial, chained extra turns and two-card combos
          {call.combosChecked ? '' : ' (combo list still loading)'}. Bracket I vs II and V depend on how the deck is meant to play.
        </li>
      </ul>
    </details>
  );
}

/** A deck saved without a commander: suggest the likely one (one tap sets it); the card menu can set any card. */
function PickCommander({ deck, cardOf }: { deck: Deck; cardOf: (name: string) => Card | undefined }) {
  const guess = guessCommander(deck.cards.map((c) => ({ name: c.name, card: cardOf(c.name) })));
  return (
    <aside className="shortalert pickcmdr" role="status">
      <b>▲ NO COMMANDER</b>{' '}
      {guess ? (
        <>
          This deck has no commander yet. It looks like <mark>{guess}</mark>.{' '}
          <button className="btn" onClick={() => (haptic('success'), setCommander(deck, guess))}>
            SET AS COMMANDER
          </button>
        </>
      ) : (
        'This deck has no commander yet. Right-click (or long-press) a card and choose Set as commander.'
      )}
    </aside>
  );
}

/** Make a deck card the commander (the previous one stays in the deck as a normal card). */

/** Card menu (right-click / press and hold): commander, links, foil, copies, remove from deck or binder. */
/** Mana curve: non-land cards by mana value (7 = 7+). */
function Curve({ curve }: { curve: number[] }) {
  const max = Math.max(1, ...curve);
  return (
    <div className="curve" role="img" aria-label={`Mana curve: ${curve.map((n, i) => `${n} at ${i === 7 ? '7 or more' : i}`).join(', ')}`}>
      {curve.map((n, i) => (
        <span key={i} className="col">
          <span className="n">{n || ''}</span>
          <span className="bar" style={{ height: `${(n / max) * 100}%` }} />
          <span className="mv">{i === 7 ? '7+' : i}</span>
        </span>
      ))}
    </div>
  );
}

const PIPC: Record<string, string> = { W: '#E9DDB5', U: '#3F6FC6', B: '#2A2A30', R: '#B5463A', G: '#2F7D4A', C: '#8A8A8A' };

/** Side panel: the Forge's live meters, then the details (types, colour pips, the read, note and tags). The match %,
 *  readiness and bracket fit sit in the hero; deck cost and what's missing in the strip (each fact once). */
function DeckPanel({ deck, st, read, meters }: { deck: Deck; st: DeckStats; read: ReturnType<typeof analysis>; meters?: ReactNode }) {
  const pipTotal = Object.values(st.pips).reduce((a, b) => a + b, 0);
  // Phones / tablets (details sit above the cards): folds to one line, remembered. Desktop: always open.
  const [fold, setFold] = useStored<'open' | 'closed'>('ch:analysis', 'closed', ['open', 'closed']);
  const low = read.filter((a) => a.tone !== 'ok').length;
  return (
    <aside className={`dpanel ${fold}`} aria-label="Deck analysis">
      {/* The Forge's live meters (lands, ramp, draw, removal, wipes, curve) stay open on every screen */}
      {meters}
      <h2>
        <button className="dfold" aria-expanded={fold === 'open'} onClick={() => (haptic('open'), setFold(fold === 'open' ? 'closed' : 'open'))}>
          DETAILS
          <span className="dsum">{low ? `${low} to look at` : 'looks solid'}</span>
          <span className="pm" aria-hidden="true" />
        </button>
      </h2>
      <div className="dbody">
        {!meters && (
          <div className="dsec">
            <h3>
              mana curve <small>avg {st.avgMv.toFixed(2)}</small>
            </h3>
            <Curve curve={st.curve} />
          </div>
        )}
        <div className="dsec">
          <h3>the read</h3>
          <ul className="dread">
            {read.map((a) => (
              <li key={a.text} className={a.tone}>
                {a.text}
              </li>
            ))}
          </ul>
          <small className="fetched">
            Roles come from Scryfall Tagger ({deck.cards.filter((c) => roleSource(c.name) === 'Scryfall Tagger').length} of {deck.cards.length} cards), the rest from rules text.
            {st.unknown ? ` ${st.unknown} cards still loading.` : ''}
          </small>
        </div>
        <div className="dsec">
          <h3>types</h3>
          <ul className="dtypes">
            {GROUPS.filter((g) => st.groups.get(g)).map((g) => (
              <li key={g}>
                <span>{g}</span>
                <b>{st.groups.get(g)}</b>
              </li>
            ))}
          </ul>
        </div>
        {pipTotal > 0 && (
          <div className="dsec">
            <h3>colour pips</h3>
            <div className="pipbar" role="img" aria-label={Object.entries(st.pips).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ')}>
              {Object.entries(st.pips)
                .filter(([, n]) => n)
                .map(([k, n]) => (
                  <span key={k} style={{ flex: n, background: PIPC[k], color: k === 'W' ? '#1a1a1a' : '#fff' }}>
                    {k} {n}
                  </span>
                ))}
            </div>
          </div>
        )}
        <div className="dsec dnotes">
          <h3>note &amp; tags</h3>
          <DeckNotes deck={deck} />
        </div>
      </div>
    </aside>
  );
}


/** Everything you do to the deck itself (not how its cards are shown), tucked behind one button. */
/** A deck in the Decks list: tap opens it; right-click or press and hold opens the deck menu. */
function DeckTile({ onClick, onMenu, label, children }: { onClick: () => void; onMenu: (x: number, y: number) => void; label: string; children: ReactNode }) {
  const press = useMenuPress(onMenu);
  return (
    <div
      role="button"
      tabIndex={0}
      className="dcard ccard hasmenu"
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
      {...press}
      aria-label={`${label}: open (right-click or hold for options)`}
    >
      {children}
    </div>
  );
}

type MenuAt = { x: number; y: number; anchor?: DOMRect }; // a point (right-click / hold) or under the DECK box


function DeckMenu({ deck, at, onClose, onDeleted, onOpen }: { deck: Deck; at: MenuAt; onClose: () => void; onDeleted?: () => void; onOpen: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const file = (ext: string) => `${deck.name.replace(/[^\w-]+/g, '_')}.${ext}`;
  const [copied, setCopied] = useState(false);
  // Phones: the system share sheet (WhatsApp, Messages…). Elsewhere: the decklist goes to the clipboard.
  const canShare = typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches;
  async function share() {
    const text = deckText(deck);
    if (canShare) {
      close();
      await navigator.share({ title: deck.name, text }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(text).catch(() => {});
    haptic('success');
    setCopied(true);
    setTimeout(close, 900);
  }
  const close = onClose;
  // Keep it on screen: under (or above) the DECK box, else at the pressed spot.
  const [pos, setPos] = useState({ left: at.x, top: at.y });
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    const b = at.anchor;
    const left = Math.max(8, Math.min(b ? b.right - r.width : at.x, innerWidth - r.width - 8));
    const top = b ? (b.bottom + 8 + r.height > innerHeight - 8 ? Math.max(8, b.top - r.height - 8) : b.bottom + 8) : Math.max(8, Math.min(at.y, innerHeight - r.height - 8));
    setPos({ left, top });
  }, [at]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    addEventListener('keydown', key);
    addEventListener('scroll', close, { passive: true });
    return () => (removeEventListener('keydown', key), removeEventListener('scroll', close));
  }, []);
  const act = (f: () => unknown) => () => (close(), f());
  return (
    <>
      {(
        <>
          <div className="backdrop menuback" onClick={close} onContextMenu={(e) => (e.preventDefault(), close())} />
          <div ref={ref} className="cardmenu deckmenu" role="menu" aria-label={`${deck.name} options`} style={pos}>
            <div className="mh">{deck.name}</div>
            <ul>
              <li>
                <button
                  role="menuitem"
                  onClick={act(async () => {
                    const want = prompt('Rename deck', deck.name)?.trim();
                    if (!want || want === deck.name) return;
                    const name = await freeDeckName(deck.profile, want, deck.id);
                    if (name !== want && !confirm(`Another deck is already called "${want}". Use "${name}"?`)) return;
                    haptic('success');
                    await db.decks.update(deck.id!, { name });
                  })}
                >
                  <span className="cmenu-main">RENAME</span>
                </button>
              </li>
              <li>
                <button
                  role="menuitem"
                  onClick={act(async () => {
                    const { id: _, ...copy } = deck;
                    const name = await freeDeckName(deck.profile, `${deck.name} (copy)`);
                    haptic('success');
                    onOpen(await db.decks.add({ ...copy, name, cards: deck.cards.map((c) => ({ ...c })), tags: deck.tags && [...deck.tags], updated: Date.now() }));
                    scrollTo({ top: 0, behavior: 'smooth' });
                  })}
                >
                  <span className="cmenu-main">DUPLICATE</span>
                  <small className="cmenu-meta">copy to edit freely</small>
                </button>
              </li>
              <li className="colourrow">
                <span className="cl">DECK COLOUR <small>cards glow in it</small></span>
                <span className="swatches" role="radiogroup" aria-label="Deck colour">
                  {DECK_COLOURS.map(([c, label]) => (
                    <button
                      key={c}
                      role="radio"
                      aria-checked={deckColour(deck) === c}
                      aria-label={label}
                      title={label}
                      style={{ background: c }}
                      onClick={act(() => (haptic('select'), db.decks.update(deck.id!, { color: c })))}
                    />
                  ))}
                </span>
                <label className="custom-color-label" title="Pick any custom shade for this deck">
                  <span>CUSTOM SHADE:</span>
                  <input
                    type="color"
                    value={deck.color?.startsWith('#') ? deck.color : '#e60012'}
                    onChange={(e) => {
                      haptic('select');
                      db.decks.update(deck.id!, { color: e.target.value });
                    }}
                  />
                </label>
              </li>
              <li>
                <button
                  role="menuitem"
                  onClick={act(async () => {
                    const val = prompt('Add a tag for this deck (e.g. casual, cedh, token, artifact):', '')?.trim().toLowerCase().slice(0, 30);
                    if (!val) return;
                    const prev = deck.tags ?? [];
                    if (!prev.includes(val)) {
                      haptic('success');
                      await db.decks.update(deck.id!, { tags: [...prev, val] });
                    }
                  })}
                >
                  <span className="cmenu-main">+ ADD TAG</span>
                  <small className="cmenu-meta">{deck.tags?.length ? deck.tags.map((t) => `#${t}`).join(', ') : 'organise your decks'}</small>
                </button>
              </li>
              {deck.tags && deck.tags.length > 0 && (
                <li className="cmenu-tags-row">
                  <span className="cl">TAGS <small>tap to remove</small></span>
                  <div className="cmenu-tags-list">
                    {deck.tags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className="cmenu-tag-item"
                        title={`Remove tag #${t}`}
                        onClick={act(async () => {
                          haptic('tap');
                          await db.decks.update(deck.id!, { tags: deck.tags!.filter((x) => x !== t) });
                        })}
                      >
                        #{t} ✕
                      </button>
                    ))}
                  </div>
                </li>
              )}
              <li>
                <button role="menuitem" onClick={share}>
                  <span className="cmenu-main">{copied ? 'COPIED TO CLIPBOARD' : canShare ? 'SHARE DECK' : 'COPY DECKLIST'}</span>
                  <small className="cmenu-meta">{copied ? 'paste anywhere' : canShare ? 'send to friend' : 'Moxfield, chat…'}</small>
                </button>
              </li>
              <li className="sep" role="separator" />
              <li>
                <button role="menuitem" onClick={act(() => download(file('txt'), deckText(deck)))}>
                  <span className="cmenu-main">EXPORT FOR MOXFIELD</span>
                  <small className="cmenu-meta">.txt</small>
                </button>
              </li>
              <li>
                <button role="menuitem" onClick={act(() => (navigator.clipboard?.writeText(deckArena(deck)).catch(() => {}), haptic('success')))}>
                  <span className="cmenu-main">COPY FOR MTG ARENA</span>
                  <small className="cmenu-meta">import in Arena</small>
                </button>
              </li>
              <li>
                <button role="menuitem" onClick={act(() => download(file('csv'), deckCsv(deck), 'text/csv'))}>
                  <span className="cmenu-main">EXPORT AS CSV</span>
                  <small className="cmenu-meta">spreadsheet</small>
                </button>
              </li>
              <li className="sep" role="separator" />
              <li>
                <button
                  role="menuitem"
                  onClick={act(async () => {
                    const snap = saveDeckSnapshot(deck, `Manual save (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
                    if (snap) haptic('success');
                  })}
                >
                  <span className="cmenu-main">CREATE SNAPSHOT</span>
                  <small className="cmenu-meta">save current deck version</small>
                </button>
              </li>
              {deck.id && getDeckSnapshots(deck.id).length > 0 && (
                <li>
                  <button
                    role="menuitem"
                    onClick={act(async () => {
                      const snaps = getDeckSnapshots(deck.id!);
                      const listStr = snaps
                        .map((s, i) => `${i + 1}. [${new Date(s.at).toLocaleDateString()} ${new Date(s.at).toLocaleTimeString()}] ${s.label || ''} (${s.cardCount} cards)`)
                        .slice(0, 8)
                        .join('\n');
                      const choice = prompt(`Select snapshot number to restore:\n\n${listStr}\n\nEnter number (1-${Math.min(snaps.length, 8)}):`);
                      const idx = Number(choice) - 1;
                      if (!isNaN(idx) && snaps[idx]) {
                        if (confirm(`Restore "${snaps[idx].label}"? A safety snapshot will be created automatically.`)) {
                          await restoreDeckSnapshot(deck, snaps[idx]);
                          haptic('success');
                        }
                      }
                    })}
                  >
                    <span className="cmenu-main">RESTORE VERSION...</span>
                    <small className="cmenu-meta">{getDeckSnapshots(deck.id).length} saved snapshots</small>
                  </button>
                </li>
              )}
              <li className="sep" role="separator" />
              <li>
                <button
                  role="menuitem"
                  className="danger"
                  onClick={act(async () => {
                    if (confirm(`Delete deck "${deck.name}"?`)) {
                      await db.decks.delete(deck.id!);
                      onDeleted?.();
                    }
                  })}
                >
                  <span className="cmenu-main">DELETE DECK</span>
                </button>
              </li>
            </ul>
          </div>
        </>
      )}
    </>
  );
}

function DeckView({ deck, s, onBack, onOpen, short }: { deck: Deck; s: Shared; onBack: () => void; onOpen: (id: number) => void; short: ReturnType<typeof shortfalls> }) {
  // Owned copies are shared out oldest deck first, so the share matches the list (a shared card counts for one deck only).
  const siblings = useLiveQuery(() => db.decks.where('profile').equals(s.profile).toArray(), [s.profile]) ?? [deck];
  const sum = { ...summarize(deck.cards.map((c) => c.name), s.mine, s.other), ...deckShareOf(siblings, deck.id, s.mine) };
  const takenOthers = takenBy(siblings.filter((d) => d.id !== deck.id), s.mine);
  const ownDetails = calculateDeckOwnership(deck.cards, s.mine, addCounts(s.mine, s.other));
  useEffect(() => {
    setBack(onBack);
    return () => void setBack(null);
  }, [deck.id]);
  const byKey =
    useLiveQuery(async () => new Map((await db.cards.where('key').anyOf(deck.cards.map((c) => norm(c.name))).sortBy('key')).sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).map((c) => [c.key, c])), [deck]) ??
    new Map<string, Card>();
  const cheap = useLiveQuery(async () => new Map((await db.cheap.bulkGet(deck.cards.map((c) => norm(c.name)))).filter(Boolean).map((c) => [c!.key, c!])), [deck]) ?? new Map<string, Cheap>();
  const cardOf = (name: string) => withCheapest(byKey.get(norm(name)), cheap);
  const [gc, setGc] = useState<Set<string> | null | undefined>(undefined);
  // Decks saved from EDHREC hold names only: look up any card not cached yet (images), then cheapest prices.
  useEffect(() => {
    resolveRows(deck.cards.map((c) => ({ name: c.name, qty: c.qty })), () => {})
      .then(() => cheapest(deck.cards.map((c) => c.name)))
      .catch(() => {});
    gameChangers().then(setGc);
  }, [deck.id]);
  const [view, setView] = useStored<'grid' | 'list' | 'compact'>('ch:view', typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches ? 'compact' : 'grid', ['grid', 'list', 'compact']);
  const [zoom, setZoom] = useStored<'s' | 'm' | 'l'>('ch:cmdrzoom', 'm', ['s', 'm', 'l']);
  const [grouping, setGrouping] = useStored<Grouping>('ch:dgroup', 'type', GROUPINGS.map(([v]) => v));
  const [sort, setSort] = useStored<SortKey>('ch:dsort', 'mv', SORTS.map(([v]) => v));
  const [q, setQ] = useState(''); // search the deck by name or rules text
  const [show, setShow] = useStored<Show>('ch:dshow', 'all', SHOWS.map(([v]) => v));
  const [only, setOnly] = useState<Only>('all'); // Game Changers / price bands, for this visit
  // Foil deck cards are priced at the foil price of the printing on file.
  const cardFor = (c: DeckCard) => (c.foil ? atFinish(cardOf(c.name), true) : cardOf(c.name));
  const missingCost = priceSum(deck.cards.filter((c) => statusOf(c.name, s.mine) !== 'owned').map((c) => ({ card: cardFor(c), qty: c.qty })));
  const deckCost = priceSum(deck.cards.map((c) => ({ card: cardFor(c), qty: c.qty })));
  // the Forge cube's TO BUY face: every card this deck still lacks, with its price
  const buyItems = deck.cards.filter((c) => statusOf(c.name, s.mine) !== 'owned').map((c) => ({ name: c.name, qty: c.qty, cad: toCad(cardFor(c)?.usd) }));
  const cubeRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ card: DeckCard; x: number; y: number } | null>(null);
  const [deckMenu, setDeckMenu] = useState<MenuAt | null>(null);
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches;
  const heroPress = useMenuPress((x, y) => setDeckMenu({ x, y }));
  const [toast, setToastNow] = useState<{ text: string; undo?: () => unknown } | null>(null);
  // The Forge's top bar keeps the last undo after the toast is gone (Ctrl+Z works too).
  const [last, setLast] = useState<{ text: string; run: () => void } | null>(null);
  const setToast = (t: { text: string; undo?: () => unknown } | null) => {
    setToastNow(t);
    if (t?.undo) setLast({ text: t.text, run: () => (t.undo!(), setLast(null), setToastNow(null)) });
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToastNow(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useForgeMode(true); // a saved deck opens in the Forge
  const [anExpanded, setAnExpanded] = useState(() => {
    try {
      return localStorage.getItem('ch:forge:an_expanded') !== 'false';
    } catch {
      return true;
    }
  });
  const [sugExpanded, setSugExpanded] = useState(() => {
    try {
      return localStorage.getItem('ch:forge:sug_expanded') !== 'false';
    } catch {
      return true;
    }
  });
  const toggleAn = () => {
    setAnExpanded((v) => {
      try {
        localStorage.setItem('ch:forge:an_expanded', String(!v));
      } catch {}
      return !v;
    });
  };
  const toggleSug = () => {
    setSugExpanded((v) => {
      try {
        localStorage.setItem('ch:forge:sug_expanded', String(!v));
      } catch {}
      return !v;
    });
  };
  const pricesIn = byKey.size > 0;
  const st = deckStats(deck.cards, cardOf, deck.commander);
  const call = bracketOf(deck.cards.map((c) => ({ name: c.name, card: cardOf(c.name) })), gc ?? null);
  const cmdr = deck.commander ? byKey.get(norm(deck.commander)) : undefined;
  const partner = deck.partner ? byKey.get(norm(deck.partner)) : undefined;
  const ci = cmdr ? pairIdentity(cmdr.ci, partner?.ci) : [...new Set(deck.cards.flatMap((c) => byKey.get(norm(c.name))?.ci ?? []))];
  const cmdrSlug = deck.commander ? commanderSlug(deck.commander, deck.partner) : '';
  // Build Readiness, Bracket Fit and "Why this card?" (logic in brain/validate.ts and brain/why.ts).
  const aim = Number(BRACKETS.find(([v]) => v === deck.source)?.[2]) || 4;
  const aggression = (({ upgraded: 'patient', optimized: 'hungry', cedh: 'lethal' }) as Record<string, 'patient' | 'hungry' | 'lethal'>)[deck.source ?? ''] ?? 'hungry';
  const ready = readiness({ deck: deck.cards, cardOf, commander: deck.commander, partner: deck.partner, identity: ci, bracket: aim, aggression });
  const fit = bracketFit(call, aim);
  // The read compares the deck with EDHREC's average deck for its bracket. A bracket IV estimate with 30 lands or
  // fewer is built cEDH-style, so it is compared with the cEDH average (EDHREC's cEDH lists run ~25 lands).
  const refBracket = deck.source === 'cedh' ? 'cedh' : call.bracket >= 4 ? (st.lands <= 30 ? 'cedh' : 'optimized') : call.bracket === 3 ? 'upgraded' : 'core';
  const [ref, setRef] = useState<RefShape | undefined>();
  useEffect(() => {
    let live = true;
    setRef(undefined);
    const label = `EDHREC's ${refBracket === 'cedh' ? 'cEDH' : `bracket ${{ core: 2, upgraded: 3, optimized: 4 }[refBracket]}`} average deck`;
    if (cmdrSlug) showPage(pagePath('average', cmdrSlug, refBracket), (p) => live && setRef(refShapeOf(p, label))).catch(() => {});
    return () => void (live = false);
  }, [cmdrSlug, refBracket]);
  const kill = killCheck(deck.cards.map((c) => ({ name: c.name, card: cardOf(c.name) })), refBracket === 'cedh' ? 5 : Math.max(call.bracket, 2));
  const banned = deck.cards.filter((c) => cardOf(c.name)?.legal === false).map((c) => c.name);
  // Colour identity: a saved deck may hold cards from before the identity gate (or an import). Flag them, known ones only.
  const offColour = cmdr ? offIdentity(deck.cards.map((c) => c.name).filter((n) => n !== deck.commander && n !== deck.partner), ci, (n) => cardOf(n)?.ci) : [];
  const read = [
    ...(offColour.length ? [{ tone: 'low' as const, text: `${offColour.length} ${offColour.length === 1 ? 'card is' : 'cards are'} outside ${(deck.commander ?? '').split(' // ')[0]}'s colours: ${offColour.slice(0, 5).join(', ')}${offColour.length > 5 ? '…' : ''}. Swap ${offColour.length === 1 ? 'it' : 'them'} out before you play.` }] : []),
    ...(banned.length ? [{ tone: 'low' as const, text: `${banned.length} ${banned.length === 1 ? "card isn't" : "cards aren't"} legal in Commander: ${banned.slice(0, 5).join(', ')}${banned.length > 5 ? '…' : ''}. Swap ${banned.length === 1 ? 'it' : 'them'} out before you play.` }] : []),
    ...analysis(st, { bracket: refBracket === 'cedh' ? 5 : call.bracket, ref }),
    { tone: (kill.verdict === 'lethal' ? 'ok' : 'low') as 'ok' | 'low', text: kill.says },
  ];

  // The Forge: tap any card for the swap window (top 3 of your cards EDHREC plays with this commander, a search over
  // your binder in the deck's colours, pins). A swap changes this deck at once, with an undo.
  const [swapFor, setSwapFor] = useState<string | null>(null);
  const [recs, setRecs] = useState<EdhPage | null>(null);
  useEffect(() => {
    let live = true;
    setRecs(null);
    if (cmdrSlug) showPage(pagePath('commander', cmdrSlug), (p) => live && setRecs(p)).catch(() => {});
    return () => void (live = false);
  }, [cmdrSlug]);
  const prof = useLiveQuery(() => db.profiles.get(s.profile), [s.profile]);
  const pins = (deck.commander && prof?.pins?.[deck.commander]) || noPins();
  // EDHREC's With card / Without card on the Forge's suggestions, plus your pins (decks with your 📌, without your 💀)
  const [cf, setCf] = useState<CardFilter>({ inc: [], exc: [] });
  const [filtered, setFiltered] = useState<{ page: EdhPage; applied: boolean; pins?: boolean } | null>(null);
  const fq = withPins(cf, pins);
  const fqKey = JSON.stringify(fq);
  const pinned = fq.inc.length + fq.exc.length > cf.inc.length + cf.exc.length;
  useEffect(() => {
    setFiltered(null);
    if (!recs || (!fq.inc.length && !fq.exc.length)) return;
    let live = true;
    const at = pagePath('commander', cmdrSlug);
    void (async () => {
      const r = await fetchFiltered(at, fq, recs);
      if (!pinned || (r.applied && (r.page.numDecks ?? 0) >= PIN_FILTER_MIN_DECKS)) return live && setFiltered({ ...r, pins: pinned });
      const plain = cf.inc.length || cf.exc.length ? await fetchFiltered(at, cf, recs) : { page: recs, applied: false };
      if (live) setFiltered(plain);
    })();
    return () => void (live = false);
  }, [recs, fqKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const sugg = filtered?.page ?? recs;
  // Scryfall data for EDHREC's cards (types for the roles, prices, images), cached a week
  const [edhCards, setEdhCards] = useState<Map<string, Card>>(new Map());
  useEffect(() => {
    const want = (sugg?.lists ?? []).flatMap((l) => l.cards.map((c) => c.id)).filter(Boolean) as string[];
    let live = true;
    if (want.length)
      cardsByIds(want.slice(0, 400), undefined, (partial) => {
        if (live) setEdhCards((prev) => new Map([...prev, ...[...partial.values()].map((c) => [c.key, c] as const)]));
      })
        .then(async (m) => {
          if (!live) return;
          const named = new Map([...m.values()].map((c) => [c.key, c]));
          setEdhCards((prev) => new Map([...prev, ...named]));
          await cheapest([...m.values()].map((c) => c.name), (ch) => {
            if (live) setEdhCards((prev) => new Map([...prev, ...[...named].map(([k, c]) => [k, withCheapest(c, ch)!] as const)]));
          });
        })
        .catch(() => {});
    return () => void (live = false);
  }, [sugg]);
  const binder = useBinder(s.profile);
  const binderCard = new Map(binder.map((c) => [c.key, c]));
  const never = new Set(pins.out.map(norm));
  const inDeck = new Set(deck.cards.map((c) => norm(c.name)));
  const recInfo = recInfoOf(sugg?.lists ?? [], norm, (c) => binderCard.get(norm(c.name)) ?? byKey.get(norm(c.name)) ?? edhCards.get(norm(c.name)));
  // Owned cards EDHREC lists for this commander, plus the rest of your binder in its colours (Mind Stone for Mox Amber).
  const listed = [...recInfo.values()].filter((c) => statusOf(c.name, s.mine) === 'owned' && !never.has(norm(c.name)));
  const candidates = binderCandidates(listed, binder, ci, never).filter((c) => !inDeck.has(norm(c.name)));
  const slotInfo = (name: string): SubCard => {
    const card = cardOf(name);
    return { ...recInfo.get(norm(name)), name, type: card?.type, cmc: card?.cmc };
  };
  // Copies your other decks use: the swap window's "in <deck>" chip.
  const others = useLiveQuery(() => db.decks.where('profile').equals(s.profile).toArray(), [s.profile]) ?? [];
  const alloc = allocate(others, s.mine);
  const deckCol = new Map(others.map((d) => [d.name, deckColour(d)]));
  const optionOf = (sub: SubCard): SwapOption => {
    const bc = binderCard.get(norm(sub.name));
    const img = bc?.img;
    const use = inUseChip(alloc, sub.name, (d) => d === deck.name);
    return { sub, img, big: img?.replace('/small/', '/normal/'), owned: s.mine.get(norm(sub.name)) ?? 0, text: bc?.text, inUse: use && { ...use, colour: deckCol.get(use.deck) } };
  };
  const forgePool = () =>
    binder.filter((b) => b.ci.every((x) => ci.includes(x)) && !inDeck.has(b.key) && !never.has(b.key)).map((b) => optionOf({ ...recInfo.get(b.key), name: b.name, type: b.type, cmc: b.cmc }));
  async function swapIn(from: string, to: string) {
    if (cmdr && offIdentity([to], ci, (n) => binderCard.get(norm(n))?.ci ?? cardOf(n)?.ci).length) return; // hard rule: never outside the colours
    haptic('success');
    const key = deck.commander ?? deck.name;
    void recordTaste(s.profile, from, 'cut', key).then(() => recordTaste(s.profile, to, 'add', key));
    setSwapFor(null);
    setPlacing(null);
    setToast({ text: `Swapped ${from} for ${to}`, undo: await replaceInDeck(deck, from, to) });
  }
  // The Forge's suggestions: EDHREC's cards (owned or not) plus every card of yours in the colours.
  const [placing, setPlacing] = useState<string | null>(null); // a suggestion picked: the next deck card tapped is swapped
  const forgeCands = [...recInfo.values()].filter((c) => !never.has(norm(c.name))).concat(binderCandidates([], binder, ci, never));
  const anyCard = (n: string) => byKey.get(norm(n)) ?? binderCard.get(norm(n)) ?? edhCards.get(norm(n));
  const sugImg = (n: string) => binderCard.get(norm(n))?.img ?? edhCards.get(norm(n))?.img ?? byKey.get(norm(n))?.img;
  async function addCard(n: string) {
    if (cmdr && offIdentity([n], ci, (x) => anyCard(x)?.ci).length) return; // hard rule: never outside the colours
    void recordTaste(s.profile, n, 'add', deck.commander ?? deck.name);
    setPlacing(null);
    setToast({ text: `Added ${n}`, undo: await addToDeck(deck, n) });
  }
  async function cutCard(n: string) {
    if (n === deck.commander || n === deck.partner) return;
    void recordTaste(s.profile, n, 'cut', deck.commander ?? deck.name);
    setToast({ text: `Cut ${n}`, undo: await removeFromDeck(deck, n) });
  }
  const drop = useDeckDrop((onto, card) => onto !== deck.commander && void swapIn(onto, card), (card) => void addCard(card));

  // Moxfield-style sections: by card type or mana value (commander first), by ownership, or one list.
  const shortHere = short.filter((x) => x.decks.includes(deck.name));
  const owned = (n: string) => statusOf(n, s.mine) === 'owned';
  const keyOf = (c: DeckCard) => {
    const card = cardOf(c.name);
    if (grouping === 'none') return 'All cards';
    if (grouping === 'own') {
      const st = statusOf(c.name, s.mine, s.other);
      return st === 'owned' ? 'Owned' : st === 'other' ? `In ${s.otherName}` : 'Missing';
    }
    if (c.name === deck.commander || c.name === deck.partner) return 'Commander';
    if (grouping === 'type') return groupOf(card?.type);
    if (!card) return 'Other';
    if (isLand(card.type)) return 'Lands';
    const mv = Math.round(card.cmc ?? 0);
    return mv >= 7 ? 'Mana value 7+' : `Mana value ${mv}`;
  };
  const order =
    grouping === 'type'
      ? [...GROUPS]
      : grouping === 'mv'
        ? ['Commander', ...Array.from({ length: 7 }, (_, i) => `Mana value ${i}`), 'Mana value 7+', 'Lands', 'Other']
        : grouping === 'own'
          ? ['Owned', `In ${s.otherName}`, 'Missing']
          : ['All cards'];
  const sections = new Map<string, DeckCard[]>(order.map((k) => [k, []]));
  const shown = searchByText(deck.cards.filter((c) => shows(show, owned(c.name)) && onlyOk(only, { gc: !!gc?.has(norm(c.name)), cad: toCad(cardFor(c)?.usd) })), q, (c) => ({ name: c.name, type: cardOf(c.name)?.type, text: cardOf(c.name)?.text }));
  const sorted = sortBy(shown, sort, (c) => {
    const card = cardOf(c.name);
    return { name: c.name, usd: card?.usd ? Number(card.usd) : undefined, mv: card ? (isLand(card.type) ? 99 : card.cmc) : undefined, owned: owned(c.name) };
  });
  // The commander isn't repeated in the list: the big card at the top is its menu.
  for (const c of sorted) if (c.name !== deck.commander) sections.get(keyOf(c))?.push(c);
  const Item = view === 'grid' ? CardTile : CardLine;

  return (
    <>
      <main className="dpage forgemain">
        <ForgeTop label={deck.name} sub={`${st.total} cards${deck.commander ? ` · ${deck.commander.split(' // ')[0]}` : ''}`} undo={last ?? undefined} onLeave={onBack} reserved={deck.alloc === 'reserved'} />

        {/* THE OVERHAUL, saved deck: the same hero → strip → toolbar → cards as the commander page. The hero is the loud
            frame (ransom name, one red slash) and holds the match %; the strip holds what the deck costs and what it lacks. */}
        <section className={`vhero dhero hasmenu${cmdr?.img ? '' : ' noimg'}`} {...heroPress} aria-label={`${deck.name}: deck`} title="Right-click (or press and hold) for deck options">
          {cmdr?.img && (
            <div className="vcard">
              <CmdrCard
                src={cmdr.img.replace('/small/', '/normal/')}
                name={cmdr.name}
                onMenu={(x, y) => setMenu({ card: deck.cards.find((c) => c.name === deck.commander) ?? { name: cmdr.name, qty: 1 }, x, y })}
              />
            </div>
          )}
          <div className="vinfo">
            <div className="vname">
              <span className="vslash" aria-hidden="true" />
              <h1 aria-label={deck.name} {...heroPress}>
                <Ransom text={deck.name.toUpperCase().slice(0, 48)} size={narrow ? (deck.name.length > 16 ? 22 : 28) : deck.name.length > 28 ? 34 : 46} seed={33} />
              </h1>
              {/* Active / off sits at the end of the name, in the deck's own colour */}
              <DeckLight deck={deck} />
            </div>
            {/* the quiet monospace line: colours · commander · cards · lands · avg MV · salt · bracket */}
            <div className="vmeta" onClick={(e) => e.stopPropagation()}>
              <Pips ci={ci} size={20} />
              {deck.commander && <span>{deck.commander.split(' // ')[0]}</span>}
              <span>{st.total} cards</span>
              <span>{st.lands} lands</span>
              {st.avgMv > 0 && <span>avg MV {st.avgMv.toFixed(2)}</span>}
              <SaltStat names={deck.cards.map((c) => c.name)} />
              <BracketStat call={call} cedh={deck.source === 'cedh'} />
            </div>
            <div className="vmatch" aria-label={`${sum.pct}% match: you own ${sum.owned} of ${sum.total} cards in ${s.binderName}`}>
              <b className="num">{sum.pct}%</b>
              <span className="vbar">
                <Meter pct={sum.pct} label={`Collection match ${sum.pct}%`} />
                <small>
                  collection match · you own {sum.owned} of {sum.total}
                  {sum.other > 0 ? ` · ${sum.other} in ${s.otherName}` : ''}
                </small>
              </span>
            </div>
            <ReadyTiles ready={ready} fit={fit} cardNames={deck.cards.map((c) => c.name)} />
          </div>
        </section>

        {/* The one strip: what the deck costs, what it still lacks, copies short. */}
        <section className="dstrip" aria-label="Deck status">
          <p className="dstatus" role="status">
            {pricesIn && (
              <span className="dcost" title={`${PRICE_METHOD} ${fetchedNote(deck.cards.map((c) => cardOf(c.name)?.priceAt ?? cardOf(c.name)?.at))}`}>
                deck ≈{cad(deckCost)}
              </span>
            )}
            {ownDetails.missingToBuy > 0 ? (
              <span className="dmiss">
                {ownDetails.missingToBuy} to buy{pricesIn ? ` ≈${cad(missingCost)}` : ''}
                {ownDetails.ownedElsewhere > 0 ? ` · ${ownDetails.ownedElsewhere} in ${s.otherName}` : ''}
                {` · ${ownDetails.assignedHere} in this deck`}
              </span>
            ) : ownDetails.ownedElsewhere > 0 ? (
              <span className="dmiss">
                all owned · {ownDetails.assignedHere} here · {ownDetails.ownedElsewhere} in {s.otherName}
              </span>
            ) : (
              <span>every card is yours ({ownDetails.assignedHere} in this deck)</span>
            )}
          </p>
          <div className="dacts">
            <ShortAlert items={shortHere} inline currentDeck={deck.name} />
          </div>
        </section>

        {!deck.commander && <PickCommander deck={deck} cardOf={cardOf} />}

        {deckMenu && <DeckMenu deck={deck} at={deckMenu} onClose={() => setDeckMenu(null)} onDeleted={onBack} onOpen={onOpen} />}

        <ForgeCube grid={cubeRef} buyCount={buyItems.reduce((n, c) => n + c.qty, 0)} />
        <div ref={cubeRef} className={`deckgrid after-sw forge-split${!anExpanded ? ' an-contracted' : ''}${!sugExpanded ? ' sug-contracted' : ''}`} data-zoom={zoom}>
          {swapFor && <div className="backdrop" onClick={() => setSwapFor(null)} />}
          <div className={`dside forge-analysis${!anExpanded ? ' is-contracted' : ''}`}>
            <DeckPanel
              deck={deck}
              st={st}
              read={read}
              meters={
                <ForgeMeters
                  st={st}
                  range={(r) => (r === 'tutors' ? undefined : AGGRESSION[aggression][r])}
                  expanded={anExpanded}
                  onToggleExpand={toggleAn}
                />
              }
            />
          </div>
          <div className="lists" {...drop}>
            {/* How the cards are split and ordered, right above them */}
            <ToolBar
              q={q}
              setQ={setQ}
              now={[GROUPINGS.find(([v]) => v === grouping)?.[1], SORTS.find(([v]) => v === sort)?.[1], only !== 'all' ? ONLYS.find(([v]) => v === only)?.[1] : ''].filter(Boolean).join(' · ')}
              extra={
                <label className="sortsel">
                  <select aria-label="Sort cards" value={sort} onChange={(e) => (haptic('select'), setSort(e.target.value as SortKey))}>
                    {SORTS.map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              }
              quick={
                <>
                  <div className="qsegs" role="group" aria-label="Ownership filter">
                    {ONLYS.map(([v, l]) => (
                      <button key={v} type="button" aria-pressed={only === v} onClick={() => (haptic('select'), setOnly(v))}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <div className="qsegs qviews" role="group" aria-label="Quick view">
                    <button type="button" aria-pressed={view === 'grid'} aria-label="Grid view" title="Grid view" onClick={() => (haptic('select'), setView('grid'))}>
                      <GridIcon />
                    </button>
                    <button type="button" aria-pressed={view === 'list'} aria-label="List view" title="List view" onClick={() => (haptic('select'), setView('list'))}>
                      <ListIcon />
                    </button>
                    <button type="button" aria-pressed={view === 'compact'} aria-label="Compact list" title="Compact list" onClick={() => (haptic('select'), setView('compact'))}>
                      <CompactIcon />
                    </button>
                  </div>
                  {view === 'grid' && (
                    <button
                      type="button"
                      className="u-btn ghost qzoom-btn"
                      title={{ s: 'Size: Small. Tap for Medium', m: 'Size: Medium. Tap for Large', l: 'Size: Large. Tap for Small' }[zoom]}
                      aria-label={`Card size ${zoom.toUpperCase()}: tap to cycle size`}
                      onClick={() => {
                        haptic('select');
                        setZoom(zoom === 's' ? 'm' : zoom === 'm' ? 'l' : 's');
                      }}
                    >
                      SIZE {zoom.toUpperCase()}
                    </button>
                  )}
                </>
              }
            >
              <PhoneView view={view} onChange={setView} />
              <GroupPick grouping={grouping} show={show} onGroup={setGrouping} onShow={setShow} />
              <Pick label="SORT" value={sort} options={SORTS} onChange={setSort} />
              <Pick label="ONLY" value={only} options={ONLYS} onChange={setOnly} className="show-pick" />
            </ToolBar>
            <p className="forgehint">tap a card to swap it · drag a suggestion onto a card to swap, or onto the list to add · drag a card out to cut it</p>
            {[...sections]
              .filter(([, cs]) => cs.length)
              .map(([h, cs]) => {
                const ls = summarize(cs.map((c) => c.name), s.mine, s.other);
                return (
                  <details key={h} className="cat" open>
                    <summary>
                      <span className="pm" aria-hidden="true" />
                      <span className="h">
                        {h} ({cs.reduce((n, c) => n + c.qty, 0)})
                      </span>
                      {pricesIn && (
                        <span className="gval" title="What this group's cards are worth (cheapest printings, foils at foil price)">
                          ≈{cad(priceSum(cs.map((c) => ({ card: cardFor(c), qty: c.qty }))))}
                        </span>
                      )}
                      <span className="dots" aria-hidden="true" />
                      <span className="n">
                        {ls.owned}/{ls.total} owned
                      </span>
                    </summary>
                    
                    <ul className={view === 'grid' ? 'zgrid' : view === 'compact' ? 'zlist zcompact' : 'zlist'} data-zoom={view === 'grid' ? zoom : undefined}>
                      {cs.map((c) => (
                        <Item
                          key={c.name}
                          name={c.name}
                          card={cardFor(c)}
                          s={s}
                          note={[c.foil ? '✦ FOIL' : '', c.qty > 1 ? `×${c.qty}` : '', call.gameChangers.includes(c.name) ? 'Game Changer' : ''].filter(Boolean).join(' · ')}
                          onMenu={(x, y) => setMenu({ card: c, x, y })}
                          foil={c.foil}
                          quiet={owned(c.name)}
                          drag={c.name !== deck.commander}
                          onOpen={c.name === deck.commander || (BASICS.has(norm(c.name)) && !placing) ? undefined : () => (placing ? void swapIn(c.name, placing) : setSwapFor(c.name))}
                        >
                          {swapFor === c.name && (
                            <SwapNote
                              name={c.name}
                              missing={slotInfo(c.name)}
                              big={cardOf(c.name)?.img?.replace('/small/', '/normal/')}
                              options={rankSubs(slotInfo(c.name), candidates, 3, { deck: deck.cards, cardOf: anyCard, commander: deck.commander, bracket: aim, aggression, taste: prof?.brain?.taste, focus: commanderThemes(cmdr, recs?.tags)[0], taken: takenOthers }).map(optionOf)}
                              pool={forgePool()}
                              loading={!!deck.commander && !recs}
                              pin={pinOf(pins, c.name)}
                              canPinIn={owned(c.name)}
                              cmdr={(deck.commander ?? deck.name).split(' // ')[0]}
                              onPick={(to) => swapIn(c.name, to)}
                              onUndo={() => setSwapFor(null)}
                              onPin={deck.commander ? (side) => (savePin(s.profile, deck.commander!, c.name, side), void recordTaste(s.profile, c.name, side === 'in' ? 'always' : 'never', deck.commander!), setSwapFor(null)) : undefined}
                              deck={deck.cards.map((x) => x.name)}
                              bracket={call.bracket}
                              onClose={() => setSwapFor(null)}
                            />
                          )}
                        </Item>
                      ))}
                    </ul>
                  </details>
                );
              })}
          </div>
          {/* phones: the cube's third face (polish.css hides it on wider screens, where TO BUY sits in the strip) */}
          <div className="dside forge-buy">
            <BuyList items={buyItems} binder={s.binderName} />
          </div>
          <div className={`dside forge-suggestions${!sugExpanded ? ' is-contracted' : ''}`}>
            <ForgeSuggest
              profile={s.profile}
              deck={deck.cards}
              commander={deck.commander}
              bracket={aim}
              aggression={aggression}
              candidates={forgeCands}
              cardOf={anyCard}
              ownedOf={(n) => s.mine.get(norm(n)) ?? 0}
              taken={takenOthers}
              imgOf={sugImg}
              themes={recs?.tags ?? []}
              cf={cf}
              onCf={deck.commander ? setCf : undefined}
              cfNote={filtered?.pins && !(cf.inc.length + cf.exc.length) ? `From ${filtered.page.numDecks?.toLocaleString()} EDHREC decks that fit your pins.` : cf.inc.length + cf.exc.length ? (!filtered ? 'Asking EDHREC…' : filtered.applied ? `From ${filtered.page.numDecks?.toLocaleString()} EDHREC decks.` : "EDHREC didn't filter this page from the app.") : undefined}
              placing={placing}
              onPlace={setPlacing}
              onAdd={(n) => void addCard(n)}
              onCut={(n) => void cutCard(n)}
              loading={!!deck.commander && !recs}
              expanded={sugExpanded}
              onToggleExpand={toggleSug}
            />
          </div>
        </div>
        {menu && (
          <CardMenu
            name={menu.card.name}
            at={menu}
            profile={s.profile}
            binderName={s.binderName}
            owned={s.mine.get(norm(menu.card.name)) ?? 0}
            deck={deck}
            onSwap={menu.card.name === deck.commander || BASICS.has(norm(menu.card.name)) ? undefined : () => setSwapFor(menu.card.name)}
            pin={deck.commander ? { side: pinOf(pins, menu.card.name), canIn: owned(menu.card.name), onPin: (side) => savePin(s.profile, deck.commander!, menu.card.name, side) } : undefined}
            onClose={() => setMenu(null)}
            onToast={setToast}
          />
        )}
        {toast && (
          <div className="toast" role="status">
            <span>{toast.text}</span>
            {toast.undo && (
              <button onClick={() => (haptic('undo'), toast.undo!(), setToast(null))}>
                UNDO
              </button>
            )}
          </div>
        )}
      </main>
    </>
  );
}

export function Decks(s: Shared) {
  const decks = useLiveQuery(() => db.decks.where('profile').equals(s.profile).reverse().sortBy('updated'), [s.profile]) ?? [];
  const cmdrs =
    useLiveQuery(async () => new Map((await db.cards.where('key').anyOf(decks.map((d) => norm(d.commander ?? '')).filter(Boolean)).toArray()).map((c) => [c.key, c])), [decks]) ?? new Map<string, Card>();
  // A deck's themes: the commander's rules text first; when that names none, EDHREC's top tags for the commander (from pages already cached here).
  const edhNames = [...new Set(decks.map((d) => d.commander ?? '').filter(Boolean))];
  const edhKey = edhNames.join('|');
  const [edhTop, setEdhTop] = useState<Map<string, string[]>>(new Map());
  useEffect(() => {
    let live = true;
    const names = edhKey ? edhKey.split('|') : [];
    if (!names.length) return;
    const paths = names.map((n) => pagePath('commander', slug(n)));
    const put = (pages: Map<string, EdhPage>) => {
      if (live) setEdhTop(new Map(names.map((n, i) => [norm(n), (pages.get(paths[i])?.tags ?? []).slice(0, 2).map((t) => t.value)])));
    };
    cachedPages(paths)
      .then(async (hits) => {
        const known = new Map([...hits].map(([k, v]) => [k, v.page] as const));
        put(known);
        // Commanders not seen yet: fetch their EDHREC page once (a day's cache, like Discover).
        for (const p of paths.filter((p) => !known.has(p))) {
          if (!live) return;
          const page = await fetchPage(p).catch(() => undefined);
          if (page) known.set(p, page);
          put(known);
        }
      })
      .catch(() => {});
    return () => void (live = false);
  }, [edhKey]);
  // Only the themes this deck actively has: at least two of its cards support the theme (a lone card is not a theme).
  const themesOf = (d: Deck): Theme[] => {
    const lead = d.commander ? cmdrs.get(norm(d.commander)) : undefined;
    const fromText = lead ? commanderThemes(lead) : [];
    const candidates = fromText.length ? fromText : (edhTop.get(norm(d.commander ?? '')) ?? []).map((v) => themeOf(v));
    if (!candidates.length) return [];
    const cardsInDeck = [lead, ...d.cards.map((c) => priced.get(norm(c.name)))].filter((c): c is Card => !!c);
    return candidates.filter((t) => cardsInDeck.filter((c) => t.test(c)).length >= 2);
  };
  // Deck prices from cards already cached here (a deck opened once has them all).
  const allNames = decks.flatMap((d) => d.cards.map((c) => norm(c.name)));
  const priced =
    useLiveQuery(async () => {
      const [cs, ch] = await Promise.all([db.cards.where('key').anyOf(allNames).toArray(), db.cheap.bulkGet(allNames)]);
      const cheap = new Map(ch.filter(Boolean).map((c) => [c!.key, c!]));
      // Same printing choice as the deck page (newest fetched wins).
      return new Map(cs.sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).map((c) => [c.key, withCheapest(c, cheap)!]));
    }, [decks]) ?? new Map<string, Card>();
  const [open, setOpen] = useState<number | null>(null);
  const [listMenu, setListMenu] = useState<{ id: number; at: MenuAt } | null>(null);
  const menuDeck = listMenu && decks.find((d) => d.id === listMenu.id);
  // Opened from elsewhere (a deck name on another screen): wait for the decks to load, then open it.
  const [navTick, setNavTick] = useState(0);
  useEffect(() => onOpenDeck(() => setNavTick((n) => n + 1)), []);
  useEffect(() => {
    const name = takeDeck((n) => decks.some((d) => d.name === n));
    const d = name && decks.find((x) => x.name === name);
    if (d) (setOpen(d.id!), scrollTo(0, 0));
  }, [decks, navTick]);

  // Deck Arsenal Overview Stats
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches;
  const shares = deckShares(decks, s.mine);
  const shareById = new Map(decks.map((d, i) => [d.id, shares[i]]));
  const readyDecks = shares.filter((x) => x.pct === 100).length;
  const uniqueCardsInDecks = new Set(decks.flatMap((d) => d.cards.map((c) => norm(c.name)))).size;
  const colorCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const d of decks) {
    const lead = d.commander ? cmdrs.get(norm(d.commander)) : undefined;
    const ci = lead?.ci ?? [];
    for (const c of ci) {
      if (colorCounts[c] !== undefined) colorCounts[c]++;
    }
  }
  const bracketsWithScores = decks
    .map((d) => bracketOf(d.cards.map((c) => ({ name: c.name, card: priced.get(norm(c.name)) })), null).bracket)
    .filter((b) => b > 0);
  const avgBracket = bracketsWithScores.length ? Math.round(bracketsWithScores.reduce<number>((a, b) => a + b, 0) / bracketsWithScores.length) : 3;

  // Decks Workbench: Search, Sorting, Status and Tag filtering
  const [dq, setDq] = useState('');
  const [dsort, setDsort] = useState<'updated-desc' | 'name-asc' | 'name-desc' | 'match-desc' | 'power-desc' | 'power-asc' | 'cards-desc'>('updated-desc');
  const [dstatus, setDstatus] = useState<'all' | 'ready' | 'in-progress' | 'active'>('all');
  const [dtag, setDtag] = useState<string>('all');
  const [dstats, setDstats] = useStored<'show' | 'hide'>('ch:deckstats', 'show', ['show', 'hide']);
  // Card size for the deck grid (S = three across on phones; the same S / M / L as the Collection).
  const [dzoom, setDzoomState] = useState<'s' | 'm' | 'l'>(() => {
    try {
      const v = localStorage.getItem('ch:deckzoom');
      if (v === 's' || v === 'm' || v === 'l') return v;
    } catch {}
    return narrow ? 's' : 'm';
  });
  const setDzoom = (v: 's' | 'm' | 'l') => {
    setDzoomState(v);
    try {
      localStorage.setItem('ch:deckzoom', v);
    } catch {}
  };
  const [importing, setImporting] = useState(false);

  const short = shortfalls(decks, s.mine);
  const deck = decks.find((d) => d.id === open);
  // The list page sits under Collection: the pill's back arrow goes there (the deck page sets its own).
  useEffect(() => {
    if (!deck) setBack(openCollection);
    return () => void setBack(null);
  }, [!!deck]);
  if (deck) return <DeckView deck={deck} s={s} short={short} onBack={() => setOpen(null)} onOpen={setOpen} />;
  const deckThemeNames = (d: Deck) => themesOf(d).map((t) => t.label);
  const allTags = [...new Set(decks.flatMap((d) => [...(d.tags ?? []), ...deckThemeNames(d)]))].filter(Boolean);

  const filteredDecks = decks
    .filter((d) => {
      if (dq.trim()) {
        const q = dq.toLowerCase().trim();
        const matchName = d.name.toLowerCase().includes(q);
        const matchCmdr = d.commander?.toLowerCase().includes(q);
        const matchTag = [...(d.tags ?? []), ...deckThemeNames(d)].some((t) => t.toLowerCase().includes(q));
        if (!matchName && !matchCmdr && !matchTag) return false;
      }
      if (dstatus === 'ready') {
        if (shareById.get(d.id)?.pct !== 100) return false;
      } else if (dstatus === 'in-progress') {
        if (shareById.get(d.id)?.pct === 100) return false;
      } else if (dstatus === 'active') {
        if (d.inactive) return false;
      }
      if (dtag !== 'all') {
        if (!d.tags?.includes(dtag) && !deckThemeNames(d).includes(dtag)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (dsort === 'name-asc') return a.name.localeCompare(b.name);
      if (dsort === 'name-desc') return b.name.localeCompare(a.name);
      if (dsort === 'match-desc') {
        const pa = summarize(a.cards.map((c) => c.name), s.mine, s.other).pct;
        const pb = summarize(b.cards.map((c) => c.name), s.mine, s.other).pct;
        return pb - pa;
      }
      if (dsort === 'power-desc') {
        const ba = bracketOf(a.cards.map((c) => ({ name: c.name, card: priced.get(norm(c.name)) })), null).bracket;
        const bb = bracketOf(b.cards.map((c) => ({ name: c.name, card: priced.get(norm(c.name)) })), null).bracket;
        return bb - ba;
      }
      if (dsort === 'power-asc') {
        const ba = bracketOf(a.cards.map((c) => ({ name: c.name, card: priced.get(norm(c.name)) })), null).bracket;
        const bb = bracketOf(b.cards.map((c) => ({ name: c.name, card: priced.get(norm(c.name)) })), null).bracket;
        return ba - bb;
      }
      if (dsort === 'cards-desc') {
        const na = a.cards.reduce((n, c) => n + c.qty, 0);
        const nb = b.cards.reduce((n, c) => n + c.qty, 0);
        return nb - na;
      }
      return (b.updated ?? 0) - (a.updated ?? 0);
    });

  async function createBlankDeck() {
    const raw = prompt('Name your new deck:', 'New Brew')?.trim();
    if (!raw) return;
    haptic('open');
    const id = await db.decks.add({
      profile: s.profile,
      name: raw,
      cards: [{ name: 'Sol Ring', qty: 1 }],
      updated: Date.now(),
    });
    setOpen(id);
    scrollTo(0, 0);
  }


  return (
    <>
      <PageDecor seed={333} rays="24% 20%" sheet={{ side: 'left', top: 320, rot: -4 }} />
      <main className="dpage dlist">
        {/* THE OVERHAUL, my decks: loud title → one ribbon of facts → flat deck tiles → the add form. */}
        <div className="decksbar">
          <Title text="MY DECKS" label="My decks" size={narrow ? 44 : 64} seed={33} />
        </div>
        <ShortAlert items={short} />
        <div className="dribbonwrap">
          {/* The same tiles as the Collection header (Guillermo, Nov 11): one look, one feel. HIDE folds them away. */}
          <div className={`dribbon${dstats === 'hide' ? ' folded' : ''}`} role="region" aria-label="Deck collection overview">
          {decks.length > 0 && (
            <>
            <button
              type="button"
              className="dfold"
              aria-expanded={dstats !== 'hide'}
              onClick={() => (haptic('select'), setDstats(dstats === 'hide' ? 'show' : 'hide'))}
              title={dstats === 'hide' ? 'Show the deck stats' : 'Hide the deck stats'}
            >
              {dstats === 'hide' ? 'SHOW STATS ▾' : 'HIDE STATS ▴'}
            </button>
            <section className="stats dstats" hidden={dstats === 'hide'}>
              <div className="stat">
                <span className="spray" aria-hidden="true" />
                <b>{decks.length}</b>{' '}
                <span>{decks.length === 1 ? 'deck' : 'decks'} in {s.binderName}</span>
              </div>
              <div className="stat">
                <span className="spray" aria-hidden="true" />
                <b>{readyDecks}</b>{' '}
                <span>ready to play</span>
              </div>
              <div className="stat">
                <span className="spray" aria-hidden="true" />
                <b>{uniqueCardsInDecks}</b>{' '}
                <span>cards in play</span>
              </div>
              <div className="stat red">
                <span className="spray" aria-hidden="true" />
                <b>B{avgBracket}</b>{' '}
                <span>avg power</span>
              </div>
              {(['W', 'U', 'B', 'R', 'G'] as const).some((c) => colorCounts[c]) && (
                <div className="stat dcols" title="How many decks use each colour">
                  {(['W', 'U', 'B', 'R', 'G'] as const)
                    .filter((c) => colorCounts[c])
                    .map((c) => (
                      <span key={c} className={`ov-pip pip-${c.toLowerCase()}`} title={`${colorCounts[c]} decks include ${c}`}>
                        {c} <b>{colorCounts[c]}</b>
                      </span>
                    ))}
                </div>
              )}
            </section>
            </>
          )}
          {/* Start a deck from scratch, or bring one in from a list or file (Arena, MTGO, Moxfield, Archidekt, CSV). */}
          <span className="decksactions dribbon-acts">
            <button type="button" className="u-btn primary" onClick={createBlankDeck} title="Start a fresh deck from scratch in The Forge">
              + NEW BLANK DECK
            </button>
            <button type="button" className="u-btn" onClick={() => (haptic('open'), setImporting(true))} title="Import a deck from a list or a CSV file">
              IMPORT DECK
            </button>
          </span>
          </div>
        </div>
        {/* Decks Workbench Toolbar: search, sort, status filters, and tag pills */}
        <div className="decktoolbar" role="search" aria-label="Deck filters and tools">
          <div className="dsearchbox">
            <input
              type="search"
              placeholder="Search decks by name, commander, or tag…"
              value={dq}
              onChange={(e) => setDq(e.target.value)}
              aria-label="Search decks"
            />
          </div>
          <div className="dfilters">
            <label className="dsortpick">
              <span>SORT:</span>
              <select value={dsort} onChange={(e) => setDsort(e.target.value as any)}>
                <option value="updated-desc">RECENTLY UPDATED</option>
                <option value="name-asc">NAME (A → Z)</option>
                <option value="name-desc">NAME (Z → A)</option>
                <option value="match-desc">MATCH % (HIGH → LOW)</option>
                <option value="power-desc">POWER (HIGH → LOW)</option>
                <option value="power-asc">POWER (LOW → HIGH)</option>
                <option value="cards-desc">CARD COUNT</option>
              </select>
            </label>
            <div className="dstatuspick">
              {(['all', 'ready', 'in-progress', 'active'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`u-chip ${dstatus === st ? 'active' : ''}`}
                  onClick={() => setDstatus(st)}
                >
                  {st === 'all' ? 'ALL' : st === 'ready' ? 'READY (100%)' : st === 'in-progress' ? 'IN PROGRESS' : 'ACTIVE'}
                </button>
              ))}
            </div>
          </div>
          {allTags.length > 0 && (
            <div className="decktagpills" aria-label="Filter by tag">
              <span className="tlabel">TAGS:</span>
              <button
                type="button"
                className={`tagpill ${dtag === 'all' ? 'active' : ''}`}
                onClick={() => setDtag('all')}
              >
                ALL
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`tagpill ${dtag === t ? 'active' : ''}`}
                  onClick={() => setDtag(dtag === t ? 'all' : t)}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>
        {menuDeck && listMenu && <DeckMenu deck={menuDeck} at={listMenu.at} onClose={() => setListMenu(null)} onOpen={(id) => (setListMenu(null), setOpen(id))} />}
        {decks.length > 0 && (
          <div className="dsizebar">
            <button
              type="button"
              className="u-btn ghost qzoom-btn"
              title={dzoom === 's' ? 'Size: Small (3 across on phones). Tap for Medium' : dzoom === 'm' ? 'Size: Medium. Tap for Large' : 'Size: Large. Tap for Small'}
              aria-label={`Deck size ${dzoom.toUpperCase()}: tap to cycle size`}
              onClick={() => (haptic('select'), setDzoom(dzoom === 's' ? 'm' : dzoom === 'm' ? 'l' : 's'))}
            >
              SIZE {dzoom.toUpperCase()}
            </button>
          </div>
        )}
        <ul className="dgrid cgrid" data-zoom={dzoom}>
          {filteredDecks.map((d) => {
            const sum = { ...summarize(d.cards.map((c) => c.name), s.mine, s.other), ...shareById.get(d.id) };
            // No commander set: show the deck's most expensive card instead of a blank tile.
            const lead = d.commander ? cmdrs.get(norm(d.commander)) : undefined;
            const autoThemes = themesOf(d);
            const c = lead ?? d.cards.map((x) => priced.get(norm(x.name))).reduce<Card | undefined>((best, x) => (x?.img && Number(x.usd ?? 0) > Number(best?.usd ?? -1) ? x : best), undefined);
            return (
              <li key={d.id} className={`dtile${d.inactive ? ' off' : ''}`} style={{ '--dc': deckColour(d) } as React.CSSProperties}>
                <DeckTile onClick={() => setOpen(d.id!)} onMenu={(x, y) => setListMenu({ id: d.id!, at: { x, y } })} label={d.name}>
                  <span className="cart" aria-hidden="true">
                    {c?.img && <img src={c.img.replace('/small/', '/art_crop/')} alt="" loading="lazy" />}
                  </span>
                  <span className="cinfo">
                    <span className="nm">
                      <b>{d.name}</b>
                      {lead && <Pips ci={lead.ci} size={16} />}
                    </span>
                    <span className="cmatch">
                      <b>{sum.pct}%</b>
                      <Meter pct={sum.pct} label={`${sum.pct}% owned`} tone="deck" />
                    </span>
                    {(d.tags?.length || autoThemes.length > 0) ? (
                      <span className="dtags" onClick={(e) => e.stopPropagation()}>
                        {autoThemes.map((th) => (
                          <span
                            key={th.label}
                            role="button"
                            tabIndex={0}
                            className={`themebadge ${dtag === th.label ? 'active' : ''}`}
                            title={`Theme: ${th.label}. Tap to filter`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDtag(dtag === th.label ? 'all' : th.label);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                setDtag(dtag === th.label ? 'all' : th.label);
                              }
                            }}
                          >
                            {th.label}
                          </span>
                        ))}
                        {d.tags?.map((t) => (
                          <span
                            key={t}
                            role="button"
                            tabIndex={0}
                            className={`tagbadge ${dtag === t ? 'active' : ''}`}
                            title={`Filter by #${t}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDtag(dtag === t ? 'all' : t);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                setDtag(dtag === t ? 'all' : t);
                              }
                            }}
                          >
                            #{t}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    {!d.commander && <span className="nocmdr">no commander set: open the deck to pick one</span>}
                    <span className="cfoot">
                      <span>
                        {d.cards.reduce((n, x) => n + x.qty, 0)} cards
                        {priced.size > 0 && <> · ≈{cad(priceSum(d.cards.map((x) => ({ card: x.foil ? atFinish(priced.get(norm(x.name)), true) : priced.get(norm(x.name)), qty: x.qty }))))}</>}
                      </span>
                      <span className={`cstate${sum.pct === 100 ? ' ready' : ''}`}>{sum.pct === 100 ? 'READY' : `${sum.missing} MISSING`}</span>
                    </span>
                  </span>
                </DeckTile>
                <DeckLight deck={d} />
              </li>
            );
          })}
          {decks.length === 0 && <li className="dempty">No decks yet. Save one from a commander page, or paste a list below.</li>}
        </ul>
        {importing && <ImportDeckPop profile={s.profile} onClose={() => setImporting(false)} onDone={(id) => (setImporting(false), setOpen(id))} />}


      </main>
    </>
  );
}

/** IMPORT DECK: paste a list (Arena, MTGO, Moxfield, Archidekt, plain text) or choose a CSV / text file. Saves a new deck; the
 *  Collection binder is never changed. Cards Scryfall can't find are left out and named, then the deck opens. */
function ImportDeckPop({ profile, onClose, onDone }: { profile: number; onClose: () => void; onDone: (id: number) => void }) {
  const [name, setName] = useState('Imported deck');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [made, setMade] = useState<{ id: number; left: string[] } | null>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  async function pickFile(f: File) {
    setText(await f.text());
    setName(f.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Imported deck');
  }

  async function go() {
    if (!text.trim()) return setError('Paste a list or choose a file first.');
    setError('');
    setBusy({ done: 0, total: 0 });
    try {
      const deckName = await freeDeckName(profile, name.trim() || 'Imported deck');
      const r = await importDeck(profile, deckName, text, (done, total) => setBusy({ done, total }));
      setBusy(null);
      if (!r.deck.cards.length) return setError('No cards found in that list. Check the format and try again.');
      haptic('success');
      const left = r.unmatched.map((u) => u.name);
      if (left.length) setMade({ id: r.deck.id!, left });
      else onDone(r.deck.id!);
    } catch (e) {
      setBusy(null);
      setError(`Import failed: ${(e as Error).message}. Nothing was saved.`);
    }
  }

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="importbox-pop note-pop dimport" role="dialog" aria-modal="true" aria-label="Import a deck" onClick={(e) => e.stopPropagation()}>
        <div className="nh">
          <span>
            IMPORT <mark>DECK</mark>
          </span>
          <button type="button" className="close" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>
        <label className="dimport-field">
          <span>Deck name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>
        <textarea
          aria-label="Deck list"
          rows={8}
          placeholder="Paste a list: Arena, MTGO, Moxfield, Archidekt, or plain text (4 Sol Ring)"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <label className="u-btn ghost dimport-file">
          CHOOSE A FILE (CSV or TXT)
          <input type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
        </label>
        {error && (
          <p role="alert" className="dimport-err">
            {error}
          </p>
        )}
        {made && (
          <p className="dimport-note" role="status">
            Imported. {made.left.length} {made.left.length === 1 ? 'card was' : 'cards were'} not found and left out: {made.left.slice(0, 6).join(', ')}
            {made.left.length > 6 ? '…' : ''}
          </p>
        )}
        <div className="dimport-acts">
          {made ? (
            <button type="button" className="u-btn primary" onClick={() => onDone(made.id)}>
              OPEN DECK
            </button>
          ) : (
            <button type="button" className="u-btn primary" disabled={!!busy} onClick={go}>
              {busy ? `IMPORTING ${busy.done}/${busy.total || '…'}` : 'IMPORT'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
