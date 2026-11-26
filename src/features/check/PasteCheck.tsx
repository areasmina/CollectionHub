import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { cardFromList, cardList, smallPic, type CardList } from '../../lib/cardlist';
import { statusOf, summarize } from '../../lib/compare';
import { db, type Card, type Cheap } from '../../lib/db';
import { haptic } from '../../lib/haptics';
import { parseImport } from '../../lib/importers';
import { norm } from '../../lib/names';
import { cad, toCad } from '../../lib/prices';
import { cheapest } from '../../lib/scryfall';
import styles from './PasteCheck.module.css';

const SAMPLE_LIST = `Commander
1 Sythis, Harvest's Hand

Deck
1 Sol Ring
1 Arcane Signet
1 Command Tower
1 Enchantress's Presence
1 Mesa Enchantress
1 Eidolon of Blossoms
1 Sterling Grove
1 Sanctum Weaver
1 Rhystic Study
1 Cyclonic Rift
1 Swords to Plowshares
1 Path to Exile
1 Cultivate
1 Rampant Growth
10 Plains
10 Forest`;

export function PasteCheck({
  mine,
  other,
  binderName,
  otherName,
}: {
  mine: Map<string, number>;
  other: Map<string, number>;
  binderName: string;
  otherName: string;
}) {
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<'all' | 'missing' | 'owned'>('all');
  const [copied, setCopied] = useState(false);
  const [listMap, setListMap] = useState<CardList | null>(null);
  const [cheapMap, setCheapMap] = useState<Map<string, Cheap>>(new Map());

  useEffect(() => {
    let live = true;
    cardList().then((cl) => live && setListMap(cl));
    return () => {
      live = false;
    };
  }, []);

  const parsed = useMemo(() => (text.trim() ? parseImport(text) : null), [text]);

  // Collapse duplicate card rows by normalized name while preserving qty
  const rows = useMemo(() => {
    if (!parsed) return [];
    const byKey = new Map<string, { name: string; qty: number }>();
    for (const r of parsed.rows) {
      const k = norm(r.name);
      const prev = byKey.get(k);
      if (prev) prev.qty += r.qty;
      else byKey.set(k, { name: r.name, qty: r.qty });
    }
    return [...byKey.values()];
  }, [parsed]);

  const dbCards =
    useLiveQuery(async () => {
      if (!rows.length) return new Map<string, Card>();
      const all = await db.cards.where('key').anyOf(rows.map((r) => norm(r.name))).toArray();
      return new Map(all.map((c) => [c.key, c]));
    }, [rows.map((r) => r.name).join('|')]) ?? new Map<string, Card>();

  // Check cached/cheapest prices for missing cards only (debounced cleanly)
  const missingNames = useMemo(
    () => rows.filter((r) => statusOf(r.name, mine) !== 'owned').map((r) => r.name),
    [rows, mine],
  );

  useEffect(() => {
    if (!missingNames.length) {
      setCheapMap(new Map());
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      cheapest(missingNames, (ch) => live && setCheapMap(new Map(ch))).catch(() => {});
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [missingNames.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const expandedNames = useMemo(() => rows.flatMap((r) => Array.from({ length: r.qty }, () => r.name)), [rows]);
  const summary = useMemo(() => summarize(expandedNames, mine, other), [expandedNames, mine, other]);

  const missingTotalCad = useMemo(() => {
    let sum = 0;
    for (const r of rows) {
      if (statusOf(r.name, mine) === 'owned') continue;
      const k = norm(r.name);
      const usd = cheapMap.get(k)?.usd ?? dbCards.get(k)?.usd;
      const c = toCad(usd);
      if (c) sum += c * r.qty;
    }
    return sum;
  }, [rows, mine, cheapMap, dbCards]);

  const shown = useMemo(() => {
    return rows.filter((r) => {
      const st = statusOf(r.name, mine, other);
      if (filter === 'missing') return st !== 'owned';
      if (filter === 'owned') return st === 'owned';
      return true;
    });
  }, [rows, mine, other, filter]);

  const copyMissing = async () => {
    const lines = rows.filter((r) => statusOf(r.name, mine) !== 'owned').map((r) => `${r.qty} ${r.name}`);
    if (!lines.length) return;
    haptic('success');
    await navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className={styles.root}>
      <section className={styles.pane} aria-label="Paste any decklist">
        <div className={styles.headRow}>
          <h2 className={styles.title}>CHECK ANY LIST</h2>
          <div className={styles.btnRow}>
            <button type="button" className={styles.btn} onClick={() => (haptic('select'), setText(SAMPLE_LIST))}>
              TRY SAMPLE DECK
            </button>
            {text && (
              <button type="button" className={styles.btn} onClick={() => (haptic('tap'), setText(''))}>
                CLEAR
              </button>
            )}
          </div>
        </div>
        <p className={styles.hint}>
          Paste a Moxfield, Archidekt, Arena, or plain card list. Nothing is saved to your binder ({binderName}) or decks.
        </p>
        <textarea
          className={styles.textarea}
          aria-label="Decklist to check against your collection"
          placeholder={`1 Sol Ring\n1 Rhystic Study\n10 Forest\n...`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {parsed && parsed.errors.length > 0 && (
          <p className={styles.hint} role="status" style={{ color: '#ff6b76' }}>
            {parsed.errors.length} {parsed.errors.length === 1 ? 'line' : 'lines'} skipped (could not parse).
          </p>
        )}
      </section>

      <section className={styles.pane} aria-label="Collection match results">
        {!rows.length ? (
          <p className={styles.hint}>Paste a list on the left (or tap Try sample deck) to see how much of it you own.</p>
        ) : (
          <>
            <div className={styles.summary}>
              <div className={styles.stat}>
                <span className={styles.statLbl}>OWNED</span>
                <span className={styles.statVal} data-accent="true">
                  {summary.pct}%
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLbl}>HAVE / TOTAL</span>
                <span className={styles.statVal}>
                  {summary.owned}/{summary.total}
                </span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLbl}>MISSING</span>
                <span className={styles.statVal}>{summary.missing}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLbl}>EST. MISSING</span>
                <span className={styles.statVal}>{missingTotalCad > 0 ? cad(missingTotalCad) : '—'}</span>
              </div>
            </div>

            {summary.other > 0 && (
              <p className={styles.hint}>
                {summary.other} missing {summary.other === 1 ? 'card is' : 'cards are'} sitting in <b>{otherName}</b>.
              </p>
            )}

            <div className={styles.filters}>
              <div className={styles.filterBtns} role="group" aria-label="Filter checked cards">
                {(['all', 'missing', 'owned'] as const).map((f) => (
                  <button key={f} type="button" className={styles.chip} aria-pressed={filter === f} onClick={() => (haptic('select'), setFilter(f))}>
                    {f === 'all' ? `ALL (${rows.length})` : f === 'missing' ? `MISSING (${rows.filter((r) => statusOf(r.name, mine) !== 'owned').length})` : `OWNED (${rows.filter((r) => statusOf(r.name, mine) === 'owned').length})`}
                  </button>
                ))}
              </div>
              {missingNames.length > 0 && (
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={copyMissing}>
                  {copied ? 'COPIED MISSING ✓' : 'COPY MISSING LIST'}
                </button>
              )}
            </div>

            <ul className={styles.list}>
              {shown.map((r) => {
                const k = norm(r.name);
                const st = statusOf(r.name, mine, other);
                const dbCard = dbCards.get(k);
                const fromList = !dbCard && listMap ? cardFromList(listMap, r.name) : null;
                const img = dbCard?.img ?? (fromList ? smallPic(fromList.id) : undefined);
                const priceUsd = cheapMap.get(k)?.usd ?? dbCard?.usd;
                const priceCad = toCad(priceUsd);
                return (
                  <li key={r.name} className={styles.card} data-status={st}>
                    {img ? <img src={img} alt={r.name} loading="lazy" className={styles.img} /> : <div className={styles.placeholder}>{r.name}</div>}
                    <div className={styles.name} title={r.name}>
                      {r.qty > 1 ? `${r.qty}× ` : ''}
                      {r.name}
                    </div>
                    <div className={styles.meta}>
                      <span className={st === 'owned' ? styles.badgeOwned : st === 'other' ? styles.badgeOther : styles.badgeMissing}>
                        {st === 'owned' ? 'OWNED' : st === 'other' ? `IN ${otherName.toUpperCase()}` : 'MISSING'}
                      </span>
                      <span>{priceCad ? cad(priceCad) : ''}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
