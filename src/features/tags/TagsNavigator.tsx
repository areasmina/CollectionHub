import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { SHOWS, type Show } from '../../lib/arrange';
import { cardFromList, cardList, smallPic, type CardList } from '../../lib/cardlist';
import { db, type Card } from '../../lib/db';
import { haptic } from '../../lib/haptics';
import { norm } from '../../lib/names';
import { onPendingTag, openDiscoverSub, openGuidedWithSeeds, takePendingTag } from '../../lib/nav';
import { resolveRows } from '../../lib/scryfall';
import { findTags } from '../../lib/tags';
import { CardMenu, type Toast } from '../../views/CardMenu';
import { ManaIcon } from '../../views/zine';
import { TagGraph } from './TagGraph';
import {
  countOwnedForTag,
  createTagIndex,
  evalTagQuery,
  loadTagData,
  starterTags,
  type TagCondition,
  type TagIndex,
} from './tagState';
import styles from './TagsNavigator.module.css';

const PAGE_SIZE = 60;
const PIPS = ['W', 'U', 'B', 'R', 'G', 'C'] as const;

export function TagsNavigator({
  profile,
  binderName,
  mine,
  onToast,
}: {
  profile: number;
  binderName: string;
  mine: Map<string, number>;
  onToast: (t: Toast) => void;
}) {
  const [index, setIndex] = useState<TagIndex | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [listMap, setListMap] = useState<CardList | null>(null);
  const [mode, setMode] = useState<'graph' | 'browse'>('graph');
  const [query, setQuery] = useState('');
  const [dropOpen, setDropOpen] = useState(false);
  const [focusTag, setFocusTag] = useState<number>(0);
  const [conditions, setConditions] = useState<TagCondition[]>([]);
  const [show, setShow] = useState<Show>('owned');
  const [formatMode, setFormatMode] = useState<'paper' | 'online'>(() => {
    try {
      return localStorage.getItem('ch:format_mode') === 'online' ? 'online' : 'paper';
    } catch {
      return 'paper';
    }
  });
  const [colours, setColours] = useState<string[]>([]);
  const [cardFilter, setCardFilter] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [menu, setMenu] = useState<{ name: string; x: number; y: number } | null>(null);

  const toggleFormatMode = () => {
    haptic('select');
    setFormatMode((prev) => {
      const next = prev === 'paper' ? 'online' : 'paper';
      try {
        localStorage.setItem('ch:format_mode', next);
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    let live = true;
    loadTagData().then((d) => {
      if (!live) return;
      if (!d || !d.tags.length) {
        setLoadFailed(true);
        return;
      }
      const idx = createTagIndex(d);
      setIndex(idx);
      const pending = takePendingTag();
      const pendingIdx = pending
        ? idx.byLabel.get(pending.toLowerCase()) ??
          idx.data.tags.findIndex((t) => t.id === pending || t.label.toLowerCase() === pending.toLowerCase())
        : -1;
      const first = pendingIdx >= 0 ? pendingIdx : starterTags(idx)[0] ?? 0;
      setFocusTag(first);
      setConditions([{ tagIdx: first, mode: 'include' }]);
    });
    cardList().then((cl) => live && setListMap(cl));
    const offTag = onPendingTag((tagName) => {
      setIndex((curIdx) => {
        if (!curIdx) return curIdx;
        const foundIdx =
          curIdx.byLabel.get(tagName.toLowerCase()) ??
          curIdx.data.tags.findIndex((t) => t.id === tagName || t.label.toLowerCase() === tagName.toLowerCase());
        if (foundIdx >= 0) {
          setFocusTag(foundIdx);
          setConditions([{ tagIdx: foundIdx, mode: 'include' }]);
          setLimit(PAGE_SIZE);
        }
        return curIdx;
      });
    });
    return () => {
      live = false;
      offTag();
    };
  }, []);

  const ownedSet = useMemo(() => new Set(mine.keys()), [mine]);

  // Memory-lean: query only cards needed for colour filtering or currently visible results, not all db.cards
  const [visibleKeys, setVisibleKeys] = useState<string[]>([]);
  const dbCards =
    useLiveQuery(async () => {
      if (!visibleKeys.length) return new Map<string, Card>();
      const hits = await db.cards.where('key').anyOf(visibleKeys).toArray();
      const map = new Map<string, Card>();
      for (const c of hits) if (!map.has(c.key)) map.set(c.key, c);
      return map;
    }, [visibleKeys.join('|')]) ?? new Map<string, Card>();

  const cardInfoOf = useMemo(() => {
    return (name: string): { img?: string; ci?: string[] } => {
      const hit = dbCards.get(norm(name));
      if (hit) return { img: hit.img, ci: hit.ci };
      if (listMap) {
        const fromList = cardFromList(listMap, name);
        if (fromList) return { img: fromList.img ?? smallPic(fromList.id), ci: fromList.ci };
      }
      return {};
    };
  }, [dbCards, listMap]);

  const starters = useMemo(() => (index ? starterTags(index) : []), [index]);

  const searchHits = useMemo(() => {
    if (!index || !query.trim()) return [];
    return findTags(index.data, query, 20);
  }, [index, query]);

  const matches = useMemo(() => {
    if (!index) return [];
    return evalTagQuery(index, conditions, {
      owned: ownedSet,
      show,
      colours,
      ciOf: (name) => cardInfoOf(name).ci,
      search: cardFilter,
    });
  }, [index, conditions, ownedSet, show, colours, cardInfoOf, cardFilter]);

  const visible = useMemo(() => matches.slice(0, limit), [matches, limit]);

  useEffect(() => {
    const keys = visible.map((m) => norm(m.name));
    setVisibleKeys(keys);
  }, [visible]);

  // Lazy-fetch Scryfall metadata only for visible cards that aren't in Dexie or oracle.json yet
  const [extraImgs, setExtraImgs] = useState<Map<string, Card>>(new Map());
  useEffect(() => {
    const missing = visible.map((m) => m.name).filter((n) => !cardInfoOf(n).img && !extraImgs.has(norm(n)));
    if (!missing.length) return;
    let live = true;
    resolveRows(
      missing.slice(0, 60).map((name) => ({ name, qty: 1 })),
      () => {},
    )
      .then((res) => {
        if (!live) return;
        setExtraImgs((prev) => new Map([...prev, ...res.matched.map(({ card }) => [card.key, card] as const)]));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [visible, cardInfoOf]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusCounts = useMemo(() => {
    if (!index) return null;
    const tag = index.data.tags[focusTag];
    if (!tag) return null;
    return {
      self: countOwnedForTag(index, focusTag, ownedSet),
      parents: tag.parents.map((p) => ({ idx: p, label: index.data.tags[p].label, ...countOwnedForTag(index, p, ownedSet) })),
      children: tag.children
        .map((c) => ({ idx: c, label: index.data.tags[c].label, ...countOwnedForTag(index, c, ownedSet) }))
        .sort((a, b) => b.owned - a.owned || b.total - a.total),
    };
  }, [index, focusTag, ownedSet]);

  if (loadFailed) {
    return (
      <div className={styles.root}>
        <p className={styles.attrib}>
          Tag data could not be loaded (`public/tags/tags.json`). Run <code>node scripts/build-tags.mjs</code> to generate the offline Scryfall Tagger snapshot.
        </p>
      </div>
    );
  }

  if (!index) {
    return (
      <div className={styles.root}>
        <p className={styles.attrib}>Loading Scryfall Tagger function tree…</p>
      </div>
    );
  }

  const pickTag = (tagIdx: number, addAsCondition = false) => {
    haptic('select');
    setFocusTag(tagIdx);
    setLimit(PAGE_SIZE);
    setConditions((prev) => {
      if (!addAsCondition) return [{ tagIdx, mode: 'include' }];
      if (prev.some((c) => c.tagIdx === tagIdx)) return prev;
      return [...prev, { tagIdx, mode: 'include' }];
    });
  };

  const toggleConditionFromGraph = (tagIdx: number) => {
    haptic('select');
    setFocusTag(tagIdx);
    setLimit(PAGE_SIZE);
    setConditions((prev) => {
      if (prev.length === 1 && prev[0].tagIdx === tagIdx) return prev;
      if (prev.some((c) => c.tagIdx === tagIdx)) return prev.filter((c) => c.tagIdx !== tagIdx);
      return [...prev, { tagIdx, mode: 'include' }];
    });
  };

  const cycleShow = () => {
    haptic('select');
    const idx = SHOWS.findIndex(([v]) => v === show);
    setShow(SHOWS[(idx + 1) % SHOWS.length][0]);
    setLimit(PAGE_SIZE);
  };

  const togglePip = (p: string) => {
    haptic('select');
    setColours((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
    setLimit(PAGE_SIZE);
  };

  const activeTag = index.data.tags[focusTag];
  const selectedSet = new Set(conditions.filter((c) => c.mode === 'include' || c.mode === 'or').map((c) => c.tagIdx));
  const ownedMatchesCount = matches.filter((m) => m.owned).length;

  return (
    <div className={styles.root}>
      <p className={styles.attrib}>
        <span>
          Read-only community tags from{' '}
          <a href="https://tagger.scryfall.com/" target="_blank" rel="noreferrer">
            Scryfall Tagger
          </a>
          . Counts include descendant tags; reference only.
        </span>
        <span>Snapshot: {index.data.at || 'local'}</span>
      </p>

      <div className={styles.topBar}>
        <div className={styles.searchWrap}>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search tags (e.g. draw, enchantment-engine, loot)…"
            aria-label="Search Scryfall tags"
            value={query}
            onFocus={() => setDropOpen(true)}
            onBlur={() => setTimeout(() => setDropOpen(false), 160)}
            onChange={(e) => {
              setQuery(e.target.value);
              setDropOpen(true);
            }}
          />
          {dropOpen && searchHits.length > 0 && (
            <ul className={styles.dropdown} role="listbox" aria-label="Matching tags">
              {searchHits.map((tIdx) => {
                const c = countOwnedForTag(index, tIdx, ownedSet);
                return (
                  <li key={tIdx}>
                    <button
                      type="button"
                      className={styles.dropdownBtn}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickTag(tIdx, conditions.length > 0 && query.startsWith('+'));
                        setQuery('');
                        setDropOpen(false);
                      }}
                    >
                      <span>{index.data.tags[tIdx].label}</span>
                      <span className={styles.dropdownMeta}>
                        {c.owned}/{c.total} yours
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={styles.modeSeg} role="group" aria-label="Tag navigator view">
          <button type="button" className={styles.modeBtn} aria-pressed={mode === 'graph'} onClick={() => (haptic('select'), setMode('graph'))}>
            GRAPH
          </button>
          <button type="button" className={styles.modeBtn} aria-pressed={mode === 'browse'} onClick={() => (haptic('select'), setMode('browse'))}>
            BROWSE
          </button>
        </div>
      </div>

      <div className={styles.starters} role="group" aria-label="Popular starter tags">
        {starters.map((tIdx) => (
          <button key={tIdx} type="button" className={styles.starterChip} aria-pressed={focusTag === tIdx} onClick={() => pickTag(tIdx, false)}>
            {index.data.tags[tIdx].label}
          </button>
        ))}
      </div>

      <div className={styles.split}>
        {/* Left: Graph or Browse */}
        <section className={styles.pane} aria-label={mode === 'graph' ? 'Tag relationship graph' : 'Browse tag branches'}>
          {mode === 'graph' ? (
            <TagGraph
              index={index}
              rootIdx={focusTag}
              selectedTags={selectedSet}
              owned={ownedSet}
              formatMode={formatMode}
              onSelectTag={toggleConditionFromGraph}
              onOpenBrowse={(tIdx) => {
                setFocusTag(tIdx);
                setMode('browse');
              }}
            />
          ) : (
            activeTag &&
            focusCounts && (
              <div>
                <div className={styles.browseHead}>
                  <div className={styles.tagTitleRow}>
                    <h2 className={styles.tagTitle}>{activeTag.label}</h2>
                    <span className={styles.dropdownMeta}>
                      {focusCounts.self.owned} of {focusCounts.self.total} yours
                    </span>
                  </div>
                  {activeTag.description && (
                    <p className={styles.tagDesc}>
                      {activeTag.description.split(/(\[[^\]]+\]\([^)]+\))/g).map((part, idx) => {
                        const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
                        if (!m) return <span key={idx}>{part}</span>;
                        const [, linkLabel, rawSlug] = m;
                        const slugLower = rawSlug.trim().toLowerCase();
                        const target = index.byLabel.get(slugLower) ?? index.byLabel.get(slugLower.replace(/-/g, ' '));
                        if (target === undefined) return <span key={idx}>{linkLabel}</span>;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => pickTag(target, false)}
                            style={{
                              background: 'none',
                              border: 0,
                              padding: 0,
                              font: 'inherit',
                              color: 'var(--mo-hazard)',
                              textDecoration: 'underline',
                              cursor: 'pointer',
                            }}
                          >
                            {linkLabel}
                          </button>
                        );
                      })}
                    </p>
                  )}
                  {activeTag.aliases.length > 0 && <span className={styles.aliases}>Aliases: {activeTag.aliases.join(', ')}</span>}
                  <div className={styles.branchChips} style={{ marginTop: 6 }}>
                    <button type="button" className={styles.branchChip} onClick={() => pickTag(focusTag, false)}>
                      SOLO THIS TAG
                    </button>
                    {!conditions.some((c) => c.tagIdx === focusTag) && (
                      <button type="button" className={styles.branchChip} onClick={() => pickTag(focusTag, true)}>
                        + ADD TO QUERY
                      </button>
                    )}
                  </div>
                </div>

                {focusCounts.parents.length > 0 && (
                  <div className={styles.branchGroup}>
                    <span className={styles.branchLabel}>BROADER ({focusCounts.parents.length})</span>
                    <div className={styles.branchChips}>
                      {focusCounts.parents.map((p) => (
                        <button key={p.idx} type="button" className={styles.branchChip} data-empty={p.owned === 0} onClick={() => pickTag(p.idx, false)}>
                          <span>↑ {p.label}</span>
                          <span className={styles.branchOwned}>
                            {p.owned}/{p.total}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {focusCounts.children.length > 0 && (
                  <div className={styles.branchGroup}>
                    <span className={styles.branchLabel}>NARROWER ({focusCounts.children.length})</span>
                    <div className={styles.branchChips}>
                      {focusCounts.children.slice(0, 60).map((c) => (
                        <button key={c.idx} type="button" className={styles.branchChip} data-empty={c.owned === 0} onClick={() => pickTag(c.idx, false)}>
                          <span>{c.label}</span>
                          <span className={styles.branchOwned}>
                            {c.owned}/{c.total}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </section>

        {/* Right: Active Conditions + Cards Grid */}
        <section className={styles.pane} aria-label="Tagged cards">
          <div className={styles.condBar} role="group" aria-label="Active tag conditions">
            {conditions.length === 0 ? (
              <span className={styles.graphCount}>Click a tag in the graph or search above to view cards.</span>
            ) : (
              conditions.map((cond, i) => {
                const label = index.data.tags[cond.tagIdx]?.label ?? 'tag';
                return (
                  <span key={cond.tagIdx} className={styles.condPill} data-mode={cond.mode}>
                    <button
                      type="button"
                      className={styles.condToggle}
                      title="Cycle condition: AND → OR → NOT"
                      onClick={() => {
                        haptic('select');
                        setConditions((prev) =>
                          prev.map((c, j) =>
                            j === i
                              ? { ...c, mode: c.mode === 'include' ? 'or' : c.mode === 'or' ? 'exclude' : 'include' }
                              : c
                          )
                        );
                      }}
                    >
                      {cond.mode === 'include' ? 'AND' : cond.mode === 'or' ? 'OR' : 'NOT'}
                    </button>
                    <span>{label}</span>
                    <button
                      type="button"
                      className={styles.condRemove}
                      aria-label={`Remove ${label}`}
                      onClick={() => {
                        haptic('tap');
                        setConditions((prev) => prev.filter((_, j) => j !== i));
                      }}
                    >
                      ×
                    </button>
                  </span>
                );
              })
            )}
          </div>

          <div className={styles.filterRow}>
            <div className={styles.filterLeft}>
              <button type="button" className={styles.showBtn} onClick={cycleShow} title="Cycle: Owned Only → Missing Only → All Cards">
                SHOW: {SHOWS.find(([v]) => v === show)?.[1]}
              </button>
              <button
                type="button"
                className={styles.showBtn}
                onClick={toggleFormatMode}
                title={formatMode === 'paper' ? 'Paper Commander: digital/Arena tags like seek are greyed out. Click to switch to Online.' : 'Online Mode: digital/Arena-only tags highlighted.'}
              >
                FORMAT: {formatMode === 'paper' ? 'PAPER' : 'ONLINE'}
              </button>
              {ownedMatchesCount > 0 && (
                <button
                  type="button"
                  className={styles.showBtn}
                  title="Send top matching cards you own into the Guided Builder to find a commander and build a 100-card deck"
                  onClick={() => {
                    haptic('open');
                    const seeds = matches
                      .filter((m) => m.owned)
                      .slice(0, 8)
                      .map((m) => m.name);
                    openGuidedWithSeeds(seeds);
                    openDiscoverSub('guided');
                    onToast({ text: `Loaded ${seeds.length} owned cards into Guided Builder` });
                  }}
                >
                  BUILD WITH THESE TAGS →
                </button>
              )}
              {PIPS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={styles.pipBtn}
                  aria-pressed={colours.includes(p)}
                  aria-label={`Filter colour ${p}`}
                  onClick={() => togglePip(p)}
                >
                  <ManaIcon c={p} />
                </button>
              ))}
            </div>
            <input
              type="search"
              className={styles.cardSearch}
              placeholder="Filter cards…"
              aria-label="Filter matching cards by name"
              value={cardFilter}
              onChange={(e) => {
                setCardFilter(e.target.value);
                setLimit(PAGE_SIZE);
              }}
            />
          </div>

          <p className={styles.resultMeta} role="status">
            {matches.length.toLocaleString()} {matches.length === 1 ? 'card' : 'cards'} shown
            {show === 'all' ? ` · ${ownedMatchesCount.toLocaleString()} yours` : ''}
          </p>

          <ul className={styles.cardGrid}>
            {visible.map((m) => {
              const info = cardInfoOf(m.name);
              const img = info.img ?? extraImgs.get(norm(m.name))?.img;
              const qty = mine.get(norm(m.name)) ?? 0;
              return (
                <li
                  key={m.name}
                  className={styles.cardItem}
                  data-owned={m.owned}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ name: m.name, x: e.clientX, y: e.clientY });
                  }}
                >
                  {img ? <img src={img} alt={m.name} loading="lazy" className={styles.cardImg} /> : <div className={styles.cardPlaceholder}>{m.name}</div>}
                  <div className={styles.cardFoot}>
                    <div style={{ minWidth: 0 }}>
                      <div className={styles.cardName} title={m.name}>
                        {m.name}
                      </div>
                      <div className={styles.cardBadges}>
                        {m.isTop && <span className={styles.topTag}>TOP</span>}
                        <span>{qty > 0 ? `${qty}× yours` : 'unowned'}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.moreBtn}
                      aria-label={`More for ${m.name}`}
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        haptic('open');
                        setMenu({ name: m.name, x: r.left, y: r.bottom });
                      }}
                    >
                      ⋮
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {matches.length > limit && (
            <button type="button" className={styles.loadMore} onClick={() => setLimit((n) => n + PAGE_SIZE)}>
              SHOW MORE ({matches.length - limit} REMAINING)
            </button>
          )}
        </section>
      </div>

      {menu && (
        <CardMenu
          name={menu.name}
          at={{ x: menu.x, y: menu.y }}
          profile={profile}
          binderName={binderName}
          owned={mine.get(norm(menu.name)) ?? 0}
          onClose={() => setMenu(null)}
          onToast={onToast}
        />
      )}
    </div>
  );
}
