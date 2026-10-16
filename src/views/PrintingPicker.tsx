import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Printing } from '../lib/db';
import { haptic } from '../lib/haptics';
import { printingsOf } from '../lib/scryfall';
import { PointMenu } from './PointMenu';
import { usd } from './shared';
import { Tape } from './zine';

const year = (p: Printing) => p.released.slice(0, 4);
const nameOf = (p: Printing) => `${p.setName} (${p.set.toUpperCase()}) #${p.cn}`;

/** Pick which printing (set + art) of one card is the one you mean: only that card's real printings, each with a
 *  preview; tap one to see it big, then confirm. */
export function PrintingPicker({
  name,
  current,
  foil,
  hint,
  onPick,
  onReset,
  resetLabel,
  onClose,
}: {
  name: string;
  current?: string; // Scryfall id of the printing in use now (marked CURRENT)
  foil?: boolean; // this copy is foil: the foil price is shown
  hint?: string; // a line under the name (e.g. "This copy has no set yet")
  onPick: (p: Printing) => void;
  onReset?: () => void; // back to the default printing
  resetLabel?: string;
  onClose: () => void;
}) {
  const [list, setList] = useState<Printing[] | null>(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState<string | undefined>(current);
  const [q, setQ] = useState('');
  const [tries, setTries] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setError('');
    printingsOf(name)
      .then((l) => live && (setList(l), setSel((s) => (s && l.some((p) => p.id === s) ? s : l[0]?.id))))
      .catch((e) => live && setError((e as Error).message));
    return () => void (live = false);
  }, [name, tries]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', key);
    dialog.current?.focus();
    return () => removeEventListener('keydown', key);
  }, []);
  // The printing in use starts in view, however far down the list it is.
  useEffect(() => {
    if (list && current) dialog.current?.querySelector('[data-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [list]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (list ?? []).filter((p) => !t || [p.setName, p.set, p.cn, p.released.slice(0, 4), ...p.tags].some((x) => x.toLowerCase().includes(t)));
  }, [list, q]);
  const pick = list?.find((p) => p.id === sel);

  // At the top level of the page: the tab bar and footer sit above anything inside the page content.
  return createPortal(
    <>
      <div className="backdrop printback" onClick={onClose} />
      <div ref={dialog} tabIndex={-1} className="printpick" role="dialog" aria-modal="true" aria-label={`Pick the printing of ${name}`}>
        <Tape style={{ top: -11, left: '12%', width: 80, height: 22, transform: 'rotate(-4deg)' }} />
        <button className="close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <h2>{name}</h2>
        <p className="ppsub">{hint ?? 'Pick the printing you mean. Only editions this card was printed in are listed.'}</p>

        {!list && !error && <p className="count">Looking up its printings on Scryfall…</p>}
        {error && (
          <p className="error">
            {error}{' '}
            <button className="decklink" onClick={() => setTries(tries + 1)}>
              try again
            </button>
          </p>
        )}

        {pick && (
          <div className="ppbig" aria-live="polite">
            <img src={pick.big ?? pick.img} alt={`${name}, ${nameOf(pick)}`} />
            <div className="ppinfo">
              <b>{pick.setName}</b>
              <span>
                {pick.set.toUpperCase()} · #{pick.cn} · {year(pick)}
              </span>
              <span className="ppprice">{usd(foil && pick.usdFoil ? { ...pick, usd: pick.usdFoil } : pick)}</span>
              <span className="ppfoilp">
                {foil ? 'your foil copy' : pick.usdFoil && pick.usdFoil !== pick.usd ? `foil ${usd({ ...pick, usd: pick.usdFoil })}` : ''}
              </span>
              {pick.finishes.length > 0 && <span className="ppfin">{pick.finishes.map((f) => (f === 'nonfoil' ? 'non-foil' : f)).join(' · ')}</span>}
              {pick.tags.length > 0 && (
                <span className="pptags">
                  {pick.tags.map((t) => (
                    <i key={t}>{t}</i>
                  ))}
                </span>
              )}
              {pick.id === current && <span className="ppcur">IN USE NOW</span>}
            </div>
          </div>
        )}

        {list && list.length > 6 && <input className="ppfilter" type="search" placeholder={`Filter ${list.length} printings: set, number, year, “borderless”…`} aria-label="Filter printings" value={q} onChange={(e) => setQ(e.target.value)} />}
        {list && (
          <ul className="ppgrid" aria-label="Printings">
            {shown.map((p) => (
              <li key={p.id}>
                <button className={p.id === sel ? 'sel' : ''} aria-pressed={p.id === sel} data-current={p.id === current} aria-label={`${nameOf(p)}${p.tags.length ? `, ${p.tags.join(', ')}` : ''}`} onClick={() => (haptic('select'), setSel(p.id))}>
                  <img src={p.img} alt="" loading="lazy" />
                  <span className="pcap">
                    {p.set.toUpperCase()} <b>#{p.cn}</b>
                  </span>
                  <span className="pyr">
                    {year(p)}
                    {p.tags[0] ? ` · ${p.tags[0]}` : ''}
                  </span>
                  {p.id === current && <em>NOW</em>}
                </button>
              </li>
            ))}
            {!shown.length && <li className="ppnone">No printing matches “{q}”.</li>}
          </ul>
        )}

        <div className="ppbar">
          <button className="btn" disabled={!pick} onClick={() => pick && (haptic('success'), onPick(pick))}>
            {pick?.id === current ? 'KEEP THIS PRINTING' : 'USE THIS PRINTING'}
          </button>
          {onReset && (
            <button className="btn secondary" onClick={() => (haptic('tap'), onReset())}>
              {resetLabel ?? 'USE THE DEFAULT'}
            </button>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

/** Right-click / press-and-hold menu for a card outside the binder and decks (Discover): change its art, or put it back. */
export function ArtMenu({ name, at, custom, onPrint, onReset, onClose }: { name: string; at: { x: number; y: number }; custom: boolean; onPrint: () => void; onReset: () => void; onClose: () => void }) {
  const act = (f: () => void) => () => (onClose(), f());
  return (
    <PointMenu title={name} at={at} onClose={onClose}>
      <li>
        <button role="menuitem" onClick={act(onPrint)}>
          ◧ Change set / art
          <small>{custom ? ' · art picked' : ' · pick the exact printing'}</small>
        </button>
      </li>
      {custom && (
        <li>
          <button role="menuitem" onClick={act(onReset)}>
            ↺ Back to the default art
          </button>
        </li>
      )}
    </PointMenu>
  );
}
