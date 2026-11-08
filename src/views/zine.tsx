// "Midnight Override" zine kit: ransom titles, marker doodles, page decor, pips (design/midnight-override-spec.md).
import { memo, useEffect, useMemo, useRef } from 'react';

const frac = (x: number) => x - Math.floor(x);

/** Ransom-note title ("What can I build?" reference): seeded cut-out letters, cream ~62% / black ~38%, never two black in a row,
 * halftone dots fading in from one edge of each tile. */
/** `swap`: words (by index) drawn as something else, e.g. the eye standing in for "I" in WHAT CAN I BUILD?. */
export function Ransom({ text, size: wanted, seed, breakWords, swap }: { text: string; size: number; seed: number; breakWords?: boolean; swap?: Record<number, React.ReactNode> }) {
  // Unless words may break (commander banner), shrink until the longest word fits the screen (each tile is ~1× size wide).
  // Breaking mid-word reads well on wide screens only; phones keep whole words.
  breakWords = breakWords && window.innerWidth > 700;
  const longest = breakWords ? 9 : Math.max(...text.split(' ').map((w) => w.length));
  const size = Math.max(18, Math.min(wanted, Math.floor((window.innerWidth - 64) / (longest * 1.02))));
  const words = useMemo(() => {
    const rnd = (n: number) => frac(Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453);
    // Halftone dots fading in from one edge of each tile (authentic print artifact)
    const tone = (deg: number, base: string, dot: string) =>
      `linear-gradient(${deg}deg, ${base} 48%, transparent 92%), radial-gradient(${dot} 1.1px, transparent 1.7px) 0 0/4px 4px, ${base}`;
    const papers: Record<string, { fg: string; bg: (d: number) => string; boxShadow: string }> = {
      newsprint: {
        fg: '#111113',
        bg: (d: number) => tone(d, '#F4ECD8', 'rgba(0,0,0,.55)'),
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.22), inset 0 -2px 3px rgba(0,0,0,.15)',
      },
      white: {
        fg: '#0a0a0c',
        bg: (d: number) => `linear-gradient(${d}deg, #FFFFFF 65%, #F0EFEA 100%)`,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.25), inset 0 -2px 2px rgba(0,0,0,.1)',
      },
      yellow: {
        fg: '#161517',
        bg: (d: number) => tone(d, '#FFF09E', 'rgba(80,50,0,.45)'),
        boxShadow: 'inset 0 0 0 1px rgba(110,75,0,.26), inset 0 -2px 3px rgba(0,0,0,.14)',
      },
      black: {
        fg: '#F8F6EE',
        bg: (d: number) => tone(d, '#101012', 'rgba(255,255,255,.32)'),
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.22), inset 0 -2px 3px rgba(0,0,0,.55)',
      },
      kraft: {
        fg: '#1C150E',
        bg: (d: number) => tone(d, '#D6B48D', 'rgba(40,20,0,.42)'),
        boxShadow: 'inset 0 0 0 1px rgba(60,30,0,.26), inset 0 -2px 3px rgba(0,0,0,.16)',
      },
      red: {
        fg: '#FFFFFF',
        bg: (d: number) => `linear-gradient(${d}deg, #E60012 40%, #B8000E 100%)`,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.28), inset 0 -2px 3px rgba(0,0,0,.35)',
      },
    };
    const paperKeys = ['newsprint', 'white', 'yellow', 'black', 'kraft', 'red'] as const;

    const fonts: { style: React.CSSProperties; scale?: number }[] = [
      { style: { fontFamily: "'Alfa Slab One', serif", fontWeight: 400 }, scale: 0.98 },
      { style: { fontFamily: "'Anton', sans-serif", fontWeight: 900, letterSpacing: '0.02em' }, scale: 1.05 },
      { style: { fontFamily: "'Archivo Black', sans-serif", fontWeight: 900 }, scale: 0.96 },
      { style: { fontFamily: "'Black Ops One', sans-serif", fontWeight: 400 }, scale: 0.96 },
      { style: { fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 900 }, scale: 1.02 },
      { style: { fontFamily: "'Special Elite', monospace", fontWeight: 400, letterSpacing: '-0.02em' }, scale: 1.08 },
      { style: { fontFamily: "'Space Mono', monospace", fontWeight: 700 }, scale: 0.94 },
      { style: { fontFamily: "'Shippori Mincho B1', serif", fontWeight: 800 }, scale: 0.96 },
    ];
    const clips = [
      'polygon(1% 2%, 99% 0, 100% 97%, 0 100%)',
      'polygon(0 0, 98% 3%, 100% 100%, 2% 97%)',
      'polygon(2% 0, 100% 2%, 98% 98%, 0 100%)',
      'polygon(0 3%, 100% 0, 99% 100%, 1% 98%)',
      'polygon(3% 1%, 97% 3%, 100% 96%, 1% 99%)',
      'polygon(0 2%, 100% 0, 98% 100%, 2% 97%)',
      'polygon(2% 3%, 99% 1%, 97% 99%, 0 96%)',
      'polygon(1% 0, 98% 2%, 100% 98%, 3% 100%)',
    ];
    let last = '';
    let k = 0;
    return text.split(' ').map((w) =>
      w.split('').map((ch) => {
        k++;
        const r = rnd(k);
        let pk: typeof paperKeys[number];
        if (r < 0.28) pk = 'newsprint';
        else if (r < 0.52) pk = 'white';
        else if (r < 0.72) pk = 'yellow';
        else if (r < 0.88) pk = 'black';
        else if (r < 0.94) pk = 'kraft';
        else pk = 'red';

        // Never two identical papers in a row for maximum movie ransom collage aesthetic
        if (pk === last) {
          const others = paperKeys.filter((p) => p !== last);
          pk = others[Math.floor(rnd(k + 600) * others.length)];
        }
        last = pk;
        const p = papers[pk];
        const fontDef = fonts[Math.floor(rnd(k + 400) * fonts.length)];
        const fontScale = fontDef.scale ?? 1;

        const outer: React.CSSProperties = {
          margin: `0 ${Math.max(1, Math.round(size * 0.035))}px`,
          transform: `rotate(${(rnd(k + 100) * 9 - 4.5).toFixed(1)}deg) translateY(${Math.round(rnd(k + 150) * 7 - 3.5)}px)`,
          filter: 'drop-shadow(2px 3px 0 rgba(0,0,0,.85))',
        };
        const inner: React.CSSProperties = {
          ...fontDef.style,
          minWidth: Math.round(size * 0.62),
          fontSize: Math.round(size * (0.88 + rnd(k + 50) * 0.16) * fontScale),
          padding: `${Math.round(size * (0.08 + rnd(k + 250) * 0.05))}px ${Math.round(size * (0.13 + rnd(k + 200) * 0.06))}px`,
          background: p.bg(Math.round(rnd(k + 450) * 360)),
          color: p.fg,
          clipPath: clips[Math.floor(rnd(k + 350) * clips.length)],
          boxShadow: p.boxShadow,
          animationDelay: `-${(rnd(k + 300) * 2.4).toFixed(2)}s`,
        };
        return { ch, outer, inner };
      }),
    );
  }, [text, size, seed]);
  return (
    <div className={`ransom${breakWords ? ' loose' : ''}`} aria-hidden="true" style={{ rowGap: Math.round(size * 0.16), columnGap: breakWords ? 0 : Math.round(size * 0.4), '--wg': `${Math.round(size * 0.32)}px` } as React.CSSProperties}>
      {words.map((w, i) =>
        swap?.[i] ? (
          <span key={i} className="rword rslot" style={{ height: Math.round(size * 1.45) }}>
            {swap[i]}
          </span>
        ) : (
        <span key={i} className="rword">
          {w.map((l, j) => (
            <span key={j} style={l.outer}>
              <span className="jit" style={l.inner}>
                {l.ch}
              </span>
            </span>
          ))}
        </span>
        ),
      )}
    </div>
  );
}

