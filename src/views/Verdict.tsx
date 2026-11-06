import { useEffect, useRef } from 'react';
import type { BracketFit, Readiness } from '../brain/validate';
import type { Why } from '../brain/why';
import { haptic } from '../lib/haptics';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const VERDICT: Record<Readiness['verdict'], string> = { ready: 'READY', almost: 'ALMOST', 'not ready': 'NOT READY', 'not legal': 'NOT LEGAL' };

/** Closes a <details> on a tap outside it or Esc. */
function useOutside() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const out = (e: PointerEvent) => ref.current?.open && !ref.current.contains(e.target as Node) && ref.current.removeAttribute('open');
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && ref.current?.removeAttribute('open');
    document.addEventListener('pointerdown', out);
    document.addEventListener('keydown', esc);
    return () => (document.removeEventListener('pointerdown', out), document.removeEventListener('keydown', esc));
  }, []);
  return ref;
}

/**
 * Build Readiness and Bracket Fit, next to Collection Match (Deck Wizard's three numbers). Logic: brain/validate.ts
 * (readiness, bracketFit); this only shows it. Tap a tile for the checks / the reasons. No scores: counts and verdicts.
 */
export function ReadyTiles({ ready, fit }: { ready: Readiness; fit?: BracketFit }) {
  const r = useOutside();
  const f = useOutside();
  return (
    <div className="vtiles">
      <details className={`vtile ready v-${ready.verdict.replace(' ', '-')}`} ref={r} onToggle={(e) => e.currentTarget.open && haptic('open')}>
        <summary aria-label={`Build readiness: ${ready.verdict}, ${ready.passed} of ${ready.checks.length} checks pass`}>
          <span className="lbl">READINESS</span>
          <b>{VERDICT[ready.verdict]}</b>
          <small>
            {ready.passed}/{ready.checks.length} checks
          </small>
        </summary>
        <div className="vpop" role="dialog" aria-label="Readiness checks">
          <ul>
            {ready.checks.map((c) => (
              <li key={c.key} className={c.ok ? 'ok' : 'no'}>
                <span className="mk" aria-hidden="true">
                  {c.ok ? '✓' : '✕'}
                </span>
                <span>
                  <b>{c.label}</b> {c.value} <small>· target {c.target}</small>
                  <span className="says">{c.says}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </details>
      {fit && (
        <details className={`vtile fit f-${fit.fit}`} ref={f} onToggle={(e) => e.currentTarget.open && haptic('open')}>
          <summary aria-label={`Bracket fit: ${fit.says}`}>
            <span className="lbl">BRACKET FIT</span>
            <b>{fit.fit === 'over' ? `PLAYS ${ROMAN[fit.est]}` : fit.fit === 'under' ? `FITS ${ROMAN[fit.aim]}` : `FITS ${ROMAN[fit.aim]}`}</b>
            <small>{fit.fit === 'over' ? `above ${ROMAN[fit.aim]}` : fit.fit === 'under' ? `could play ${ROMAN[fit.est]}` : 'on target'}</small>
          </summary>
          <div className="vpop" role="dialog" aria-label="Bracket fit">
            <p>{fit.says}</p>
            {fit.over.length > 0 && (
              <ul>
                {fit.over.map((o) => (
                  <li key={o} className="no">
                    <span className="mk" aria-hidden="true">
                      ↑
                    </span>
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

/** "Why this card?": the brain's reasons in words (headline, then parts as "label · source"); no numbers shown. */
export function WhyCard({ why }: { why: Why }) {
  return (
    <div className="whycard" aria-label={`Why ${why.name}`}>
      <p className="wh">{why.headline}</p>
      {why.parts.length > 0 && (
        <ul className="wparts">
          {why.parts.map((p, i) => (
            <li key={i}>
              {p.label}
              {p.source && <small> · {p.source}</small>}
            </li>
          ))}
        </ul>
      )}
      {why.combos.length > 0 && (
        <p className="wcombo">
          Combo with {why.combos.map((c) => `${c.with}${c.allowed ? '' : ' (not allowed at this power)'}`).join(', ')}
        </p>
      )}
      {why.notes.map((n) => (
        <p key={n} className="wnote">
          {n}
        </p>
      ))}
    </div>
  );
}
