import { useState } from 'react';
import { buyGroups, overCap } from '../../brain/modes';
import type { EdhCard } from '../../lib/edhrec';
import type { Card } from '../../lib/db';
import { groupOf } from '../../lib/deckstats';
import { haptic } from '../../lib/haptics';
import { inUseChip } from '../../brain/chips';
import type { Allocation } from '../../lib/allocation';
import { norm } from '../../lib/names';
import { fetchedNote, rateNote, shopUrl, toCad } from '../../lib/prices';
import type { SubCard } from '../../lib/subs';
import { money, usd } from '../../views/shared';

export interface CommanderReceiptProps {
  missing: EdhCard[];
  pull: { name: string; qty: number }[];
  toBuyCount: number;
  toBuyCost: number;
  pricesIn: boolean;
  bought: Set<string>;
  cap: number;
  gc: Set<string> | null;
  alloc: Allocation;
  sameCmdr: Set<string>;
  cardOf: (c: EdhCard) => Card | undefined;
  recInfo: Map<string, SubCard>;
  nameIn: (c: EdhCard) => string;
  comboWith: (name: string) => string | undefined;
  onToggleBought: (cardName: string) => void;
}

/** Printable TO BUY / PULL receipt drawer for CommanderView and Forge. */
export function CommanderReceipt({
  missing,
  pull,
  toBuyCount,
  toBuyCost,
  pricesIn,
  bought,
  cap,
  gc,
  alloc,
  sameCmdr,
  cardOf,
  recInfo,
  nameIn,
  comboWith,
  onToggleBought,
}: CommanderReceiptProps) {
  const [side, setSide] = useState<'buy' | 'pull'>('buy');
  const pullSide = side === 'pull' || missing.length === 0;
  const [pulled, setPulled] = useState<Set<string>>(new Set());

  const printReceipt = () => {
    haptic('tap');
    document.documentElement.classList.add('printing');
    const done = () => (document.documentElement.classList.remove('printing'), window.removeEventListener('afterprint', done));
    window.addEventListener('afterprint', done);
    window.print();
  };

  return (
    <aside className={`receipt gbox${pullSide ? ' back' : ''}`} id="shop" aria-label={pullSide ? 'Pull list' : 'Shopping list'}>
      <div className="rflip" role="group" aria-label="Receipt side">
        {missing.length > 0 && (
          <button aria-pressed={!pullSide} onClick={() => (haptic('select'), setSide('buy'))}>
            TO BUY
          </button>
        )}
        <button aria-pressed={pullSide} onClick={() => (haptic('select'), setSide('pull'))}>
          PULL
        </button>
        <button className="rprint" onClick={printReceipt} aria-label="Print this list" title="Print this list">
          PRINT
        </button>
      </div>
      {pullSide ? (
        <>
          <h2>*** PULL LIST ***</h2>
          <hr />
          <div className="sub">
            {pull.reduce((n, c) => n + c.qty, 0)} cards from your binder · tick them as you pull
          </div>
          <ul>
            {pull.map((c) => {
              const done = pulled.has(norm(c.name));
              const use = inUseChip(alloc, c.name, (d) => sameCmdr.has(d));
              return (
                <li key={c.name} className={done ? 'done' : ''}>
                  <label>
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => (
                        haptic(done ? 'tap' : 'success'),
                        setPulled((p) => {
                          const n = new Set(p);
                          if (done) n.delete(norm(c.name));
                          else n.add(norm(c.name));
                          return n;
                        })
                      )}
                      aria-label={`Pulled ${c.name}`}
                    />
                    <span className="nm">
                      {c.qty > 1 ? `${c.qty}× ` : ''}
                      {c.name}
                      {use && (
                        <small>
                          {' '}
                          · {use.lock ? '[LOCKED] ' : ''}
                          {use.text}
                        </small>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <hr />
          <div className="total">
            <span>PULLED</span>
            <span>
              {pulled.size}/{pull.length}
            </span>
          </div>
          <hr />
          <div className="thanks heartfelt">
            <p className="thanks-lead">THANK YOU FOR BUILDING WITH WHAT YOU OWN</p>
            <p className="thanks-body">
              Every card pulled from your collection gives your deck personality and history. Sleeve them up and enjoy every game!
            </p>
          </div>
        </>
      ) : (
        <>
          <h2>*** TO BUY ***</h2>
          <hr />
          <div className="rtop-total">
            <span>TO BUY ({toBuyCount})</span>
            <span>{pricesIn && toBuyCost > 0 ? money(toBuyCost) : '≈CA$—'}</span>
          </div>
          <div className="sub">
            {missing.length} {missing.length === 1 ? 'card' : 'cards'} to complete · single card prices below
          </div>
          <hr />
          {buyGroups(missing, (c) => recInfo.get(norm(c.name))?.incl, (c) => toCad(cardOf(c)?.usd)).map((g) => (
            <div key={g.label} className="rgroup">
              <div className="rgh">
                <span>{g.label}</span>
              </div>
              <ul>
                {g.items.map((c) => {
                  const done = bought.has(norm(c.name));
                  const over = overCap(toCad(cardOf(c)?.usd), cap);
                  const comboPartner = comboWith(c.name);
                  return (
                    <li key={c.name} className={`${done ? 'done' : ''}${over ? ' over' : ''}`}>
                      <label>
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() => (haptic(done ? 'tap' : 'success'), onToggleBought(c.name))}
                          aria-label={`Got ${c.name}`}
                        />
                        <span className="nm">
                          {c.qty && c.qty > 1 ? `${c.qty}× ` : ''}
                          {c.name}
                          {groupOf(cardOf(c)?.type) !== 'Other' && (
                            <small className="ty"> · {groupOf(cardOf(c)?.type).replace(/s$/, '').replace(/ie$/, 'y')}</small>
                          )}
                          {gc?.has(norm(c.name)) && (
                            <small className="rmark gc" title="Game Changer (bracket 4 and up)">
                              {' '}
                              GC
                            </small>
                          )}
                          {comboPartner && (
                            <small className="rmark combo" title={`Combo with ${comboPartner}`}>
                              {' '}
                              COMBO
                            </small>
                          )}
                          {nameIn(c) !== c.name && <small> · using {nameIn(c)} for now</small>}
                          {over && <small className="overcap"> · over CA${cap}</small>}
                        </span>
                      </label>
                      <span className="pr">
                        <a href={shopUrl(c.name)} target="_blank" rel="noreferrer" title={rateNote()} aria-label={`${usd(cardOf(c))}: search ${c.name} on shop.com`}>
                          {usd(cardOf(c))} ↗
                        </a>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <hr />
          <p className="small">
            {rateNote()} {fetchedNote(missing.map((c) => cardOf(c)?.priceAt ?? cardOf(c)?.at))}.
          </p>
          <hr />
          <div className="thanks heartfelt">
            <p className="thanks-lead">THANK YOU FOR BUILDING WITH WHAT YOU OWN</p>
            <p className="thanks-body">
              Brewing with the cards already in your binders keeps every deck personal and creative. We know that sometimes picking up key singles, fresh sleeves, or treating yourself to a reward is part of the joy of the game — whatever you choose to sleeve up, play what brings you joy.
            </p>
          </div>
        </>
      )}
    </aside>
  );
}
