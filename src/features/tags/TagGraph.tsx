import { useMemo, useRef, useState } from 'react';
import { DIGITAL_ONLY_TAGS, countOwnedForTag, type TagIndex } from './tagState';
import styles from './TagsNavigator.module.css';

const NODE_W = 206;
const NODE_H = 38;
const MAX_CHILDREN_PER_NODE = 16;

interface LayoutNode {
  id: string;
  tagIdx: number;
  x: number;
  y: number;
  angle?: number;
  isMore?: boolean;
  moreCount?: number;
  digitalNote?: string;
  digitalLabel?: string;
}

interface LayoutEdge {
  from: string;
  to: string;
  fromTag: number;
  toTag: number;
}

/**
 * Computes a radial/orbital layout centered on `rootIdx` at (0, 0).
 * Parents arc above root; direct children orbit around root in a clean ellipse so
 * arrows never cross sibling nodes or create false parent-child visual nesting.
 */
function buildGraphLayout(index: TagIndex, rootIdx: number, expanded: Set<number>, formatMode: 'paper' | 'online') {
  const { tags } = index.data;
  const nodes = new Map<string, LayoutNode>();
  const edges: LayoutEdge[] = [];
  const edgeSeen = new Set<string>();

  const addEdge = (from: string, to: string, fromTag: number, toTag: number) => {
    const key = `${from}->${to}`;
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    edges.push({ from, to, fromTag, toTag });
  };

  // 1. Center root
  nodes.set(`t-${rootIdx}`, { id: `t-${rootIdx}`, tagIdx: rootIdx, x: -NODE_W / 2, y: -NODE_H / 2 });

  const rootTag = tags[rootIdx];
  const parents = rootTag?.parents.slice(0, 5) ?? [];

  // 2. Parents in clean upper arc
  if (parents.length > 0) {
    const gap = NODE_W + 28;
    const totalW = parents.length * NODE_W + (parents.length - 1) * 28;
    parents.forEach((pIdx, idx) => {
      const x = -totalW / 2 + idx * gap;
      const y = -270 - (parents.length > 2 ? Math.abs(idx - (parents.length - 1) / 2) * 18 : 0);
      nodes.set(`t-${pIdx}`, { id: `t-${pIdx}`, tagIdx: pIdx, x, y });
      addEdge(`t-${pIdx}`, `t-${rootIdx}`, pIdx, rootIdx);
    });
  }

  // 3. Direct children + optional digital-only ghosts (e.g. `seek` under `card advantage`) orbiting around root
  if (expanded.has(rootIdx) && rootTag) {
    const sortedKids = [...rootTag.children].sort((a, b) => index.cardsOfMemo(b).size - index.cardsOfMemo(a).size);
    const visibleKids = sortedKids.slice(0, MAX_CHILDREN_PER_NODE);
    const matchingDigital = DIGITAL_ONLY_TAGS.filter(
      (d) =>
        d.parentLabel.toLowerCase() === rootTag.label.toLowerCase() &&
        !visibleKids.some((k) => tags[k]?.label.toLowerCase() === d.label.toLowerCase())
    );

    const orbitItems: Array<
      | { kind: 'tag'; tagIdx: number }
      | { kind: 'digital'; id: string; label: string; note: string }
      | { kind: 'more'; count: number }
    > = [
      ...visibleKids.map((tagIdx) => ({ kind: 'tag' as const, tagIdx })),
      ...matchingDigital.map((d) => ({ kind: 'digital' as const, id: d.id, label: d.label, note: d.note })),
      ...(sortedKids.length > MAX_CHILDREN_PER_NODE
        ? [{ kind: 'more' as const, count: sortedKids.length - MAX_CHILDREN_PER_NODE }]
        : []),
    ];

    const n = orbitItems.length;
    if (n > 0) {
      const rx = Math.max(330, Math.min(540, n * 38));
      const ry = Math.max(220, Math.min(340, n * 24));
      // Leave upper gap for parents (-125deg to -55deg -> reserve ~70deg span around -PI/2 when parents exist)
      const hasParents = parents.length > 0;
      const startAngle = hasParents ? -Math.PI / 2 + 0.62 : -Math.PI / 2;
      const sweep = hasParents ? Math.PI * 2 - 1.24 : Math.PI * 2;

      orbitItems.forEach((item, idx) => {
        const angle = n === 1 ? Math.PI / 2 : startAngle + (sweep * idx) / (hasParents ? Math.max(1, n - 1) : n);
        const cx = Math.cos(angle) * rx;
        const cy = Math.sin(angle) * ry;
        const x = cx - NODE_W / 2;
        const y = cy - NODE_H / 2;

        if (item.kind === 'more') {
          const moreId = `more-${rootIdx}`;
          nodes.set(moreId, {
            id: moreId,
            tagIdx: rootIdx,
            x,
            y,
            isMore: true,
            moreCount: item.count,
          });
          addEdge(`t-${rootIdx}`, moreId, rootIdx, -1);
          return;
        }

        if (item.kind === 'digital') {
          const dId = `digital-${item.id}`;
          nodes.set(dId, {
            id: dId,
            tagIdx: -1,
            x,
            y,
            digitalLabel: item.label,
            digitalNote: formatMode === 'paper' ? `${item.note} · greyed in Paper mode` : item.note,
          });
          addEdge(`t-${rootIdx}`, dId, rootIdx, -2);
          return;
        }

        const childIdx = item.tagIdx;
        const childId = `t-${childIdx}`;
        if (!nodes.has(childId)) {
          nodes.set(childId, { id: childId, tagIdx: childIdx, x, y, angle });
        }
        addEdge(`t-${rootIdx}`, childId, rootIdx, childIdx);

        // 4. Expanded grandchildren radiate outward along child's orbital angle
        if (expanded.has(childIdx)) {
          const grandKids = [...tags[childIdx].children]
            .sort((a, b) => index.cardsOfMemo(b).size - index.cardsOfMemo(a).size)
            .slice(0, 6);
          grandKids.forEach((gIdx, gPos) => {
            const gId = `t-${gIdx}`;
            if (!nodes.has(gId)) {
              const offset = grandKids.length === 1 ? 0 : ((gPos / (grandKids.length - 1)) - 0.5) * 0.85;
              const ga = angle + offset;
              const gx = Math.cos(ga) * (rx + 230) - NODE_W / 2;
              const gy = Math.sin(ga) * (ry + 170) - NODE_H / 2;
              nodes.set(gId, { id: gId, tagIdx: gIdx, x: gx, y: gy, angle: ga });
            }
            addEdge(childId, gId, childIdx, gIdx);
          });
        }
      });
    }
  }

  const allNodes = [...nodes.values()];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of allNodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x + NODE_W);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y + NODE_H);
  }

  return {
    nodes: allNodes,
    byId: nodes,
    edges,
    bounds: {
      minX: Number.isFinite(minX) ? minX - 48 : -320,
      minY: Number.isFinite(minY) ? minY - 48 : -240,
      width: Number.isFinite(maxX - minX) ? Math.max(640, maxX - minX + 96) : 640,
      height: Number.isFinite(maxY - minY) ? Math.max(460, maxY - minY + 96) : 460,
    },
  };
}

