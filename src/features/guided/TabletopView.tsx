import { useState } from 'react';
import type { Card, DeckCard } from '../../lib/db';
import { norm } from '../../lib/names';
import {
  BASIC_LAND_FOR,
  groupForTabletop,
  withBasicFallback,
  type TabletopGroupBy,
  type TabletopPlacement,
  type TabletopStackStyle,
} from './guidedState';
import s from './GuidedBuilder.module.css';

interface TabletopViewProps {
  cards: DeckCard[];
  commander?: string;
  partner?: string;
  identity: readonly string[];
  groupBy: TabletopGroupBy;
  onGroupBy: (mode: TabletopGroupBy) => void;
  cardOf: (name: string) => Pick<Card, 'type' | 'text' | 'cmc' | 'mana' | 'ci' | 'usd' | 'img'> | undefined;
  onAdjustCard: (name: string, delta: number) => void;
}

export function TabletopView({
  cards,
  commander,
  partner,
  identity,
  groupBy,
  onGroupBy,
  cardOf,
  onAdjustCard,
}: TabletopViewProps) {
  const [placement, setPlacement] = useState<TabletopPlacement>('primary');
  const [stackStyle, setStackStyle] = useState<TabletopStackStyle>('compact');

  const resolve = withBasicFallback(cardOf);
  const piles = groupForTabletop(cards, resolve, groupBy, commander, partner, placement);
  const leadSet = new Set([commander, partner].filter(Boolean).map((n) => norm(n!)));

  const colorBasics = identity
    .filter((c): c is 'W' | 'U' | 'B' | 'R' | 'G' => c in BASIC_LAND_FOR)
    .map((c) => BASIC_LAND_FOR[c]);
  const basicPool = colorBasics.length > 0 ? colorBasics : ['Wastes'];

  const qtyOf = (name: string) => cards.find((c) => norm(c.name) === norm(name))?.qty ?? 0;

  return (
    <div className={s.tabletopCanvas}>
      <div className={s.tabletopToolbar}>
        <div className={s.dialGroup}>
          <span className={s.dialLabel}>Group by</span>
          <div className={s.seg} role="group" aria-label="Tabletop group by">
            {(
              [
                ['categories', 'Categories'],
                ['type', 'Card Type'],
                ['mv', 'Mana Value'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={s.segBtn}
                aria-pressed={groupBy === id}
                onClick={() => onGroupBy(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {groupBy === 'categories' && (
          <div className={s.dialGroup}>
            <span className={s.dialLabel}>Placement</span>
            <div className={s.seg} role="group" aria-label="Card placement mode">
              <button
                type="button"
                className={s.segBtn}
                aria-pressed={placement === 'primary'}
                onClick={() => setPlacement('primary')}
              >
                Primary
              </button>
              <button
                type="button"
                className={s.segBtn}
                aria-pressed={placement === 'all'}
                onClick={() => setPlacement('all')}
              >
                All Roles
              </button>
            </div>
          </div>
        )}

        <div className={s.dialGroup}>
          <span className={s.dialLabel}>Stack</span>
          <div className={s.seg} role="group" aria-label="Tabletop stack style">
            <button
              type="button"
              className={s.segBtn}
              aria-pressed={stackStyle === 'compact'}
              onClick={() => setStackStyle('compact')}
            >
              Compact
            </button>
            <button
              type="button"
              className={s.segBtn}
              aria-pressed={stackStyle === 'art'}
              onClick={() => setStackStyle('art')}
            >
              Art
            </button>
          </div>
        </div>

        <div className={s.basicsBar} aria-label="Basic land steppers">
          {basicPool.map((land) => {
            const count = qtyOf(land);
            return (
              <div key={land} className={s.basicStepper}>
                <span>{land}</span>
                <button
                  type="button"
                  className={s.miniBtn}
                  aria-label={`Remove one ${land}`}
                  disabled={count === 0}
                  onClick={() => onAdjustCard(land, -1)}
                >
                  -
                </button>
                <span>{count}</span>
                <button
                  type="button"
                  className={s.miniBtn}
                  aria-label={`Add one ${land}`}
                  onClick={() => onAdjustCard(land, 1)}
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className={s.pilesGrid}>
        {piles.map((pile) => {
          const hitTarget =
            pile.target && pile.count >= pile.target[0] && pile.count <= pile.target[1];
          return (
            <section key={pile.id} className={s.pile} aria-label={`${pile.label} pile`}>
              <header className={s.pileHead}>
                <span>{pile.label}</span>
                <span className={hitTarget ? s.pileCountOk : undefined}>
                  {pile.count}
                  {pile.target ? ` / ${pile.target[0]}–${pile.target[1]}` : ''}
                </span>
              </header>

              {pile.cards.length === 0 ? (
                <p className={s.mutedNote}>Empty pile</p>
              ) : (
                <div className={s.pileStack}>
                  {pile.cards.map((entry) => {
                    const isLead = leadSet.has(norm(entry.name));
                    const meta = resolve(entry.name);
                    return (
                      <button
                        key={`${pile.id}-${entry.name}`}
                        type="button"
                        className={s.pileCard}
                        title={isLead ? 'Commander' : `Click to remove 1x ${entry.name}`}
                        disabled={isLead}
                        onClick={() => onAdjustCard(entry.name, -1)}
                      >
                        <span className={stackStyle === 'art' ? s.pileCardArt : undefined}>
                          {stackStyle === 'art' && meta?.img && (
                            <img
                              className={s.pileThumb}
                              src={meta.img.replace('/small/', '/art_crop/')}
                              alt=""
                              loading="lazy"
                            />
                          )}
                          <span>
                            {entry.qty > 1 ? `${entry.qty}x ` : ''}
                            {entry.name}
                          </span>
                        </span>
                        <span className={s.pileCardMv}>
                          {isLead ? 'CMD' : meta?.cmc != null ? `${meta.cmc}` : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
