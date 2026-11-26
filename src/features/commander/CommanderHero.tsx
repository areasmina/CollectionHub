import type { ReactNode } from 'react';
import { pickBest, type FitResult } from '../../lib/bestfit';
import type { Deck } from '../../lib/db';
import { BRACKETS, GEARS, type EdhCard, type EdhPage } from '../../lib/edhrec';
import { haptic } from '../../lib/haptics';
import { cad, fetchedNote } from '../../lib/prices';
import type { Shortfall } from '../../lib/copies';
import type { readiness } from '../../brain/validate';
import type { bracketFit } from '../../brain/validate';
import { Meter } from '../../views/parts';
import { CmdrCard, DeckLink, OutsideLinks, SaltStat, ShortAlert, type Shared } from '../../views/shared';
import { ReadyTiles } from '../../views/Verdict';
import { heroRoom, Pips, Ransom } from '../../views/zine';

export interface CommanderHeroProps {
  name: string;
  label: string;
  no?: number;
  narrow: boolean;
  bigImg?: string;
  ci: string[];
  path: string;
  page: EdhPage | null;
  names: string[];
  all: EdhCard[];
  mine: Deck[];
  saved: string;
  allMine: boolean;
  onToggleAllMine: () => void;
  sum: { owned: number; total: number; other: number; pct: number };
  s: Shared;
  ready?: ReturnType<typeof readiness>;
  fit?: ReturnType<typeof bracketFit>;
  bracket: string;
  onBracketChange: (b: string) => void;
  budget: string;
  onBudgetChange: (b: string) => void;
  kind: 'commander' | 'average';
  covText: string;
  pricesIn: boolean;
  deckCost: number;
  cardOf: (c: EdhCard) => { priceAt?: number; at?: number } | undefined;
  error: string;
  forging: boolean;
  filteredPins?: boolean;
  filteredNumDecks?: number;
  short: Shortfall[];
  hasReceipt: boolean;
  missingCount: number;
  toBuyCount: number;
  toBuyCost: number;
  pullCount: number;
  buyOpen: boolean;
  onOpenBuy: () => void;
  best: { busy: boolean; done: number; results?: FitResult[] };
  onRunBest: () => void;
  onResetBest: () => void;
  onStartForge: () => void;
  onOpenMenu: (x: number, y: number) => void;
}

