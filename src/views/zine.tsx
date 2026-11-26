// "Midnight Override" zine kit: ransom titles, marker doodles, page decor, pips (design/midnight-override-spec.md).
import { memo, useEffect, useMemo, useRef } from 'react';
import { BrandMark } from './BrandMark';

const frac = (x: number) => x - Math.floor(x);

/** Ransom-note title ("What can I build?" reference): seeded cut-out letters, cream ~62% / black ~38%, never two black in a row,
 * halftone dots fading in from one edge of each tile. */
/** `swap`: words (by index) drawn as something else, e.g. the eye standing in for "I" in WHAT CAN I BUILD?. */
/** The width a phone hero's name has beside the 112px card: the screen less its gutters, the card and the gap. */
export const heroRoom = () => window.innerWidth - 32 - 112 - 20;

export function Ransom({ text, size: wanted, seed, breakWords, swap, room }: { text: string; size: number; seed: number; breakWords?: boolean; swap?: Record<number, React.ReactNode>; room?: number }) {
  // Unless words may break (commander banner), shrink until the longest word fits the screen (each tile is ~1× size wide).
  // Breaking mid-word reads well on wide screens only; phones keep whole words.
  breakWords = breakWords && window.innerWidth > 700;
  const longest = breakWords ? 9 : Math.max(...text.split(' ').map((w) => w.length));
  // room: the width the name really has (a phone hero shares its row with the card); the screen less its gutters otherwise
  const size = Math.max(18, Math.min(wanted, Math.floor((room ?? window.innerWidth - 64) / (longest * 1.02))));
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

const MANA_FAN = [
  { code: 'W', label: 'White', frame: '#F3E7B0', accent: '#FFF7D6', iris: '#D8A21C', glow: '#F3E7B0', dx: -82, dy: 14, rot: -20 },
  { code: 'U', label: 'Blue', frame: '#2F7FD8', accent: '#82C8FF', iris: '#38A2FF', glow: '#2F7FD8', dx: -41, dy: -2, rot: -10 },
  { code: 'B', label: 'Black', frame: '#8A5CF6', accent: '#C8AEFF', iris: '#A978FF', glow: '#7C4DFF', dx: 0, dy: -10, rot: 0 },
  { code: 'R', label: 'Red', frame: '#E60012', accent: '#FF7034', iris: '#FF4518', glow: '#E60012', dx: 41, dy: -2, rot: 10 },
  { code: 'G', label: 'Green', frame: '#2FA35A', accent: '#7DE89C', iris: '#2FD068', glow: '#2FA35A', dx: 82, dy: 14, rot: 20 },
] as const;

/** Discover header art: 5 floating mana-color cards (W/U/B/R/G) fanned together, each housing an eye that
 *  tracks the pointer (or phone gyroscope tilt), orbited in 3D by all five MTG mana symbols and twinkling stars. */
export const EyeDoodle = memo(function EyeDoodle({ bare = false }: { bare?: boolean }) {
  const ink = '#141115';
  const cream = '#f3e6c9';
  const yellow = '#f2c63e';
  const cx = 180;
  const cy = 148;
  const star = (r: number) => `M0 ${-r} Q${r * 0.15} ${-r * 0.15} ${r} 0 Q${r * 0.15} ${r * 0.15} 0 ${r} Q${-r * 0.15} ${r * 0.15} ${-r} 0 Q${-r * 0.15} ${-r * 0.15} 0 ${-r}Z`;
  const manaGlyph = (code: string, color: string) => {
    if (code === 'W') {
      return (
        <g transform="scale(0.85)" fill={color} stroke={ink} strokeWidth="1.4">
          <circle r="5.5" />
          {Array.from({ length: 8 }, (_, k) => (
            <rect key={k} x="-1.2" y="-11" width="2.4" height="4.2" rx="1" transform={`rotate(${k * 45})`} />
          ))}
        </g>
      );
    }
    if (code === 'U') {
      return (
        <g transform="translate(-12 -12)" fill={color} stroke={ink} strokeWidth="1.6" strokeLinejoin="round">
          <path d="M12 2 C8 9 5 12 5 15.5 A7 7 0 0 0 19 15.5 C19 12 16 9 12 2Z" />
        </g>
      );
    }
    if (code === 'B') {
      return (
        <g transform="translate(-12 -12)" fill={color} stroke={ink} strokeWidth="1.5" strokeLinejoin="round">
          <path d="M12 3 C6.5 3 4 6.5 4 10.5 C4 13.5 6 15 7 15.5 L7 19 L17 19 L17 15.5 C18 15 20 13.5 20 10.5 C20 6.5 17.5 3 12 3Z" />
          <circle cx="9.2" cy="11" r="1.9" fill={ink} stroke="none" />
          <circle cx="14.8" cy="11" r="1.9" fill={ink} stroke="none" />
          <path d="M9.5 18.5 v2 M12 18.5 v2 M14.5 18.5 v2" stroke={ink} strokeWidth="1.4" />
        </g>
      );
    }
    if (code === 'R') {
      return (
        <g transform="translate(-12 -12)" fill={color} stroke={ink} strokeWidth="1.5" strokeLinejoin="round">
          <path d="M12 2 C13 6 17 7 17 12 A5 5 0 0 1 7 12 C7 9.5 8.5 8 9.5 6.5 C9.5 9 11 10 12 10 C10.5 7.5 11 4.5 12 2Z" />
          <path d="M6 18.5 Q12 22 18 18.5" fill="none" stroke={color} strokeWidth="2" />
        </g>
      );
    }
    return (
      <g transform="translate(-12 -12)" fill={color} stroke={ink} strokeWidth="1.5" strokeLinejoin="round">
        <path d="M12 2 C7 2 4.5 5.5 5 9 C3 10.5 3.5 14 6.5 14.5 C7.5 16 10 16 11 15 L11 21 L13 21 L13 15 C14 16 16.5 16 17.5 14.5 C20.5 14 21 10.5 19 9 C19.5 5.5 17 2 12 2Z" />
      </g>
    );
  };
  const orbs: Orb[] = [
    { ring: 0, at: 0, size: 1, el: manaGlyph('W', '#F3E7B0') },
    { ring: 0, at: 72, size: 1, el: manaGlyph('U', '#2F7FD8') },
    { ring: 0, at: 144, size: 1, el: manaGlyph('B', '#A882FF') },
    { ring: 0, at: 216, size: 1, el: manaGlyph('R', '#E60012') },
    { ring: 0, at: 288, size: 1, el: manaGlyph('G', '#2FA35A') },
    { ring: 1, at: 25, size: 0.8, twinkle: true, el: <path d={star(9)} fill={yellow} stroke={ink} strokeWidth="1.2" /> },
    { ring: 1, at: 95, size: 0.72, twinkle: true, el: <path d={star(7)} fill={cream} stroke={ink} strokeWidth="1.1" /> },
    { ring: 1, at: 165, size: 0.75, twinkle: true, el: <g><path d={star(8.5)} fill="#FF5520" stroke={ink} strokeWidth="1.1" /><circle r="1.8" fill={cream} stroke="none" /></g> },
    { ring: 1, at: 235, size: 0.7, twinkle: true, el: <path d={star(7.5)} fill="#82C8FF" stroke={ink} strokeWidth="1.1" /> },
    { ring: 1, at: 305, size: 0.72, twinkle: true, el: <path d={star(8)} fill="#7DE89C" stroke={ink} strokeWidth="1.1" /> },
  ];
  const RINGS = [
    { rx: 142, ry: 44, tip: -9, period: 36000, dir: 1 },
    { rx: 112, ry: 34, tip: 13, period: 26000, dir: -1 },
  ];
  const back = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const irisRefs = useRef<(SVGGElement | null)[]>([]);
  // All five card eyes follow the mouse while it moves (or device tilt on mobile); after idle they re-center.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let idle = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const b = svg.getBoundingClientRect();
      if (!b.width || !b.height) return;
      MANA_FAN.forEach((card, idx) => {
        const ir = irisRefs.current[idx];
        if (!ir) return;
        const ex = b.left + ((cx + card.dx) / 360) * b.width;
        const ey = b.top + ((cy + card.dy - 5 - 42) / 214) * b.height;
        const dx = e.clientX - ex;
        const dy = e.clientY - ey;
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 240);
        ir.style.transform = `translate(${((dx / d) * 5.2 * k).toFixed(1)}px, ${((dy / d) * 2.8 * k).toFixed(1)}px)`;
      });
      svg.classList.add('tracking');
      clearTimeout(idle);
      idle = window.setTimeout(() => {
        svg.classList.remove('tracking');
        irisRefs.current.forEach((ir) => {
          if (ir) ir.style.transform = '';
        });
      }, 3000);
    };
    addEventListener('pointermove', move, { passive: true });

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      const g = Math.max(-45, Math.min(45, e.gamma));
      const bt = Math.max(-45, Math.min(45, e.beta - 45));
      const tx = (-g / 45) * 5.2;
      const ty = (-bt / 45) * 2.8;
      irisRefs.current.forEach((ir) => {
        if (ir) ir.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
      });
      svg.classList.add('tracking');
      clearTimeout(idle);
      idle = window.setTimeout(() => {
        svg.classList.remove('tracking');
        irisRefs.current.forEach((ir) => {
          if (ir) ir.style.transform = '';
        });
      }, 4000);
    };

    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', onOrient, { passive: true });
    }

    return () => {
      removeEventListener('pointermove', move);
      if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
        window.removeEventListener('deviceorientation', onOrient);
      }
      clearTimeout(idle);
    };
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
        const sc = o.size * (0.72 + (0.28 * (depth + 1)) / 2 + 0.12 * depth);
        g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${sc.toFixed(3)})`);
        g.style.opacity = String((0.55 + (0.45 * (depth + 1)) / 2).toFixed(2));
        const want = depth < 0 ? back.current : front.current;
        if (want && g.parentNode !== want) want.appendChild(g);
      });
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
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves={2} seed={7} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2" />
        </filter>
        <clipPath id="cardeyeclip">
          <path d="M-13 -5 Q0 -14 13 -5 Q0 4 -13 -5Z" />
        </clipPath>
      </defs>

      {/* subtle zine backdrop rays behind fan */}
      {!bare && (
        <g opacity="0.22" stroke="#e60012" strokeWidth="1.2">
          {Array.from({ length: 18 }, (_, i) => {
            const a = (i / 18) * Math.PI * 2;
            return <line key={i} x1={cx + Math.cos(a) * 42} y1={cy + Math.sin(a) * 28} x2={cx + Math.cos(a) * 145} y2={cy + Math.sin(a) * 90} />;
          })}
        </g>
      )}

      {/* far half of the 3D mana orbit: behind the floating cards */}
      <g ref={back} className="orbs back" />

      {/* 5-mana-color floating card fan (W U B R G) with mouse-tracking eyes */}
      <g className="mana-fan" filter="url(#eyeink)">
        {MANA_FAN.map((c, idx) => (
          <g key={c.code} transform={`translate(${cx + c.dx} ${cy + c.dy}) rotate(${c.rot})`}>
            <g className={`mana-card-bob mc${idx}`}>
              {/* color aura glow behind card */}
              <rect x="-25" y="-34" width="50" height="68" rx="6" fill={c.glow} opacity="0.18" />
              {/* card outer frame */}
              <rect x="-23" y="-32" width="46" height="64" rx="4.5" fill="#121116" stroke={c.frame} strokeWidth="2.4" />
              <rect x="-19" y="-28" width="38" height="56" rx="2.5" fill="#1a1820" stroke={c.accent} strokeWidth="0.8" strokeOpacity="0.55" />
              {/* top title plate + mana pip */}
              <rect x="-15.5" y="-24.5" width="21" height="4.5" rx="1.2" fill={c.frame} opacity="0.82" />
              <circle cx="12" cy="-22.2" r="3.4" fill={c.frame} stroke={ink} strokeWidth="0.9" />
              {/* eye window inside the card */}
              <rect x="-16" y="-16" width="32" height="22" rx="2" fill="#0b0a0e" stroke={c.frame} strokeWidth="1" strokeOpacity="0.65" />
              <path d="M-13 -5 Q0 -14 13 -5 Q0 4 -13 -5Z" fill="#f7efe3" stroke={ink} strokeWidth="1.2" />
              <g clipPath="url(#cardeyeclip)">
                <g ref={(el) => { irisRefs.current[idx] = el; }} className="card-iris">
                  <circle cx="0" cy="-5" r="6" fill={c.iris} stroke={ink} strokeWidth="1" />
                  <circle cx="0" cy="-5" r="2.9" fill={ink} />
                  <circle cx="1.9" cy="-6.8" r="1.3" fill="#ffffff" />
                </g>
              </g>
              <path className="card-eye-lid" d="M-13 -5 Q0 -14 13 -5 Q0 4 -13 -5Z" fill={c.frame} />
              {/* rules box lines */}
              <rect x="-15" y="10" width="30" height="14" rx="1.5" fill="#111015" stroke={c.accent} strokeWidth="0.7" strokeOpacity="0.35" />
              <line x1="-12" y1="14.5" x2="11" y2="14.5" stroke={c.accent} strokeWidth="1.3" strokeOpacity="0.65" strokeLinecap="round" />
              <line x1="-12" y1="18.5" x2="6" y2="18.5" stroke={cream} strokeWidth="1.1" strokeOpacity="0.45" strokeLinecap="round" />
              <line x1="8" y1="21.5" x2="12.5" y2="21.5" stroke={c.frame} strokeWidth="1.4" strokeLinecap="round" />
            </g>
          </g>
        ))}
      </g>

      {/* near half of the 3D mana orbit: in front of the floating cards */}
      <g ref={front} className="orbs front">
        {orbs.map((o, i) => (
          <g key={i} ref={(g) => void (nodes.current[i] = g)}>
            <g className={o.twinkle ? 'twinkle' : undefined}>{o.el}</g>
          </g>
        ))}
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

/** Header logo: crisp dual-card BrandMark + condensed DECKMAGE wordmark. */
export function Logo() {
  return (
    <span className="brandmark">
      <BrandMark size={28} />
      <span className="word brandword" aria-hidden="true">
        DECK<span className="accent">MAGE</span>
      </span>
    </span>
  );
}