/** Ransom title on the red halftone slash; the heading carries the plain words. */
export function Title({ text, label, size, seed, as: H = 'h1', className = '', swap, behind, after }: { text: string; label: string; size: number; seed: number; as?: 'h1' | 'h2'; className?: string; swap?: Record<number, React.ReactNode>; behind?: React.ReactNode; after?: React.ReactNode }) {
  return (
    <div className={`titlewrap ${className}`}>
      <div className="ht slash" aria-hidden="true" />
      {behind}
      <H aria-label={label} className="ztitle">
        <Ransom text={text} size={size} seed={seed} swap={swap} />
      </H>
      {after}
    </div>
  );
}

// Original marker doodles (stroke + fill paths, 120×90).
const LIB = [
  { s: 'M14 60 L20 24 L38 46 L52 16 L66 46 L86 22 L90 60 Z M10 68 C40 62 70 72 96 64 M30 68 L30 84 M73 66 L74 78', f: 'M52 32 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0' },
  { s: 'M30 50 C22 18 88 14 82 48 C82 60 74 62 72 70 L38 70 C36 62 30 60 30 50 Z M42 38 L52 48 M52 38 L42 48 M62 38 L72 48 M72 38 L62 48 M45 70 L45 79 M53 70 L53 79 M61 70 L61 79 M68 70 L68 78', f: 'M56 53 L52 61 L60 61 Z' },
  { s: 'M58 8 L66 34 L94 30 L72 48 L84 76 L58 58 L32 76 L44 48 L22 30 L50 34 Z M104 14 L100 46 M112 16 L108 44', f: 'M100 58 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 M108 56 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0' },
  { s: 'M8 72 C28 18 60 82 70 40 C76 12 48 14 56 36 C62 60 96 56 104 22 M90 26 L104 20 L108 36', f: '' },
  { s: 'M12 46 C40 14 80 14 108 46 C80 76 40 76 12 46 Z M30 28 L22 14 M48 20 L46 4 M72 20 L76 4 M90 28 L100 14', f: 'M60 46 m-13 0 a13 13 0 1 0 26 0 a13 13 0 1 0 -26 0' },
  { s: 'M8 54 L18 18 L28 52 L36 20 C52 16 52 38 38 38 L54 56 M60 22 C78 16 80 54 62 54 C52 54 54 30 68 30 M84 18 L96 56 L108 18 M4 70 C40 60 80 78 116 62 M106 56 L116 62 L108 72 M28 52 L28 66', f: '' },
  { s: 'M64 6 L36 48 L58 48 L44 84 L88 34 L62 34 L80 6 Z M22 20 L10 14 M100 64 L112 72', f: '' },
  { s: 'M40 52 L41 76 M72 60 L72 70', f: 'M40 40 m-11 0 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0 M66 28 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 M72 54 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 M22 62 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 M90 38 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 M54 70 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M100 22 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0' },
  { s: 'M30 22 C20 50 26 80 58 82 C90 82 96 50 88 22 C70 32 46 32 30 22 Z M30 22 L22 4 L40 16 L46 0 L58 14 L70 0 L74 16 L96 6 L88 22 M38 64 C50 74 66 74 80 64', f: 'M44 46 m-8 0 a8 10 0 1 0 16 0 a8 10 0 1 0 -16 0 M74 46 m-8 0 a8 10 0 1 0 16 0 a8 10 0 1 0 -16 0' },
  { s: 'M20 70 C20 30 40 14 60 14 C80 14 100 30 100 70 M20 70 L100 70 M34 70 L34 50 M60 70 L60 40 M86 70 L86 50 M12 80 C44 74 76 86 108 78', f: '' },
  { s: 'M60 10 L60 80 M25 45 L95 45 M35 20 L85 70 M85 20 L35 70', f: 'M60 45 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0' },
];
const srnd = (n: number) => frac(Math.sin(n * 91.345 + 7.77) * 24634.6345);
const DARK = ['#E60012', '#E60012', '#F1EBDC', '#FFCC00', '#E60012'];
const PAPER = ['#E60012', '#0A0A0A', '#E60012', '#0A0A0A'];

