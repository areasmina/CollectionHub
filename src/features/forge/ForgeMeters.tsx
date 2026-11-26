import { useEffect, useMemo, useRef, useState } from 'react';
import { deckCombos, nearCombos } from '../../brain/combos';
import { isEarly, type DeckStats, type Role } from '../../lib/deckstats';
import { haptic } from '../../lib/haptics';
import { norm } from '../../lib/names';

const METERS: [Role | 'lands' | 'mv', string][] = [
  ['lands', 'LANDS'],
  ['ramp', 'RAMP'],
  ['draw', 'DRAW'],
  ['removal', 'REMOVAL'],
  ['wipes', 'WIPES'],
  ['mv', 'AVG MV'],
];
export const ROLE_WORD: Record<Role, string> = { ramp: 'ramp', draw: 'draw', removal: 'removal', wipes: 'wipes', tutors: 'tutors' };
export type Range = (r: Role) => [number, number] | undefined;

/** What the deck is short of, in plain words: "draw (2 short)". */
export function shortOf(st: DeckStats, range: Range) {
  return (['draw', 'ramp', 'removal', 'wipes'] as Role[]).flatMap((r) => {
    const rg = range(r);
    return rg && st.roles[r] < rg[0] ? [{ role: r, short: rg[0] - st.roles[r] }] : [];
  });
}

/**
 * ANALYSIS meters for the Forge: lands, ramp, draw, removal, wipes and average mana value.
 */
