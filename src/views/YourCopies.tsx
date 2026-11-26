import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Card, type Entry } from '../lib/db';
import { changeOneCopy, copiesOf, stepCopies, type Copy } from '../lib/handcopies';
import { haptic } from '../lib/haptics';
import { norm } from '../lib/names';
import { printingsOf } from '../lib/scryfall';
import type { Toast } from './CardMenu';
import { priced, scryfallUrl, Thumb, usd } from './shared';

/** A copy's printing, finish and list: what tells it apart from the others. */
const keyOf = (e: Pick<Entry, 'cardId' | 'foil' | 'list'>) => `${e.cardId}|${e.foil ? 1 : 0}|${e.list ?? ''}`;
/** Most copies drawn at once; more show as a count (a binder can hold 60 Islands). */
const SHOW = 60;

/**
 * YOUR COPIES (hand of cards, step 1): every copy you own of one card, any printing, foil or not, one card each.
 * Pick a copy to change only that one: its finish, its artwork, one more or one fewer like it. Scryfall is a button
 * here (it used to be the picture click on computers). Opens from a card picture in Collection.
 */
export function YourCopies({ profile, name, onClose, onToast }: { profile: number; name: string; onClose: () => void; onToast: (t: Toast) => void }) {
  const rows = useLiveQuery(() => db.entries.where('profile').equals(profile).filter((e) => norm(e.name) === norm(name)).toArray(), [profile, name]);
  const cards = useLiveQuery(async () => new Map((await db.cards.bulkGet([...new Set((rows ?? []).map((e) => e.cardId))])).filter((c): c is Card => !!c).map((c) => [c.id, c])), [rows]) ?? new Map<string, Card>();
  const copies = useMemo(() => copiesOf(rows ?? [], name), [rows, name]);
  const [pick, setPick] = useState(0);
  // after a change the copy may sit in another row: follow it there
  const follow = useRef<string | null>(null);
  const [arts, setArts] = useState<Awaited<ReturnType<typeof printingsOf>> | null | 'loading' | 'failed'>(null);
  const [busy, setBusy] = useState(false);
  const rowRef = useRef<HTMLUListElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!follow.current) return;
    const at = copies.findIndex((c) => keyOf(c.entry) === follow.current);
    follow.current = null;
    if (at >= 0) setPick(at);
  }, [copies]);
  // the last copy went: nothing left to show
  useEffect(() => {
    if (rows && !copies.length) onClose();
  }, [rows, copies.length, onClose]);
  useEffect(() => closeRef.current?.focus(), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose]);

  const at = Math.min(pick, Math.max(0, copies.length - 1));
  const cur: Copy | undefined = copies[at];
  // keep the chosen copy in view as it changes
  useEffect(() => {
    rowRef.current?.querySelector<HTMLElement>(`[data-copy="${at}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [at]);
  if (!rows || !cur) return null;

  const card = cards.get(cur.entry.cardId);
  const line = (e: Entry) => [e.set?.toUpperCase(), e.cn && `#${e.cn}`].filter(Boolean).join(' ') || 'printing unknown';
  const shown = copies.slice(0, SHOW);
  const run = async (what: () => Promise<() => Promise<void>>, text: string, next?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      follow.current = next ?? null;
      const undo = await what();
      haptic('success');
      onToast({ text, undo });
    } finally {
      setBusy(false);
    }
  };
  const foil = () => {
    const to = !cur.entry.foil;
    return run(() => changeOneCopy(profile, cur.rowId, { foil: to }), `${name}: this copy is ${to ? 'foil' : 'non-foil'} now`, keyOf({ ...cur.entry, foil: to }));
  };
  const openArts = async () => {
    haptic('select');
    if (arts && arts !== 'loading') return setArts(null);
    setArts('loading');
    const got = await printingsOf(name.split(' // ')[0]);
    setArts(got.length ? got : 'failed');
  };
  const keys = (e: React.KeyboardEvent) => {
    const to = e.key === 'ArrowRight' ? at + 1 : e.key === 'ArrowLeft' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? shown.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const n = Math.max(0, Math.min(shown.length - 1, to));
    haptic('tick');
    setPick(n);
    rowRef.current?.querySelector<HTMLElement>(`[data-copy="${n}"]`)?.focus();
  };

  return (
    <>
      <div className="backdrop menuback handback" onClick={onClose} />
      <div className="yourcopies" role="dialog" aria-modal="true" aria-label={`Your copies of ${name}`}>
        <header className="yc-head">
          <h2>
            YOUR COPIES <span className="yc-n">{copies.length}</span>
          </h2>
          <span className="yc-name">{name}</span>
          <a className="u-chip yc-scry" href={scryfallUrl(name)} target="_blank" rel="noreferrer" onClick={() => haptic('tap')}>
            SCRYFALL ↗
          </a>
          <button ref={closeRef} type="button" className="close" onClick={onClose} aria-label="Close your copies">
            ✕
          </button>
        </header>

        <ul className="yc-row" ref={rowRef} role="listbox" aria-label={`Copies of ${name}`} aria-orientation="horizontal" onKeyDown={keys}>
          {shown.map((c, i) => {
            const cd = cards.get(c.entry.cardId);
            const finishTag = c.entry.finish === 'etched' ? 'ETCHED' : c.entry.foil ? 'FOIL' : '';
            const details = [c.entry.condition, c.entry.lang?.toUpperCase()].filter(Boolean).join(' · ');
            return (
              <li key={`${c.rowId}-${c.nth}`} role="presentation">
                <div
                  role="option"
                  data-copy={i}
                  aria-selected={i === at}
                  tabIndex={i === at ? 0 : -1}
                  aria-label={`Copy ${i + 1}: ${line(c.entry)}${finishTag ? `, ${finishTag.toLowerCase()}` : ''}${details ? `, ${details}` : ''}${c.entry.list ? `, in ${c.entry.list}` : ''}`}
                  className={`yc-copy${i === at ? ' on' : ''}`}
                  onClick={() => (haptic('select'), setPick(i), setArts(null))}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setPick(i), setArts(null))}
                >
                  <Thumb src={cd?.img?.replace('/small/', '/normal/')} back={cd?.back} className={`yc-img xart owned${c.entry.foil ? ' foil' : ''}`} name={name} onPick={() => (haptic('select'), setPick(i), setArts(null))} />
                  <span className="yc-tag">
                    {line(c.entry)}
                    {finishTag && <b> {finishTag}</b>}
                    {details ? ` · ${details}` : ''}
                  </span>
                </div>
              </li>
            );
          })}
          {copies.length > SHOW && (
            <li className="yc-more" role="presentation">
              +{copies.length - SHOW} more
            </li>
          )}
        </ul>

        <section className="yc-tools" aria-label="This copy">
          <p className="yc-which">
            COPY {at + 1} OF {copies.length} · {line(cur.entry)} · {cur.entry.foil ? 'foil' : 'non-foil'}
            {cur.entry.list ? ` · ${cur.entry.list}` : ''} · {usd(priced(card, cur.entry.foil))}
          </p>
          <div className="yc-acts">
            <button type="button" className="u-btn" disabled={busy} onClick={() => void foil()}>
              {cur.entry.foil ? 'MAKE NON-FOIL' : 'MAKE FOIL'}
            </button>
            <button type="button" className="u-btn" aria-expanded={!!arts} disabled={busy} onClick={() => void openArts()}>
              CHANGE ARTWORK {arts ? '▲' : '▼'}
            </button>
            <span className="yc-step" role="group" aria-label="Copies like this one">
              <button type="button" className="u-btn" disabled={busy} aria-label={`One fewer like this (${cur.entry.qty} now)`} onClick={() => void run(() => stepCopies(profile, cur.rowId, -1), cur.entry.qty > 1 ? `${name}: one fewer like this` : `Removed this copy of ${name}`, keyOf(cur.entry))}>
                −
              </button>
              <span className="yc-qty" aria-hidden="true">
                ×{cur.entry.qty}
              </span>
              <button type="button" className="u-btn" disabled={busy || cur.entry.qty >= 999} aria-label={`One more like this (${cur.entry.qty} now)`} onClick={() => void run(() => stepCopies(profile, cur.rowId, 1), `${name}: one more like this`, keyOf(cur.entry))}>
                +
              </button>
            </span>
          </div>
          {arts === 'loading' && <p className="small yc-note">Loading printings from Scryfall…</p>}
          {arts === 'failed' && <p className="small yc-note">Scryfall didn't answer. Your copy is unchanged; try again in a moment.</p>}
          {arts && arts !== 'loading' && arts !== 'failed' && (
            <ul className="artgrid yc-arts" aria-label="Printings for this copy">
              {arts.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={p.id === cur.entry.cardId}
                    title={`${p.setName} #${p.cn}`}
                    disabled={busy}
                    onClick={() => {
                      setArts(null);
                      void run(() => changeOneCopy(profile, cur.rowId, { printing: { cardId: p.id, set: p.set, cn: p.cn } }, p), `${name}: this copy is ${p.setName} now`, keyOf({ ...cur.entry, cardId: p.id }));
                    }}
                  >
                    {p.img && <img src={p.img} alt={`${p.setName} #${p.cn}`} loading="lazy" />}
                    <small>
                      {p.set.toUpperCase()} {p.cn}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="small yc-note">Only this copy changes. CHANGE ARTWORK in the ⋮ menu still moves every copy.</p>
        </section>
      </div>
    </>
  );
}