function Doodle({ n, spot, big = false, paper = false }: { n: number; spot: [number, number]; big?: boolean; paper?: boolean }) {
  const g = LIB[Math.floor(srnd(n) * LIB.length)];
  const inks = paper ? PAPER : DARK;
  const c = inks[Math.floor(srnd(n + 2) * inks.length)];
  const w = Math.round((big ? 170 : 72) + srnd(n + 1) * (big ? 140 : 56));
  return (
    <svg
      aria-hidden="true"
      className="doodle"
      viewBox="0 0 120 90"
      width={w}
      height={Math.round(w * 0.75)}
      style={{
        zIndex: big ? 0 : 3,
        left: `${Math.round(spot[0] + srnd(n + 6) * 10 - 5)}%`,
        top: `${Math.round(spot[1] + srnd(n + 7) * 8 - 4)}%`,
        transform: `rotate(${Math.round(srnd(n + 4) * 60 - 30)}deg) scaleX(${srnd(n + 5) < 0.5 ? -1 : 1})`,
        opacity: big ? +(0.55 + srnd(n + 8) * 0.3).toFixed(2) : 1,
      }}
    >
      <path d={g.f || 'M0 0'} fill={c} stroke={c} strokeWidth="2" />
      <path d={g.s} fill="none" stroke={c} strokeWidth={(3 + srnd(n + 3) * 3).toFixed(1)} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 0–count doodles stuck on an element (it needs position: relative). */
export function Doodles({ n, count, spots, paper }: { n: number; count: number; spots: [number, number][]; paper?: boolean }) {
  return (
    <>
      {Array.from({ length: count }, (_, d) => (
        <Doodle key={d} n={n + d * 13} spot={spots[Math.floor(srnd(n + d * 5 + 11) * spots.length)]} paper={paper} />
      ))}
    </>
  );
}

/** Card doodles chosen from the card index: 0–2 per card. */
// Spots sit over the card art only: never on the name, the tag or the numbers.
export function CardDoodles({ i }: { i: number }) {
  const n = (i + 1) * 37;
  const count = srnd(n) < 0.25 ? 0 : srnd(n + 9) < 0.7 ? 1 : 2;
  return <Doodles n={n} count={count} spots={[[52, 30], [-8, 30], [58, 44], [-10, 46], [6, 20], [62, 18]]} />;
}

/** Page background: speed-line rays, light streaks, torn red halftone sheet with a cream edge, five big doodles. */
export function PageDecor({ seed, rays, sheet }: { seed: number; rays: string; sheet: { side: 'left' | 'right'; top: number; rot: number } }) {
  const pos = sheet.side === 'right' ? { right: -60 } : { left: -260 };
  return (
    <div className="decor" aria-hidden="true">
      <div className="rays" style={{ background: `repeating-conic-gradient(from 0deg at ${rays}, rgba(255,255,255,.12) 0deg 2.5deg, transparent 2.5deg 11deg)` }} />
      <div className="streak s1" style={{ top: sheet.top - 40 }} />
      <div className="streak s2" style={{ top: sheet.top + 30 }} />
      <div className="sheet cream" style={{ ...pos, top: sheet.top, transform: `rotate(${sheet.rot}deg)` }} />
      <div className="sheet ht red" style={{ ...pos, top: sheet.top + 12, transform: `rotate(${sheet.rot}deg)` }} />
      {([[2, 8], [58, 12], [86, 34], [-2, 56], [80, 76]] as [number, number][]).map((sp, i) => (
        <Doodle key={i} n={seed + i * 37} spot={sp} big />
      ))}
    </div>
  );
}

/** SVG filters used by the zine look (rough/worn edges, xerox grain, page grain) + the fixed grain overlay. */
export function ZineDefs() {
  return (
    <>
      <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute' }}>
        <filter id="rough">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves={2} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="5" />
        </filter>
        <filter id="worn">
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves={2} result="w" />
          <feDisplacementMap in="SourceGraphic" in2="w" scale="6" />
        </filter>
        <filter id="xgrain">
          <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves={1} stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.35" />
        </filter>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <filter id="venom-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </svg>
      <svg className="grainlayer" aria-hidden="true" width="100%" height="100%">
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </>
  );
}

/** Black speckle grain over a xerox image. */
export const Xgrain = () => (
  <svg className="xg" aria-hidden="true" width="100%" height="100%">
    <rect width="100%" height="100%" filter="url(#xgrain)" />
  </svg>
);

// Solid, crisp tiles (no worn filter, which blurred them): deep mana colours, white letters, cream frame.
const PIP: Record<string, string> = { W: '#E9DDB5', U: '#3F6FC6', B: '#2A2A30', R: '#B5463A', G: '#2F7D4A', C: '#8A8A8A' };
export const Pips = ({ ci, size = 20 }: { ci: string[]; size?: number }) => (
  <span className="pips" aria-label={ci.length ? `Colours ${ci.join('')}` : 'Colourless'}>
    {(ci.length ? ci : ['C']).map((c) => (
      <span key={c} className="pip" style={{ width: size, height: size, fontSize: Math.round(size * 0.5), background: PIP[c] ?? '#8A8A8A', color: c === 'W' ? '#1A1A1A' : '#FFFFFF' }}>
        {c}
      </span>
    ))}
  </span>
);

/** Ownership colour: red at 0%, yellow around 50%, green at 100%. */
export const ownColour = (pct: number) => `hsl(${Math.round(Math.max(0, Math.min(100, pct)) * 1.25)}, 78%, 46%)`;

/** Rising skewed bar (12 steps) filled to pct, greener as it fills ("READY TO SLEEVE" reference). */
export const RiseBars = ({ pct }: { pct: number }) => (
  <span className="rise" aria-hidden="true" style={{ '--own': ownColour(pct) } as React.CSSProperties}>
    {Array.from({ length: 12 }, (_, b) => (
      <span key={b} className={(b + 1) / 12 <= pct / 100 + 0.04 ? 'on' : ''} style={{ height: 6 + b }} />
    ))}
  </span>
);
export const Tape = ({ style }: { style: React.CSSProperties }) => <span aria-hidden="true" className="tape" style={style} />;


type Orb = { el: React.ReactNode; ring: 0 | 1; at: number; size: number; twinkle?: boolean };

/** Discover header art in the owner's style: a flaming eye over a surreal blue-purple mountainscape. Everything else
 *  (the owner's cherub and devil engravings, moon, hearts, stars, skulls, a card) orbits it on two tilted rings in 3D:
 *  farther items shrink, dim and pass behind the fire, nearer ones grow and pass in front with a shadow. Positions
 *  are set per frame on the DOM (no re-render); fire, blink, iris and twinkles are CSS (styles.css .eyedoodle).
 *  With reduced motion everything holds still. Decorative. */
export const EyeDoodle = memo(function EyeDoodle({ bare = false }: { bare?: boolean }) {
  const ink = '#1c120c';
  const red = '#c9402a';
  const orange = '#e58a2b';
  const yellow = '#f2c63e';
  const cream = '#f3e6c9';
  const lid = '#a8231a'; // eye lids and lashes, red like the reference
  const iris = '#4f86c0';
  const cx = 180;
  const cy = 134;
  const tongues = (r1: number, rLong: number, rShort: number, n: number, rot: number, wob: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = ((i / n) * 360 + rot) * (Math.PI / 180);
      const r2 = (i % 2 ? rShort : rLong) + Math.sin(i * 2.3 + wob) * 6;
      const w = (Math.PI / n) * 1.05;
      const pt = (ang: number, r: number) => `${(cx + Math.cos(ang) * r).toFixed(1)} ${(cy + Math.sin(ang) * r * 0.86).toFixed(1)}`;
      return `M${pt(a - w, r1)} C${pt(a - w * 0.6, (r1 + r2) * 0.55)} ${pt(a - w * 0.3, r2 * 0.9)} ${pt(a + w * (0.15 + 0.15 * Math.sin(wob + i)), r2)} C${pt(a + w * 0.1, r2 * 0.8)} ${pt(a + w * 0.7, (r1 + r2) * 0.5)} ${pt(a + w, r1)}Z`;
    }).join(' ');
  const fire = (f: number) => (
    <g key={f} className={`ef f${f}`}>
      <path d={tongues(36, 76, 60, 20, f * 5, f * 1.7)} fill={red} strokeWidth="2.4" />
      <path d={tongues(36, 64, 52, 20, 9 + f * 4, f * 2.1 + 1)} fill={orange} strokeWidth="2" />
      <path d={tongues(36, 52, 44, 20, f * 6, f * 2.9 + 2)} fill={yellow} strokeWidth="1.8" />
    </g>
  );
  const star = (r: number) => `M0 ${-r} Q${r * 0.15} ${-r * 0.15} ${r} 0 Q${r * 0.15} ${r * 0.15} 0 ${r} Q${-r * 0.15} ${r * 0.15} ${-r} 0 Q${-r * 0.15} ${-r * 0.15} 0 ${-r}Z`;
  const skull = (
    <g>
      <path d="M-11 2 C-11 -14 11 -14 11 2 C11 6 8 7 7 9 L7 13 L-7 13 L-7 9 C-8 7 -11 6 -11 2Z" fill={cream} />
      <circle cx="-4.5" cy="1" r="3.4" fill={ink} />
      <circle cx="4.5" cy="1" r="3.4" fill={ink} />
      <path d="M0 5 l-1.6 3 h3.2Z" fill={ink} strokeWidth="1" />
      <path d="M-3.5 10 v3 M0 10 v3 M3.5 10 v3" strokeWidth="1.2" />
    </g>
  );
  const heart = (
    <g>
      <path d="M-6 -8 C-10 -15 -5 -20 -2 -23 C-3 -17 1 -15 1 -11 C3 -17 6 -20 9 -22 C8 -16 10 -12 8 -7Z" fill={orange} />
      <path d="M0 13 C-7 7 -16 1 -14 -6 C-13 -12 -4 -13 0 -6 C4 -13 13 -12 14 -6 C16 1 7 7 0 13Z" fill={red} />
      <path d="M-8 -5 C-10 -2 -9 1 -7 3" fill="none" stroke={cream} strokeWidth="1.8" />
    </g>
  );
  const orbs: Orb[] = [
    { ring: 0, at: 0, size: 1, el: <image href="/cherub.png" x="-36" y="-38" width="72" height="75" /> },
    { ring: 0, at: 180, size: 1, el: <image href="/imp.png" x="-38" y="-37" width="76" height="73" /> },
    { ring: 0, at: 60, size: 1, el: <path d="M6 -15 A16 16 0 1 0 6 15 A18 18 0 0 1 6 -15Z" fill={yellow} /> },
    { ring: 0, at: 120, size: 1, el: <image href="/chaos-heart.png" x="-19" y="-26" width="38" height="46" /> },
    { ring: 0, at: 240, size: 0.9, el: skull },
    { ring: 0, at: 300, size: 0.95, el: <g transform="rotate(-10)"><rect x="-10" y="-14" width="20" height="28" rx="3" fill={cream} /><rect x="-6" y="-10" width="12" height="10" fill={red} /><path d="M-6 4 h12 M-6 8 h9" strokeWidth="1.4" /></g> },
    { ring: 1, at: 20, size: 0.8, twinkle: true, el: <path d={star(10)} fill={yellow} /> },
    { ring: 1, at: 80, size: 0.7, el: skull },
    { ring: 1, at: 140, size: 0.7, twinkle: true, el: <path d={star(8)} fill={cream} /> },
    { ring: 1, at: 200, size: 0.75, twinkle: true, el: <g><path d={star(9)} fill={yellow} /><circle r="2" fill={cream} stroke="none" /></g> },
    { ring: 1, at: 260, size: 0.6, el: heart },
    { ring: 1, at: 320, size: 0.65, twinkle: true, el: <path d={star(7)} fill={yellow} /> },
  ];
  // ring 0: wide, slow; ring 1: tighter, tipped the other way, faster and counter-rotating
  const RINGS = [
    { rx: 136, ry: 46, tip: -8, period: 46000, dir: 1 },
    { rx: 104, ry: 38, tip: 14, period: 30000, dir: -1 },
  ];
  const back = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const irisRef = useRef<SVGGElement>(null);
  // The iris follows the mouse while it moves; after 3 s without movement (and on touch) it roams on its own.
  useEffect(() => {
    const svg = svgRef.current;
    const ir = irisRef.current;
    if (!svg || !ir) return;
    let idle = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const b = svg.getBoundingClientRect();
      const ex = b.left + (cx / 360) * b.width;
      const ey = b.top + ((cy - 42) / 214) * b.height;
      const dx = e.clientX - ex;
      const dy = e.clientY - ey;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 260);
      ir.style.transform = `translate(${((dx / d) * 16 * k).toFixed(1)}px, ${((dy / d) * 7 * k).toFixed(1)}px)`;
      svg.classList.add('tracking');
      clearTimeout(idle);
      idle = window.setTimeout(() => (svg.classList.remove('tracking'), (ir.style.transform = '')), 3000);
    };
    addEventListener('pointermove', move, { passive: true });
    return () => (removeEventListener('pointermove', move), clearTimeout(idle));
  }, []);
  const front = useRef<SVGGElement>(null);
  const nodes = useRef<(SVGGElement | null)[]>([]);
  useEffect(() => {
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = 0;
    const place = (t: number) => {
      orbs.forEach((o, i) => {
        const g = nodes.current[i];
        if (!g) return;
        const r = RINGS[o.ring];
        const th = ((o.at + (r.dir * 360 * t) / r.period) * Math.PI) / 180;
        const depth = Math.sin(th); // -1 far … 1 near
        const tip = (r.tip * Math.PI) / 180;
        const x0 = Math.cos(th) * r.rx;
        const y0 = depth * r.ry;
        const x = cx + x0 * Math.cos(tip) - y0 * Math.sin(tip);
        const y = cy + x0 * Math.sin(tip) + y0 * Math.cos(tip);
        const sc = o.size * (0.72 + 0.28 * (depth + 1) / 2 + 0.12 * depth);
        g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${sc.toFixed(3)})`);
        g.style.opacity = String((0.55 + 0.45 * (depth + 1) / 2).toFixed(2));
        const want = depth < 0 ? back.current : front.current;
        if (want && g.parentNode !== want) want.appendChild(g);
      });
      // nearer items drawn last within each half
      for (const box of [back.current, front.current])
        if (box) [...box.children].sort((a, b) => Number((a as SVGGElement).dataset.d ?? 0) - Number((b as SVGGElement).dataset.d ?? 0)).forEach((c) => box.appendChild(c));
    };
    const tick = (now: number) => {
      if (now - last > 33) {
        last = now;
        orbs.forEach((o, i) => {
          const r = RINGS[o.ring];
          const g = nodes.current[i];
          if (g) g.dataset.d = Math.sin(((o.at + (r.dir * 360 * now) / r.period) * Math.PI) / 180).toFixed(3);
        });
        place(now);
      }
      raf = requestAnimationFrame(tick);
    };
    if (still) {
      orbs.forEach((o, i) => nodes.current[i] && (nodes.current[i]!.dataset.d = Math.sin((o.at * Math.PI) / 180).toFixed(3)));
      place(0);
    } else raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <svg ref={svgRef} className="eyedoodle" viewBox="0 42 360 214" aria-hidden="true">
      <defs>
        <filter id="eyeink" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={7} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3" />
        </filter>
        {/* print wear: knock random speckles out of the artwork, like a worn screen print */}
        <filter id="distress" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={11} result="n" />
          <feColorMatrix in="n" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -9 7.4" result="holes" />
          <feComposite in="SourceGraphic" in2="holes" operator="in" />
        </filter>
        <filter id="grit">
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves={3} seed={5} />
          <feColorMatrix values="0 0 0 0 0.05  0 0 0 0 0.04  0 0 0 0 0.03  0 0 0 -1.4 0.9" />
        </filter>
        <radialGradient id="eyefade" cx="50%" cy="60%" r="52%">
          <stop offset="35%" stopColor="#fff" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
        <mask id="eyemask">
          <rect width="360" height="268" fill="url(#eyefade)" />
        </mask>
        <linearGradient id="skyfade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" />
          <stop offset="0.18" stopColor="#fff" />
          <stop offset="0.82" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id="skymask">
          <rect x="0" y="0" width="360" height="268" fill="url(#skyfade)" />
        </mask>
        <clipPath id="eyeclip">
          <path d={`M${cx - 46} ${cy} Q${cx} ${cy - 40} ${cx + 46} ${cy} Q${cx} ${cy + 40} ${cx - 46} ${cy}Z`} />
        </clipPath>
      </defs>
      <g filter="url(#distress)">

      {/* `bare` (phone title backdrop): no sky or mountains, so no dark block behind the eye */}
      {!bare && (
        <>
      {/* sky: drifting clouds */}
      <g mask="url(#skymask)" filter="url(#eyeink)" stroke={ink} strokeLinejoin="round" strokeLinecap="round">
        {/* drifting clouds */}
        <g className="clouds" fill="#3a3330" opacity="0.6" strokeWidth="1.4">
          <path d="M40 92 q6 -12 18 -8 q8 -12 22 -4 q14 -2 14 10 q8 4 2 10 h-58 q-8 -4 2 -8Z" />
          <path d="M250 74 q6 -10 16 -6 q8 -10 20 -2 q12 0 12 9 q6 4 0 8 h-50 q-6 -4 2 -9Z" />
          <path d="M150 64 q4 -8 12 -5 q6 -8 15 -2 q9 0 9 7 q5 3 0 6 h-38 q-5 -3 2 -6Z" />
        </g>
      </g>

      {/* surreal mountainscape in three ridges: far (pale lilac, soft), middle (violet), near (deep blue, bold) */}
      <g mask="url(#eyemask)" filter="url(#eyeink)" stroke={ink} strokeLinejoin="round" strokeLinecap="round">
        <path d="M20 200 L70 150 L96 162 L132 112 L152 98 L172 116 L196 104 L222 92 L248 120 L276 108 L312 146 L344 170 L360 178 L360 268 L0 268 L0 208Z" fill="#2a2522" opacity="0.7" strokeWidth="1.4" />
        <path d="M152 98 l-6 10 l7 -3 l5 6 l2 -9Z M222 92 l-7 12 l8 -4 l6 6 l1 -10Z" fill={cream} opacity="0.35" stroke="none" />
        {/* volcano: cone, glowing crater, lava runs, smoke puffing in steps */}
        <g>
          <path d="M226 200 L262 128 L270 124 L280 126 L288 130 L328 200Z" fill="#2a2120" strokeWidth="2" />
          <path d="M262 128 Q275 120 288 130 Q276 134 262 128Z" fill={orange} strokeWidth="1.6" />
          <path d="M270 128 q-6 22 -12 34 q-4 10 -10 18 M280 130 q4 18 8 30 q4 12 2 22 M275 130 q0 20 -2 40" fill="none" stroke={red} strokeWidth="2.6" />
          <path d="M268 140 l-10 26 M286 142 l12 30 M244 176 l-6 18 M306 172 l8 20" fill="none" stroke="#2a1a30" strokeWidth="1.2" />
          <g className="smoke" fill="#5a524c" opacity="0.65" strokeWidth="1.4">
            <circle className="puff p0" cx="276" cy="112" r="7" />
            <circle className="puff p1" cx="270" cy="98" r="9" />
            <circle className="puff p2" cx="280" cy="82" r="11" />
          </g>
          <path className="ember" d="M275 120 l-2 -6 l3 2 l1 -6 l2 6 l2 -3 l-1 7Z" fill={yellow} strokeWidth="1" />
        </g>
        <path d="M0 214 L40 182 L66 192 L104 146 L124 158 L150 136 L176 170 L206 160 L238 132 L262 146 L292 128 L330 172 L360 184 L360 268 L0 268Z" fill="#1f1a18" opacity="0.85" strokeWidth="1.8" />
        <path d="M104 146 l-7 12 l8 -4 l6 7 l2 -11Z M292 128 l-8 13 l9 -4 l6 7 l1 -12Z" fill={cream} opacity="0.5" stroke="none" />
        <g fill="none" stroke="#c9402a" strokeWidth="1.1" opacity="0.45">
          <path d="M112 158 l-8 22 M122 164 l-2 20 M246 146 l-8 22 M256 150 l2 20 M300 140 l8 24" />
        </g>
        <path d="M0 238 L34 214 L58 222 L92 196 L118 212 L150 228 L184 206 L214 220 L250 198 L282 214 L320 200 L360 222 L360 268 L0 268Z" fill="#151110" opacity="0.95" strokeWidth="2.2" />
        <g fill="none" stroke="#c9402a" strokeWidth="1.2" opacity="0.5">
          <path d="M92 196 l-10 24 M100 202 l-2 22 M184 206 l-8 24 M192 210 l4 20 M250 198 l-8 26 M258 204 l6 22" />
        </g>
      </g>

        </>
      )}

      {/* poster-style white lightning bolts and spray flecks */}
      <g className="bolts" fill={cream} stroke={ink} strokeWidth="1.6" strokeLinejoin="round">
        <path className="bolt b0" d="M30 86 l22 -6 l-10 12 l24 -4 l-34 22 l12 -14 l-18 2Z" />
        <path className="bolt b1" d="M300 196 l20 -8 l-8 12 l22 -4 l-30 20 l10 -12 l-16 2Z" />
        <path className="bolt b2" d="M326 60 l14 -4 l-6 8 l14 -2 l-20 14 l6 -8 l-10 0Z" fill={red} />
      </g>
      <g fill={cream} opacity="0.55">
        {[[14, 104], [40, 150], [60, 72], [88, 210], [70, 196], [292, 88], [316, 132], [340, 150], [332, 214], [276, 228], [110, 70], [250, 72], [22, 190], [354, 182], [128, 226], [230, 232]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 ? 0.9 : 1.4} />
        ))}
      </g>

      {/* scattered twinkling stars */}
      <g stroke={ink} strokeWidth="1.2" strokeLinejoin="round">
          <path className="spark s0" d={`M20 66 Q20.6 69.4 24 70 Q20.6 70.6 20 74 Q19.4 70.6 16 70 Q19.4 69.4 20 66Z`} fill={cream} />
          <path className="spark s1" d={`M46 117 Q46.5 119.5 49 120 Q46.5 120.5 46 123 Q45.5 120.5 43 120 Q45.5 119.5 46 117Z`} fill={yellow} />
          <path className="spark s2" d={`M28 166.5 Q28.5 169.5 31.5 170 Q28.5 170.5 28 173.5 Q27.5 170.5 24.5 170 Q27.5 169.5 28 166.5Z`} fill={cream} />
          <path className="spark s0" d={`M332 66 Q332.6 69.4 336 70 Q332.6 70.6 332 74 Q331.4 70.6 328 70 Q331.4 69.4 332 66Z`} fill={yellow} />
          <path className="spark s1" d={`M344 125 Q344.4 127.5 347 128 Q344.4 128.4 344 131 Q343.6 128.4 341 128 Q343.6 127.5 344 125Z`} fill={cream} />
          <path className="spark s2" d={`M318 172.5 Q318.5 175.5 321.5 176 Q318.5 176.5 318 179.5 Q317.5 176.5 314.5 176 Q317.5 175.5 318 172.5Z`} fill={yellow} />
          <path className="spark s0" d={`M96 55 Q96.5 57.5 99 58 Q96.5 58.5 96 61 Q95.5 58.5 93 58 Q95.5 57.5 96 55Z`} fill={cream} />
          <path className="spark s1" d={`M258 52.5 Q258.5 55.5 261.5 56 Q258.5 56.5 258 59.5 Q257.5 56.5 254.5 56 Q257.5 55.5 258 52.5Z`} fill={yellow} />
          <path className="spark s2" d={`M70 89.5 Q70.4 91.6 72.5 92 Q70.4 92.4 70 94.5 Q69.6 92.4 67.5 92 Q69.6 91.6 70 89.5Z`} fill={cream} />
          <path className="spark s0" d={`M300 101.5 Q300.4 103.6 302.5 104 Q300.4 104.4 300 106.5 Q299.6 104.4 297.5 104 Q299.6 103.6 300 101.5Z`} fill={yellow} />
          <path className="spark s1" d={`M12 137.5 Q12.4 139.6 14.5 140 Q12.4 140.4 12 142.5 Q11.6 140.4 9.5 140 Q11.6 139.6 12 137.5Z`} fill={cream} />
          <path className="spark s2" d={`M350 93.5 Q350.4 95.6 352.5 96 Q350.4 96.4 350 98.5 Q349.6 96.4 347.5 96 Q349.6 95.6 350 93.5Z`} fill={yellow} />
          <path className="spark s0" d={`M120 209.5 Q120.4 211.6 122.5 212 Q120.4 212.4 120 214.5 Q119.6 212.4 117.5 212 Q119.6 211.6 120 209.5Z`} fill={cream} />
          <path className="spark s1" d={`M240 211 Q240.4 213.6 243 214 Q240.4 214.4 240 217 Q239.6 214.4 237 214 Q239.6 213.6 240 211Z`} fill={yellow} />
          </g>

      {/* far half of the rings: behind the fire and eye */}
      <g ref={back} className="orbs back" filter="url(#eyeink)" stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />

      {/* red starburst spikes behind everything, like the banner reference */}
      <g className="spikes" fill="#d92a1c" stroke={ink} strokeWidth="1.2" strokeLinejoin="round">
        {Array.from({ length: 30 }, (_, i) => {
          const a = ((i / 30) * 360 + 4) * (Math.PI / 180);
          const r2 = [150, 112, 132, 98, 142, 120][i % 6];
          const w = Math.PI / 150;
          const P = (ang: number, r: number) => `${(cx + Math.cos(ang) * r).toFixed(1)} ${(cy + Math.sin(ang) * r * 0.78).toFixed(1)}`;
          return <path key={i} d={`M${P(a - w * 4.5, 46)} L${P(a, r2)} L${P(a + w * 4.5, 46)}Z`} />;
        })}
      </g>

      {/* sunburst rays behind the flames: yellow wedges with black ink lines */}
      <g className="rays" stroke={ink} strokeLinecap="round">
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * Math.PI * 2;
          const r1 = 44;
          const r2 = i % 2 ? 92 : 104;
          const w = Math.PI / 72;
          const P = (ang: number, r: number) => `${(cx + Math.cos(ang) * r).toFixed(1)} ${(cy + Math.sin(ang) * r * 0.86).toFixed(1)}`;
          return (
            <g key={i}>
              <path d={`M${P(a - w, r1)} L${P(a, r2)} L${P(a + w, r1)}Z`} fill={i % 3 ? yellow : '#f7e7a6'} strokeWidth="0.8" opacity="0.85" />
              <line x1={cx + Math.cos(a + w * 1.5) * 50} y1={cy + Math.sin(a + w * 1.5) * 50 * 0.86} x2={cx + Math.cos(a + w * 1.5) * (r2 - 8)} y2={cy + Math.sin(a + w * 1.5) * (r2 - 8) * 0.86} strokeWidth="0.9" opacity="0.7" />
            </g>
          );
        })}
      </g>

      <g className="firebeat" filter="url(#eyeink)" stroke={ink} strokeLinejoin="round" strokeLinecap="round">
        {[0, 1, 2].map(fire)}
      </g>

      <g className="eyeball" filter="url(#eyeink)" stroke={ink} strokeLinejoin="round" strokeLinecap="round">
        {/* lid band: red outer, orange inner (like the reference) */}
        <path d={`M${cx - 58} ${cy} Q${cx} ${cy - 56} ${cx + 58} ${cy} Q${cx} ${cy + 52} ${cx - 58} ${cy}Z`} fill={lid} strokeWidth="2.6" />
        <path d={`M${cx - 52} ${cy} Q${cx} ${cy - 47} ${cx + 52} ${cy} Q${cx} ${cy + 44} ${cx - 52} ${cy}Z`} fill={orange} strokeWidth="1.6" />
        {/* eye white, pinkish, with a pink lower lid and red veins */}
        <path d={`M${cx - 46} ${cy} Q${cx} ${cy - 40} ${cx + 46} ${cy} Q${cx} ${cy + 40} ${cx - 46} ${cy}Z`} fill="#f6e4d8" strokeWidth="2.4" />
        <path d={`M${cx - 40} ${cy + 6} Q${cx} ${cy + 34} ${cx + 40} ${cy + 6} Q${cx} ${cy + 26} ${cx - 40} ${cy + 6}Z`} fill="#eba0a0" stroke="none" opacity="0.8" />
        <g fill="none" stroke="#c4402b" strokeWidth="1" opacity="0.8">
          <path d={`M${cx - 44} ${cy} q8 -2 12 -6 m-12 6 q8 3 13 2 M${cx + 44} ${cy} q-8 -3 -12 -7 m12 7 q-9 2 -13 6 M${cx - 38} ${cy - 8} q5 1 7 4 M${cx + 36} ${cy + 9} q-5 0 -8 -3`} />
        </g>
        <g clipPath="url(#eyeclip)">
          <g className="iris" ref={irisRef}>
            <circle cx={cx} cy={cy} r="21" fill="#7f9db4" stroke="#1c2a36" strokeWidth="3" />
            <circle cx={cx} cy={cy} r="15" fill="#5f7f99" stroke="none" />
            {Array.from({ length: 28 }, (_, i) => {
              const a = (i / 28) * Math.PI * 2;
              return <line key={i} x1={cx + Math.cos(a) * 9} y1={cy + Math.sin(a) * 9} x2={cx + Math.cos(a) * 19} y2={cy + Math.sin(a) * 19} strokeWidth="1" stroke="#2c4152" />;
            })}
            <circle cx={cx} cy={cy} r="9.5" fill={ink} stroke={ink} strokeWidth="1" />
            <circle cx={cx + 6} cy={cy - 7} r="4.2" fill="#fff" stroke="none" />
            <circle cx={cx - 6} cy={cy + 6} r="1.6" fill="#fff" stroke="none" opacity="0.8" />
          </g>
        </g>
        {/* upper lid shadow line and crease */}
        <path d={`M${cx - 44} ${cy - 2} Q${cx} ${cy - 42} ${cx + 44} ${cy - 2}`} fill="none" stroke="#5a1a10" strokeWidth="2.4" />
        <path d={`M${cx - 50} ${cy - 6} Q${cx} ${cy - 52} ${cx + 50} ${cy - 6}`} fill="none" stroke={ink} strokeWidth="1.4" />
      </g>

      {/* skull hanging under the eye, like the banner */}
      <g className="hangskull" filter="url(#eyeink)" stroke={ink} strokeWidth="1.8" strokeLinejoin="round" transform={`translate(${cx} ${cy + 62})`}>
        <path d="M0 -14 V-6" strokeWidth="1.4" />
        <path d="M-10 4 C-10 -9 10 -9 10 4 C10 8 7 9 6 11 L6 15 L-6 15 L-6 11 C-7 9 -10 8 -10 4Z" fill={cream} />
        <circle cx="-4" cy="3" r="3" fill={ink} />
        <circle cx="4" cy="3" r="3" fill={ink} />
        <path d="M0 7 l-1.4 2.6 h2.8Z" fill={ink} strokeWidth="0.8" />
        <path d="M-3 12 v3 M0 12 v3 M3 12 v3" strokeWidth="1" />
      </g>

      {/* near half: in front, with a shadow */}
      <g ref={front} className="orbs front" filter="url(#eyeink)" stroke={ink} strokeWidth="2.2" strokeLinejoin="round">
        {orbs.map((o, i) => (
          <g key={i} ref={(g) => void (nodes.current[i] = g)}>
            <g className={o.twinkle ? 'twinkle' : undefined}>{o.el}</g>
          </g>
        ))}
      </g>
      </g>
      {/* grit and scratches over the whole piece */}
      <rect x="0" y="0" width="360" height="268" filter="url(#grit)" opacity="0.4" style={{ mixBlendMode: 'multiply' }} pointerEvents="none" />
      <g stroke="#0a0a0a" strokeWidth="0.7" opacity="0.35" fill="none" pointerEvents="none">
        <path d="M30 60 L140 250 M210 40 L330 230 M90 50 L60 140 M300 60 L250 160 M150 90 L120 200" />
      </g>
      <g stroke="#f3e6c9" strokeWidth="0.6" opacity="0.18" fill="none" pointerEvents="none">
        <path d="M60 70 L180 260 M240 50 L300 180 M120 60 L200 120" />
      </g>
    </svg>
  );
});

/** Grid / list icons for the view switches. */
export const GridIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="currentColor">
    <rect x="1" y="1" width="7" height="7" rx="1" />
    <rect x="10" y="1" width="7" height="7" rx="1" />
    <rect x="1" y="10" width="7" height="7" rx="1" />
    <rect x="10" y="10" width="7" height="7" rx="1" />
  </svg>
);
export const ListIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="currentColor">
    <rect x="1" y="2" width="3" height="3" rx="0.5" />
    <rect x="6" y="2.5" width="11" height="2" rx="1" />
    <rect x="1" y="7.5" width="3" height="3" rx="0.5" />
    <rect x="6" y="8" width="11" height="2" rx="1" />
    <rect x="1" y="13" width="3" height="3" rx="0.5" />
    <rect x="6" y="13.5" width="11" height="2" rx="1" />
  </svg>
);

/** Compact list icon: lines only (name · mana · price · owned). */
export const CompactIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="currentColor">
    <rect x="1" y="2" width="16" height="2" rx="1" />
    <rect x="1" y="6" width="16" height="2" rx="1" />
    <rect x="1" y="10" width="16" height="2" rx="1" />
    <rect x="1" y="14" width="16" height="2" rx="1" />
  </svg>
);

/** Mana symbols for the colour buttons (W sun, U drop, B skull, R fire swirl, G tree). */
export function ManaIcon({ c }: { c: string }) {
  const k = { width: 22, height: 22, viewBox: '0 0 24 24', 'aria-hidden': true as const, fill: 'currentColor' };
  if (c === 'W')
    return (
      <svg {...k}>
        <circle cx="12" cy="12" r="5" />
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="11" y="1" width="2" height="5" rx="1" transform={`rotate(${i * 45} 12 12)`} />
        ))}
      </svg>
    );
  if (c === 'U') return <svg {...k}><path d="M12 2 C8 9 5 12 5 15.5 A7 7 0 0 0 19 15.5 C19 12 16 9 12 2Z" /></svg>;
  if (c === 'B')
    return (
      <svg {...k}>
        <path d="M12 3 C6.5 3 4 6.5 4 10.5 C4 13.5 6 15 7 15.5 L7 19 L17 19 L17 15.5 C18 15 20 13.5 20 10.5 C20 6.5 17.5 3 12 3Z M9 9 a2 2 0 1 1 0 4 a2 2 0 1 1 0 -4Z M15 9 a2 2 0 1 1 0 4 a2 2 0 1 1 0 -4Z" fillRule="evenodd" />
        <path d="M9 19 v2 M12 19 v2 M15 19 v2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  if (c === 'R') return <svg {...k}><path d="M12 2 C13 6 17 7 17 12 A5 5 0 0 1 7 12 C7 9.5 8.5 8 9.5 6.5 C9.5 9 11 10 12 10 C10.5 7.5 11 4.5 12 2Z M12 14 a2.2 2.2 0 1 0 0.1 0Z" fillRule="evenodd" /><path d="M5 18 Q12 23 19 18 Q12 21 5 18Z" /></svg>;
  return (
    <svg {...k}>
      <path d="M12 2 C7 2 4.5 5.5 5 9 C3 10.5 3.5 14 6.5 14.5 C7.5 16 10 16 11 15 L11 22 L13 22 L13 15 C14 16 16.5 16 17.5 14.5 C20.5 14 21 10.5 19 9 C19.5 5.5 17 2 12 2Z" />
    </svg>
  );
}

/** Header logo: sketchy cream wizard hat + DECKMAGE (one word) in xeroxed cream cut-out tiles with black letters (owner's logo style). */
export function Logo() {
  const tile = (ch: string, i: number) => {
    const r = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
    const f = r - Math.floor(r);
    return (
      <span key={i} className="lt" style={{ transform: `rotate(${(f * 7 - 3.5).toFixed(1)}deg) translateY(${Math.round(f * 4 - 2)}px)` }}>
        {ch}
      </span>
    );
  };
  return (
    <span className="brandmark">
      <svg className="hat" width="40" height="34" viewBox="0 0 40 34" aria-hidden="true" fill="none" stroke="#efe6d2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 27 C14 24 28 24 36 27 C30 30 12 30 6 27Z" strokeWidth="2.2" />
        <path d="M11 26 C13 18 15 10 23 4 C21 9 24 13 27 16 C25 17 26 21 29 26" strokeWidth="2.2" />
        <path d="M23 4 C27 3 29 6 29 9" strokeWidth="2" />
        <path d="M14 21 l2 -1 M18 15 l1.5 -1 M21 22 l2 -0.5 M17 24 l1 -1" strokeWidth="1.8" />
        <path d="M2 12 l5 -1.5 M1 17 l5 0 M3 22 l4 -1.5" strokeWidth="1.8" />
      </svg>
      <span className="word xerox" aria-hidden="true">
        {'DECKMAGE'.split('').map((c, i) => tile(c, i))}
      </span>
    </span>
  );
}