export function ForgeMeters({
  st,
  range,
  match,
  expanded: controlledExpanded,
  onToggleExpand,
  names,
  isOwned,
}: {
  st: DeckStats;
  range: Range;
  match?: number;
  expanded?: boolean;
  onToggleExpand?: () => void;
  names?: string[];
  isOwned?: (name: string) => boolean;
}) {
  const [localExpanded, setLocalExpanded] = useState(() => {
    try {
      return localStorage.getItem('ch:forge:an_expanded') !== 'false';
    } catch {
      return true;
    }
  });
  const expanded = controlledExpanded !== undefined ? controlledExpanded : localExpanded;
  const toggle = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setLocalExpanded((v) => {
        try {
          localStorage.setItem('ch:forge:an_expanded', String(!v));
        } catch {}
        return !v;
      });
    }
    haptic('tap');
  };

  const now: Record<string, number> = { lands: st.lands, mv: Math.round(st.avgMv * 100) / 100, ...st.roles };
  const prev = useRef<{ v: Record<string, number>; curve: number[] } | null>(null);
  const [delta, setDelta] = useState<{ v: Record<string, number>; curve: Set<number>; at: number }>({ v: {}, curve: new Set(), at: 0 });
  const sig = JSON.stringify([now, st.curve]);
  useEffect(() => {
    const p = prev.current;
    prev.current = { v: now, curve: st.curve };
    if (!p || st.unknown) return;
    const v: Record<string, number> = {};
    for (const k of Object.keys(now)) if (now[k] !== p.v[k]) v[k] = Math.round((now[k] - p.v[k]) * 100) / 100;
    const curve = new Set(st.curve.flatMap((n, i) => (n !== p.curve[i] ? [i] : [])));
    if (Object.keys(v).length || curve.size) setDelta({ v, curve, at: Date.now() });
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const needs = shortOf(st, range);
  const top = Math.max(1, ...st.curve);

  const earlyPlays = st.curve.slice(0, 4).reduce((a, b) => a + b, 0);
  const nonLandTotal = Math.max(1, st.total - st.lands);
  const earlyPct = Math.round((earlyPlays / nonLandTotal) * 100);

  const pipColors = (['W', 'U', 'B', 'R', 'G'] as const).filter((c) => (st.pips?.[c] ?? 0) > 0);
  const totalPips = pipColors.reduce((sum, c) => sum + (st.pips[c] ?? 0), 0);
  const dominantColor = useMemo(() => {
    if (!totalPips || !pipColors.length) return null;
    let max = pipColors[0];
    for (const c of pipColors) {
      if ((st.pips[c] ?? 0) > (st.pips[max] ?? 0)) max = c;
    }
    const colorNames: Record<string, string> = {
      W: 'White',
      U: 'Blue',
      B: 'Black',
      R: 'Red',
      G: 'Green',
    };
    return {
      symbol: max,
      name: colorNames[max] ?? max,
      pct: Math.round(((st.pips[max] ?? 0) / totalPips) * 100),
      count: st.pips[max] ?? 0,
    };
  }, [st.pips, totalPips, pipColors]);

  const typeCounts = [
    ['Creatures', st.groups?.get('Creatures') ?? 0],
    ['Instants', st.groups?.get('Instants') ?? 0],
    ['Sorceries', st.groups?.get('Sorceries') ?? 0],
    ['Artifacts', st.groups?.get('Artifacts') ?? 0],
    ['Enchantments', st.groups?.get('Enchantments') ?? 0],
    ['Planeswalkers', st.groups?.get('Planeswalkers') ?? 0],
    ['Lands', st.lands],
  ].filter(([, count]) => (count as number) > 0) as [string, number][];

  const have = useMemo(() => (names && names.length ? deckCombos(names) : []), [names?.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const near = useMemo(
    () => (names && names.length ? nearCombos(names, new Set()).filter((n) => !isOwned || isOwned(n.add)).slice(0, 3) : []),
    [names?.join('|'), isOwned] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <section className={`fmeters ${expanded ? 'expanded' : 'contracted mini'}`} aria-label="Forge analysis">
      <div className="fmeters-header">
        <h3>
          ANALYSIS
          {match != null && <span className="fmatch">MATCH {match}%</span>}
        </h3>
        <button
          type="button"
          className="fexp-btn corner"
          title={expanded ? 'Contract analysis (compact animated curve)' : 'Expand analysis (veteran MTG breakdown)'}
          aria-label={expanded ? 'Contract analysis' : 'Expand analysis'}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          <span className="fexp-sign" aria-hidden="true">
            {expanded ? '−' : '+'}
          </span>
        </button>
      </div>

      <div
        className={`fcurve${!expanded ? ' mini-curve' : ''}`}
        role="img"
        aria-label={`Mana curve: ${st.curve.map((n, i) => `${i === 7 ? '7+' : i}: ${n}`).join(', ')}`}
        onClick={!expanded ? toggle : undefined}
        style={{ cursor: !expanded ? 'pointer' : undefined }}
        title={!expanded ? 'Tap to expand full analysis' : undefined}
      >
        {st.curve.map((n, i) => (
          <span key={i} className={delta.curve.has(i) ? 'lit' : ''} data-at={delta.curve.has(i) ? delta.at : undefined}>
            <i style={{ height: `${Math.round((n / top) * 100)}%` }} />
            <small>{i === 7 ? '7+' : i}</small>
          </span>
        ))}
      </div>

      {!expanded ? (
        <div className="fm-mini-body" onClick={toggle} title="Tap to expand full analysis" style={{ cursor: 'pointer' }}>
          <div className="fm-mini-row">
            <span className="fm-mini-chip">
              <b>{st.lands}</b> lands
            </span>
            <span className="fm-mini-chip">
              <b>{st.avgMv.toFixed(2)}</b> avg
            </span>
          </div>
          <div className="fm-mini-dots" title="Role health: Lands · Ramp · Draw · Removal · Wipes">
            {METERS.map(([k, label]) => {
              const rg = k === 'lands' ? ([33, 38] as [number, number]) : k === 'mv' ? undefined : range(k);
              const v = now[k];
              const tone = !rg ? '' : v < rg[0] ? 'low' : v > rg[1] ? 'high' : 'ok';
              return <span key={k} className={`fm-dot ${tone}`} title={`${label}: ${v}${rg ? ` (target ${rg[0]}–${rg[1]})` : ''}`} />;
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="fm-velocity-bar">
            <span>
              <b>{st.avgMv.toFixed(2)}</b> non-land MV
            </span>
            <span>
              <b>{earlyPlays}</b> early plays (CMC ≤ 3, {earlyPct}%)
            </span>
          </div>

          <ul>
            {METERS.map(([k, label]) => {
              const rg = k === 'lands' ? ([33, 38] as [number, number]) : k === 'mv' ? undefined : range(k);
              const v = now[k];
              const d = delta.v[k];
              const fill = k === 'mv' ? Math.min(1, v / 5) : Math.min(1, v / Math.max(1, (rg?.[1] ?? v) * 1.25));
              const tone = !rg ? '' : v < rg[0] ? ' low' : v > rg[1] ? ' high' : ' ok';
              return (
                <li key={k} className={`fm${tone}`} title={rg ? `${label.toLowerCase()}: ${v} (usual ${rg[0]}–${rg[1]})` : `${label.toLowerCase()}: ${v}`}>
                  <span className="fl">{label}</span>
                  <span className="fbar" aria-hidden="true">
                    <i style={{ width: `${Math.round(fill * 100)}%` }} />
                  </span>
                  <b>{k === 'mv' ? v.toFixed(2) : v}</b>
                  {d ? (
                    <span key={delta.at} className={`fdelta${d > 0 ? ' up' : ' down'}`}>
                      {d > 0 ? '+' : '−'}
                      {k === 'mv' ? Math.abs(d).toFixed(2) : Math.abs(d)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {totalPips > 0 && (
            <div className="fm-pips-sec">
              <div className="fm-sec-title">MANA PIP BALANCE</div>
              <div className="fm-pips-track">
                {pipColors.map((c) => {
                  const pct = Math.round(((st.pips[c] ?? 0) / totalPips) * 100);
                  return <span key={c} className={`fm-pip-bar col-${c}`} style={{ width: `${pct}%` }} title={`${c}: ${st.pips[c]} pips (${pct}%)`} />;
                })}
              </div>
              <div className="fm-pips-legend">
                {pipColors.map((c) => (
                  <span key={c} className={`fm-pip-chip col-${c}`}>
                    <b>{c}</b> {Math.round(((st.pips[c] ?? 0) / totalPips) * 100)}% <small>({st.pips[c]})</small>
                  </span>
                ))}
              </div>
              {dominantColor && (
                <p className="fm-pip-advice">
                  <b>{dominantColor.name}</b> is dominant ({dominantColor.pct}% of color symbols).
                </p>
              )}
            </div>
          )}

          {typeCounts.length > 0 && (
            <div className="fm-types-sec">
              <div className="fm-sec-title">TYPE BREAKDOWN</div>
              <div className="fm-type-chips">
                {typeCounts.map(([t, n]) => (
                  <span key={t} className="fm-type-chip">
                    <b>{n}</b> {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(have.length > 0 || near.length > 0) && (
            <div className="fm-combo-sec" aria-live="polite">
              <div className="fm-sec-title">COMBOS</div>
              {have.length > 0 ? (
                <ul className="fm-combos">
                  {have.slice(0, 3).map((c) => (
                    <li key={c.id} className={isEarly(c) ? 'early' : ''}>
                      <span className="fm-combo-cards">{c.cards.join(' + ')}</span>
                      <small>{isEarly(c) ? `early · ${c.mv} mana` : `${c.mv} mana`}</small>
                    </li>
                  ))}
                  {have.length > 3 && <li className="fm-combo-more">+{have.length - 3} more in this deck</li>}
                </ul>
              ) : (
                <p className="fm-combo-none">No two-card combo finished yet.</p>
              )}
              {near.length > 0 && (
                <>
                  <div className="fm-sec-title sub">ONE CARD AWAY · FROM YOUR BINDER</div>
                  <ul className="fm-combos near">
                    {near.map((n) => (
                      <li key={n.combo.id}>
                        <span className="fm-combo-cards">
                          <b>{n.add}</b> + {n.combo.cards.find((x) => norm(x) !== norm(n.add)) ?? ''}
                        </span>
                        <small>{isEarly(n.combo) ? 'early' : `${n.combo.mv} mana`}</small>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {needs.length > 0 && (
            <p className="fneeds" role="status">
              NEEDS: {needs.map((n) => `${n.short} more ${ROLE_WORD[n.role]}`).join(' · ')}
            </p>
          )}
        </>
      )}
    </section>
  );
}