/** Compute the clean point on a node rectangle boundary facing a target point. */
function rectAnchor(from: LayoutNode, to: LayoutNode) {
  const fx = from.x + NODE_W / 2;
  const fy = from.y + NODE_H / 2;
  const tx = to.x + NODE_W / 2;
  const ty = to.y + NODE_H / 2;
  const dx = tx - fx;
  const dy = ty - fy;
  if (dx === 0 && dy === 0) return { x: fx, y: fy };
  const hw = NODE_W / 2;
  const hh = NODE_H / 2;
  const sx = Math.abs(dx) > 0 ? hw / Math.abs(dx) : Infinity;
  const sy = Math.abs(dy) > 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(sx, sy);
  return { x: fx + dx * t, y: fy + dy * t };
}

export function TagGraph({
  index,
  rootIdx,
  selectedTags,
  owned,
  formatMode,
  onSelectTag,
  onOpenBrowse,
}: {
  index: TagIndex;
  rootIdx: number;
  selectedTags: Set<number>;
  owned: Set<string>;
  formatMode: 'paper' | 'online';
  onSelectTag: (tagIdx: number) => void;
  onOpenBrowse: (tagIdx: number) => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([rootIdx]));
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [fullCanvas, setFullCanvas] = useState(false);
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

  const layout = useMemo(
    () => buildGraphLayout(index, rootIdx, expanded, formatMode),
    [index, rootIdx, expanded, formatMode]
  );

  const counts = useMemo(() => {
    const m = new Map<number, { owned: number; total: number }>();
    for (const n of layout.nodes) {
      if (!n.isMore && n.tagIdx >= 0 && !m.has(n.tagIdx)) {
        m.set(n.tagIdx, countOwnedForTag(index, n.tagIdx, owned));
      }
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
    const scaleX = 900 / layout.bounds.width;
    const scaleY = 580 / layout.bounds.height;
    setZoom(Math.max(0.45, Math.min(1.25, Number(Math.min(scaleX, scaleY).toFixed(2)))));
    setPan({ x: 0, y: 0 });
  };

  const cx = layout.bounds.minX + layout.bounds.width / 2;
  const cy = layout.bounds.minY + layout.bounds.height / 2;

  return (
    <div className={fullCanvas ? styles.graphWrapExpanded : styles.graphWrap}>
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
          <button type="button" className={styles.hudBtn} aria-pressed={fullCanvas} onClick={() => setFullCanvas((v) => !v)}>
            {fullCanvas ? 'SHRINK' : 'EXPAND'}
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
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="rgba(255,255,255,0.4)" />
          </marker>
          <marker id="tag-arrow-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#e60012" />
          </marker>
        </defs>

        <g transform={`translate(${cx + pan.x}, ${cy + pan.y}) scale(${zoom}) translate(${-cx}, ${-cy})`}>
          {/* Radial / Orbital Edges */}
          {layout.edges.map((e) => {
            const a = layout.byId.get(e.from);
            const b = layout.byId.get(e.to);
            if (!a || !b) return null;
            const p1 = rectAnchor(a, b);
            const p2 = rectAnchor(b, a);
            const hot =
              hoverIdx !== null
                ? e.fromTag === hoverIdx || e.toTag === hoverIdx
                : selectedTags.has(e.fromTag) || selectedTags.has(e.toTag);
            return (
              <line
                key={`${e.from}-${e.to}`}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={hot ? '#e60012' : 'rgba(255,255,255,0.26)'}
                strokeWidth={hot ? 2.2 : 1.4}
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
                  <rect width={NODE_W} height={NODE_H} rx={4} fill="#19191f" stroke="#ffcc00" strokeDasharray="4 3" strokeWidth={1.4} />
                  <text x={NODE_W / 2} y={23} textAnchor="middle" fill="#ffcc00" fontSize="12" fontFamily="Space Mono, monospace">
                    +{n.moreCount} MORE IN BROWSE →
                  </text>
                </g>
              );
            }

            if (n.digitalLabel) {
              return (
                <g
                  key={n.id}
                  data-node={n.id}
                  transform={`translate(${n.x}, ${n.y})`}
                  opacity={formatMode === 'paper' ? 0.42 : 0.85}
                >
                  <title>{n.digitalNote}</title>
                  <rect width={NODE_W} height={NODE_H} rx={4} fill="#121215" stroke="#3a3a46" strokeDasharray="3 3" strokeWidth={1.2} />
                  <circle cx={14} cy={NODE_H / 2} r={4.5} fill="#888894" pointerEvents="none" />
                  <text x={25} y={16} fill="#b5b5b5" fontSize="12" fontWeight="700" fontFamily="Archivo, sans-serif" pointerEvents="none">
                    {n.digitalLabel}
                  </text>
                  <text x={25} y={30} fill="#888894" fontSize="10" fontFamily="Space Mono, monospace" pointerEvents="none">
                    ONLINE / ARENA ONLY
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
                  rx={4}
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
                    <rect width={22} height={24} rx={3} fill={isExp ? '#e60012' : '#212129'} stroke="#3a3a46" strokeWidth={1} />
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
