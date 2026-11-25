import { useMemo, useRef, useState } from 'react';
import { countOwnedForTag, type TagIndex } from './tagState';
import styles from './TagsNavigator.module.css';

const NODE_W = 206;
const NODE_H = 38;
const COL_GAP = 26;
const ROW_GAP = 72;
const MAX_CHILDREN_PER_NODE = 16;

interface LayoutNode {
  id: string;
  tagIdx: number;
  x: number;
  y: number;
  row: number;
  isMore?: boolean;
  moreCount?: number;
  parentTagIdx?: number;
}

interface LayoutEdge {
  from: string;
  to: string;
  fromTag: number;
  toTag: number;
}

/** Computes a clean layered DAG layout around `rootIdx` and all currently `expanded` nodes. */
function buildGraphLayout(index: TagIndex, rootIdx: number, expanded: Set<number>) {
  const { tags } = index.data;
  const nodesMap = new Map<number, { tagIdx: number; row: number }>();
  const edges: LayoutEdge[] = [];
  const edgeSeen = new Set<string>();
  const moreNodes: LayoutNode[] = [];

  const addNode = (tagIdx: number, row: number) => {
    const prev = nodesMap.get(tagIdx);
    if (!prev) nodesMap.set(tagIdx, { tagIdx, row });
  };
  const addEdge = (fromTag: number, toTag: number) => {
    const key = `${fromTag}->${toTag}`;
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    edges.push({ from: `t-${fromTag}`, to: `t-${toTag}`, fromTag, toTag });
  };

  addNode(rootIdx, 0);

  // Show immediate parents of root (row -1) and parents of any expanded node when expanded
  const queue: { tagIdx: number; row: number }[] = [{ tagIdx: rootIdx, row: 0 }];
  const walked = new Set<number>();

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (walked.has(cur.tagIdx)) continue;
    walked.add(cur.tagIdx);

    const t = tags[cur.tagIdx];
    // Always include direct parents of the root; include parents of other expanded nodes too
    if (cur.tagIdx === rootIdx || expanded.has(cur.tagIdx)) {
      for (const p of t.parents.slice(0, 6)) {
        addNode(p, cur.row - 1);
        addEdge(p, cur.tagIdx);
      }
    }

    if (expanded.has(cur.tagIdx)) {
      // Sort children by total cards desc so most meaningful sub-branches appear first
      const sortedKids = [...t.children].sort((a, b) => index.cardsOfMemo(b).size - index.cardsOfMemo(a).size);
      const visibleKids = sortedKids.slice(0, MAX_CHILDREN_PER_NODE);
      for (const child of visibleKids) {
        addNode(child, cur.row + 1);
        addEdge(cur.tagIdx, child);
        if (expanded.has(child)) {
          queue.push({ tagIdx: child, row: cur.row + 1 });
        }
      }
      if (sortedKids.length > MAX_CHILDREN_PER_NODE) {
        const moreId = `more-${cur.tagIdx}`;
        moreNodes.push({
          id: moreId,
          tagIdx: cur.tagIdx,
          parentTagIdx: cur.tagIdx,
          x: 0,
          y: 0,
          row: cur.row + 1,
          isMore: true,
          moreCount: sortedKids.length - MAX_CHILDREN_PER_NODE,
        });
        edges.push({ from: `t-${cur.tagIdx}`, to: moreId, fromTag: cur.tagIdx, toTag: -1 });
      }
    }
  }

  // Group nodes by row and distribute horizontally
  const byRow = new Map<number, LayoutNode[]>();
  for (const n of nodesMap.values()) {
    const list = byRow.get(n.row) ?? [];
    list.push({ id: `t-${n.tagIdx}`, tagIdx: n.tagIdx, x: 0, y: 0, row: n.row });
    byRow.set(n.row, list);
  }
  for (const m of moreNodes) {
    const list = byRow.get(m.row) ?? [];
    list.push(m);
    byRow.set(m.row, list);
  }

  const rows = [...byRow.keys()].sort((a, b) => a - b);
  const allNodes: LayoutNode[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const r of rows) {
    const rowNodes = byRow.get(r)!;
    // Wrap very wide rows into 2 sub-rows of at most 6 pills to keep aspect ratio readable
    const perLine = Math.max(4, Math.min(6, rowNodes.length));
    rowNodes.forEach((node, idx) => {
      const subRow = Math.floor(idx / perLine);
      const col = idx % perLine;
      const colsInThisLine = Math.min(perLine, rowNodes.length - subRow * perLine);
      const totalW = colsInThisLine * NODE_W + (colsInThisLine - 1) * COL_GAP;
      node.x = -totalW / 2 + col * (NODE_W + COL_GAP);
      node.y = r * (NODE_H + ROW_GAP) + subRow * (NODE_H + 22);
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x + NODE_W);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y + NODE_H);
      allNodes.push(node);
    });
  }

  const byId = new Map(allNodes.map((n) => [n.id, n]));
  return {
    nodes: allNodes,
    byId,
    edges,
    bounds: {
      minX: Number.isFinite(minX) ? minX - 40 : -200,
      minY: Number.isFinite(minY) ? minY - 40 : -150,
      width: Number.isFinite(maxX - minX) ? Math.max(420, maxX - minX + 80) : 420,
      height: Number.isFinite(maxY - minY) ? Math.max(300, maxY - minY + 80) : 300,
    },
  };
}