/** Hero card, collection match bar, status strip, and BEST FOR MY CARDS strip. */
export function CommanderHero({
  name,
  label,
  no,
  narrow,
  bigImg,
  ci,
  path,
  page,
  names,
  all,
  mine,
  saved,
  allMine,
  onToggleAllMine,
  sum,
  s,
  ready,
  fit,
  bracket,
  onBracketChange,
  budget,
  onBudgetChange,
  kind,
  covText,
  pricesIn,
  deckCost,
  cardOf,
  error,
  forging,
  filteredPins,
  filteredNumDecks,
  short,
  hasReceipt,
  missingCount,
  toBuyCount,
  toBuyCost,
  pullCount,
  buyOpen,
  onOpenBuy,
  best,
  onRunBest,
  onResetBest,
  onStartForge,
  onOpenMenu,
}: CommanderHeroProps) {
  const binderNote: ReactNode =
    kind === 'average' && (covText || (pricesIn && deckCost > 0)) ? (
      <>
        <span className="lbl">FROM YOUR BINDER</span>
        <b title={pricesIn && deckCost > 0 ? `What the whole deck costs (cheapest printings) ${fetchedNote(all.map((c) => cardOf(c)?.priceAt ?? cardOf(c)?.at))}` : undefined}>
          {covText || (pricesIn && deckCost > 0 ? `deck ≈${cad(deckCost)}` : '—')}
        </b>
        {covText && pricesIn && deckCost > 0 && <small>deck ≈{cad(deckCost)}</small>}
      </>
    ) : undefined;

  return (
    <>
      <section className="vhero" aria-label={`${label}: commander`}>
        <div className="vcard">{bigImg && <CmdrCard src={bigImg} name={label} onMenu={onOpenMenu} />}</div>
        <div className="vinfo">
          <div className="vname">
            <span className="vslash" aria-hidden="true" />
            <h1 aria-label={label}>
              <Ransom text={label.toUpperCase()} size={narrow ? (label.length > 28 ? 26 : 32) : label.length > 28 ? 40 : 52} seed={11} room={narrow ? heroRoom() : undefined} />
            </h1>
          </div>
          <p className="vmeta">
            <Pips ci={ci} size={20} />
            <span>NO.{no ? String(no).padStart(3, '0') : '—'}</span>
            <span>{page?.numDecks ? page.numDecks.toLocaleString() : '—'} decks</span>
            {page && <SaltStat names={names} />}
            {mine.length > 0 && !saved && (
              <span className="mydecks">
                <span className="mydecks-lbl">your deck{mine.length > 1 ? 's' : ''}:</span>
                {(allMine ? mine : mine.slice(0, 3)).map((d) => (
                  <span key={d.id} className="mydecks-pill">
                    <DeckLink name={d.name} />
                  </span>
                ))}
                {mine.length > 3 && (
                  <button type="button" className="mydecks-more" onClick={() => (haptic('select'), onToggleAllMine())}>
                    {allMine ? 'fewer' : `+${mine.length - 3} more`}
                  </button>
                )}
              </span>
            )}
            <OutsideLinks commander={name} edhrecPath={path} />
          </p>
          <div className="vmatch" aria-label={`${sum.pct}% match: you own ${sum.owned} of ${sum.total} cards in ${s.binderName}`}>
            <b className="num">{page ? `${sum.pct}%` : '—'}</b>
            <span className="vbar">
              <Meter pct={page ? sum.pct : 0} label={`Collection match ${sum.pct}%`} />
              <small>
                collection match · you own {sum.owned} of {sum.total} in this deck
                {sum.other > 0 ? ` · ${sum.other} in ${s.otherName}` : ''}
              </small>
            </span>
          </div>
          {ready && <ReadyTiles ready={ready} fit={fit} bracket={bracket} onBracketChange={onBracketChange} brackets={BRACKETS} cardNames={names} note={binderNote} />}
        </div>
      </section>

      {!error && (
        <section className={`dstrip${forging ? ' forging' : ''}`} aria-label="Deck status" aria-busy={!page}>
          <p className="dstatus" role="status">
            {!page ? (
              <span>loading EDHREC data…</span>
            ) : kind === 'average' ? (
              <>{filteredPins && <span className="cmode">suggestions from {filteredNumDecks?.toLocaleString()} EDHREC decks that fit your pins</span>}</>
            ) : (
              <span>every card here is in your binder</span>
            )}
          </p>
          <div className="dacts">
            <ShortAlert items={short} inline currentDeck={name} />
            {page && hasReceipt && !forging && (
              <button type="button" className={`u-btn tobuy${missingCount ? ' money' : ''}`} aria-haspopup="dialog" aria-expanded={buyOpen} onClick={() => (haptic('open'), onOpenBuy())}>
                {missingCount > 0 ? (
                  <>
                    TO BUY <b>{toBuyCount}</b>
                    {pricesIn && toBuyCost > 0 && <span className="u-sticker">≈{cad(toBuyCost)}</span>}
                  </>
                ) : (
                  <>
                    PULL <b>{pullCount}</b>
                  </>
                )}
              </button>
            )}
            {page && kind === 'average' && !forging && (
              <button
                type="button"
                className="u-btn bestfit"
                aria-busy={best.busy}
                onClick={onRunBest}
                title="Check EDHREC's decks at power 3, 4 and 5 and every budget, and open the one you already own the most of"
              >
                {best.busy ? `CHECKING ${best.done}/9` : 'BEST FOR MY CARDS'}
              </button>
            )}
            {page && kind === 'average' && !forging && (
              <button type="button" className="u-btn primary forge" onClick={() => (haptic('open'), onStartForge())} title="Open The Forge: live role meters and ranked suggestions">
                FORGE
              </button>
            )}
          </div>
        </section>
      )}

      {best.results &&
        kind === 'average' &&
        !forging &&
        (() => {
          const ok = best.results.filter((r) => r.share).sort((a, b) => b.share!.pct - a.share!.pct);
          const top = pickBest(best.results);
          const fitLabel = (r: FitResult) => `${BRACKETS.find(([v]) => v === r.bracket)?.[1].toUpperCase()} POWER · ${GEARS.find(([v]) => v === r.budget)?.[1]} GEAR`;
          return (
            <section className="bestfit-row" aria-label="Best for my cards">
              <small className="bnote" role="status">
                {top
                  ? `Checked ${ok.length} EDHREC decks: you own the most of ${fitLabel(top).toLowerCase()} (${top.share!.owned} of ${top.share!.total} cards, ${top.share!.pct}%).`
                  : 'EDHREC has no decks at power 3, 4 or 5 to compare right now.'}
              </small>
              {ok.length > 1 && (
                <div className="themes" role="group" aria-label="Decks checked">
                  {ok.map((r) => (
                    <button
                      key={r.bracket + r.budget}
                      type="button"
                      className="u-chip"
                      aria-pressed={bracket === r.bracket && budget === r.budget}
                      onClick={() => (haptic('select'), onBracketChange(r.bracket), onBudgetChange(r.budget))}
                    >
                      {fitLabel(r)} <small>{r.share!.pct}%</small>
                    </button>
                  ))}
                  <button type="button" className="u-chip" onClick={() => (haptic('tap'), onResetBest())}>
                    HIDE
                  </button>
                </div>
              )}
            </section>
          );
        })()}
    </>
  );
}