export function TagGraph({
  index,
  rootIdx,
  selectedTags,
  owned,
  onSelectTag,
  onOpenBrowse,
}: {
  index: TagIndex;
  rootIdx: number;
  selectedTags: Set<number>;
  owned: Set<string>;
  onSelectTag: (tagIdx: number) => void;
  onOpenBrowse: (tagIdx: number) => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([rootIdx]));
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; baseX: number; baseY: number; moved: boolean }>({
    active: false,
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0,
    moved: false,
  });

  // Reset expansion cleanly when user picks a brand new root tag from search
  const lastRoot = useRef(rootIdx);
  if (lastRoot.current !== rootIdx) {
    lastRoot.current = rootIdx;
    setExpanded(new Set([rootIdx]));
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }

  const layout = useMemo(() => buildGraphLayout(index, rootIdx, expanded), [index, rootIdx, expanded]);

  const counts = useMemo(() => {
    const m = new Map<number, { owned: number; total: number }>();
    for (const n of layout.nodes) {
      if (!n.isMore && !m.has(n.tagIdx)) m.set(n.tagIdx, countOwnedForTag(index, n.tagIdx, owned));
    }
    return m;
  }, [layout.nodes, index, owned]);

  const toggleExpand = (tagIdx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tagIdx)) next.delete(tagIdx);
      else next.add(tagIdx);
      return next;
    });
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const fitView = () => {
    const scaleX = 760 / layout.bounds.width;
    const scaleY = 460 / layout.bounds.height;
    setZoom(Math.max(0.45, Math.min(1.2, Number(Math.min(scaleX, scaleY).toFixed(2)))));
    setPan({ x: 0, y: 0 });
  };

  const cx = layout.bounds.minX + layout.bounds.width / 2;
  const cy = layout.bounds.minY + layout.bounds.height / 2;

  return (
    <div className={styles.graphWrap}>
      <div className={styles.graphHud}>
        <span className={styles.graphCount}>{layout.nodes.filter((n) => !n.isMore).length} tags on canvas</span>
        <div className={styles.graphBtns} role="group" aria-label="Graph controls">
          <button type="button" className={styles.hudBtn} onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))))} aria-label="Zoom out">
            −
          </button>
          <button type="button" className={styles.hudBtn} onClick={() => setZoom((z) => Math.min(2, Number((z + 0.15).toFixed(2))))} aria-label="Zoom in">
            +
          </button>
          <button type="button" className={styles.hudBtn} onClick={fitView}>
            FIT
          </button>
          <button type="button" className={styles.hudBtn} onClick={resetView}>
            RESET
          </button>
        </div>
      </div>

      <svg
        className={styles.graphSvg}
        viewBox={`${layout.bounds.minX} ${layout.bounds.minY} ${layout.bounds.width} ${layout.bounds.height}`}
        role="img"
        aria-label={`Tag relationship graph centered on ${index.data.tags[rootIdx]?.label ?? 'tag'}`}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest?.('[data-node]')) return;
          dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y, moved: false };
          (e.currentTarget as SVGSVGElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragRef.current.active) return;
          const dx = e.clientX - dragRef.current.startX;
          const dy = e.clientY - dragRef.current.startY;
          if (Math.hypot(dx, dy) > 4) dragRef.current.moved = true;
          setPan({ x: dragRef.current.baseX + dx / zoom, y: dragRef.current.baseY + dy / zoom });
        }}
        onPointerUp={() => {
          dragRef.current.active = false;
        }}
        onPointerCancel={() => {
          dragRef.current.active = false;
        }}
      >
        <defs>
          <marker id="tag-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="rgba(255,255,255,0.35)" />
          </marker>
          <marker id="tag-arrow-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#e60012" />
          </marker>
        </defs>

        <g transform={`translate(${cx + pan.x}, ${cy + pan.y}) scale(${zoom}) translate(${-cx}, ${-cy})`}>
          {/* Edges */}
          {layout.edges.map((e) => {
            const a = layout.byId.get(e.from);
            const b = layout.byId.get(e.to);
            if (!a || !b) return null;
            const x1 = a.x + NODE_W / 2;
            const y1 = a.y + NODE_H;
            const x2 = b.x + NODE_W / 2;
            const y2 = b.y;
            const midY = (y1 + y2) / 2;
            const hot =
              hoverIdx !== null
                ? e.fromTag === hoverIdx || e.toTag === hoverIdx
                : selectedTags.has(e.fromTag) || selectedTags.has(e.toTag);
            return (
              <path
                key={`${e.from}-${e.to}`}
                d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2 - 4}`}
                fill="none"
                stroke={hot ? '#e60012' : 'rgba(255,255,255,0.22)'}
                strokeWidth={hot ? 2 : 1.4}
                markerEnd={hot ? 'url(#tag-arrow-hot)' : 'url(#tag-arrow)'}
              />
            );
          })}

          {/* Nodes */}
          {layout.nodes.map((n) => {
            if (n.isMore) {
              return (
                <g
                  key={n.id}
                  data-node="more"
                  transform={`translate(${n.x}, ${n.y})`}
                  className={styles.svgNode}
                  role="button"
                  tabIndex={0}
                  aria-label={`Browse ${n.moreCount} more child tags`}
                  onClick={() => onOpenBrowse(n.tagIdx)}
                  onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onOpenBrowse(n.tagIdx)}
                >
                  <rect width={NODE_W} height={NODE_H} rx={6} fill="#19191f" stroke="#ffcc00" strokeDasharray="4 3" strokeWidth={1.4} />
                  <text x={NODE_W / 2} y={23} textAnchor="middle" fill="#ffcc00" fontSize="12" fontFamily="Space Mono, monospace">
                    +{n.moreCount} MORE IN BROWSE →
                  </text>
                </g>
              );
            }

            const tag = index.data.tags[n.tagIdx];
            const c = counts.get(n.tagIdx) ?? { owned: 0, total: 0 };
            const isSel = selectedTags.has(n.tagIdx);
            const isRoot = n.tagIdx === rootIdx;
            const isExp = expanded.has(n.tagIdx);
            const hasBranches = tag.children.length > 0 || tag.parents.length > 0;
            const dim = c.owned === 0 && owned.size > 0;
            const label = tag.label.length > 17 ? `${tag.label.slice(0, 16)}…` : tag.label;

            return (
              <g
                key={n.id}
                data-node={n.tagIdx}
                transform={`translate(${n.x}, ${n.y})`}
                className={styles.svgNode}
                opacity={dim && !isSel && !isRoot ? 0.58 : 1}
                onMouseEnter={() => setHoverIdx(n.tagIdx)}
                onMouseLeave={() => setHoverIdx(null)}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={6}
                  fill={isSel ? '#241116' : isRoot ? '#1c1c24' : '#121215'}
                  stroke={isSel ? '#e60012' : isRoot ? '#ffcc00' : '#3a3a46'}
                  strokeDasharray={isSel ? '4 2' : undefined}
                  strokeWidth={isSel || isRoot ? 2 : 1.2}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select tag ${tag.label} (${c.owned} of ${c.total} yours)`}
                  onClick={() => onSelectTag(n.tagIdx)}
                  onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onSelectTag(n.tagIdx)}
                />
                <circle cx={14} cy={NODE_H / 2} r={4.5} fill={isSel ? '#e60012' : c.owned > 0 ? '#2fa35a' : '#888894'} pointerEvents="none" />
                <text x={25} y={16} fill="#ffffff" fontSize="12" fontWeight="700" fontFamily="Archivo, sans-serif" pointerEvents="none">
                  {label}
                </text>
                <text x={25} y={30} fill={c.owned > 0 ? '#ffcc00' : '#888894'} fontSize="10.5" fontFamily="Space Mono, monospace" pointerEvents="none">
                  {c.owned}/{c.total} yours
                </text>

                {hasBranches && (
                  <g
                    transform={`translate(${NODE_W - 28}, 7)`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${isExp ? 'Collapse' : 'Expand'} branches of ${tag.label}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      toggleExpand(n.tagIdx);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.stopPropagation();
                        toggleExpand(n.tagIdx);
                      }
                    }}
                  >
                    <rect width={22} height={24} rx={4} fill={isExp ? '#e60012' : '#212129'} stroke="#3a3a46" strokeWidth={1} />
                    <text x={11} y={16} textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="700" fontFamily="Space Mono, monospace" pointerEvents="none">
                      {isExp ? '−' : '+'}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
