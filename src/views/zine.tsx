// "Midnight Override" zine kit: ransom titles, marker doodles, page decor, pips (design/midnight-override-spec.md).
import { memo, useEffect, useMemo, useRef } from 'react';

const frac = (x: number) => x - Math.floor(x);

/** Ransom-note title ("What can I build?" reference): seeded cut-out letters, cream ~62% / black ~38%, never two black in a row,
 * halftone dots fading in from one edge of each tile. */
export function Ransom({ text, size: wanted, seed, breakWords }: { text: string; size: number; seed: number; breakWords?: boolean }) {
  // Unless words may break (commander banner), shrink until the longest word fits the screen (each tile is ~1× size wide).
  // Breaking mid-word reads well on wide screens only; phones keep whole words.
  breakWords = breakWords && window.innerWidth > 700;
  const longest = breakWords ? 9 : Math.max(...text.split(' ').map((w) => w.length));
  const size = Math.max(18, Math.min(wanted, Math.floor((window.innerWidth - 64) / (longest * 1.02))));
  const words = useMemo(() => {
    const rnd = (n: number) => frac(Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453);
    // A solid layer that turns transparent toward one edge reveals the halftone dots beneath it.
    const tone = (deg: number, base: string, dot: string) =>
      `linear-gradient(${deg}deg, ${base} 48%, transparent 92%), radial-gradient(${dot} 1.1px, transparent 1.7px) 0 0/4px 4px, ${base}`;
    const papers = {
      cream: { fg: '#111111', bg: (d: number) => tone(d, '#F4EFE1', 'rgba(0,0,0,.55)') },
      black: { fg: '#F1EBDC', bg: (d: number) => tone(d, '#0E0E0E', 'rgba(255,255,255,.35)') },
    };
    const fonts: React.CSSProperties[] = [
      { fontFamily: "'Alfa Slab One', serif" },
      { fontFamily: "'Alfa Slab One', serif" },
      { fontFamily: "'Alfa Slab One', serif" },
      { fontFamily: "'Archivo Black', sans-serif" },
      { fontFamily: "'Archivo Black', sans-serif" },
      { fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 900 },
    ];
    const clips = ['polygon(1% 2%, 99% 0, 100% 97%, 0 100%)', 'polygon(0 0, 98% 3%, 100% 100%, 2% 97%)', 'polygon(2% 0, 100% 2%, 98% 98%, 0 100%)', 'polygon(0 3%, 100% 0, 99% 100%, 1% 98%)'];
    let last = 'cream';
    let k = 0;
    return text.split(' ').map((w) =>
      w.split('').map((ch) => {
        k++;
        const r = rnd(k);
        let pk: keyof typeof papers = r < 0.62 ? 'cream' : 'black';
        if (pk === 'black' && last === 'black') pk = 'cream';
        last = pk;
        const p = papers[pk];
        const outer: React.CSSProperties = {
          margin: `0 ${Math.round(size * 0.035)}px`,
          transform: `rotate(${(rnd(k + 100) * 8 - 4).toFixed(1)}deg) translateY(${Math.round(rnd(k + 150) * 8 - 4)}px)`,
          filter: 'drop-shadow(2px 4px 0 rgba(0,0,0,.9))',
        };
        const inner: React.CSSProperties = {
          ...fonts[Math.floor(rnd(k + 400) * fonts.length)],
          minWidth: Math.round(size * 0.62),
          fontSize: Math.round(size * (0.9 + rnd(k + 50) * 0.14)),
          padding: `${Math.round(size * (0.07 + rnd(k + 250) * 0.04))}px ${Math.round(size * (0.12 + rnd(k + 200) * 0.05))}px`,
          background: p.bg(Math.round(rnd(k + 450) * 360)),
          color: p.fg,
          clipPath: clips[Math.floor(rnd(k + 350) * clips.length)],
          boxShadow: `inset 0 0 0 1px rgba(0,0,0,.18), inset 0 -${Math.round(size * 0.05)}px ${Math.round(size * 0.08)}px rgba(0,0,0,.12)`,
          animationDelay: `-${(rnd(k + 300) * 2.4).toFixed(2)}s`,
        };
        return { ch, outer, inner };
      }),
    );
  }, [text, size, seed]);
  return (
    <div className={`ransom${breakWords ? ' loose' : ''}`} aria-hidden="true" style={{ rowGap: Math.round(size * 0.16), columnGap: breakWords ? 0 : Math.round(size * 0.4), '--wg': `${Math.round(size * 0.32)}px` } as React.CSSProperties}>
      {words.map((w, i) => (
        <span key={i} className="rword">
          {w.map((l, j) => (
            <span key={j} style={l.outer}>
              <span className="jit" style={l.inner}>
                {l.ch}
              </span>
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

/** Ransom title on the red halftone slash; the heading carries the plain words. */
export function Title({ text, label, size, seed, as: H = 'h1', className = '' }: { text: string; label: string; size: number; seed: number; as?: 'h1' | 'h2'; className?: string }) {
  return (
    <div className={`titlewrap ${className}`}>
      <div className="ht slash" aria-hidden="true" />
      <H aria-label={label} className="ztitle">
        <Ransom text={text} size={size} seed={seed} />
      </H>
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
export function CardDoodles({ i }: { i: number }) {
  const n = (i + 1) * 37;
  const count = srnd(n) < 0.25 ? 0 : srnd(n + 9) < 0.7 ? 1 : 2;
  return <Doodles n={n} count={count} spots={[[52, 36], [-8, 26], [58, 52], [-10, 58], [40, -6], [62, 70]]} />;
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
export const EyeDoodle = memo(function EyeDoodle() {
  const ink = '#1c120c';
  const red = '#c9402a';
  const orange = '#e58a2b';
  const yellow = '#f2c63e';
  const teal = '#3c8a90';
  const cream = '#f3e6c9';
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
    { ring: 0, at: 120, size: 0.9, el: heart },
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
    <svg className="eyedoodle" viewBox="0 42 360 214" aria-hidden="true">
      <defs>
        <filter id="eyeink" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={7} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3" />
        </filter>
        <radialGradient id="eyefade" cx="50%" cy="60%" r="52%">
          <stop offset="35%" stopColor="#fff" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
        <mask id="eyemask">
          <rect width="360" height="268" fill="url(#eyefade)" />
        </mask>
        <clipPath id="eyeclip">
          <path d={`M${cx - 46} ${cy} Q${cx} ${cy - 40} ${cx + 46} ${cy} Q${cx} ${cy + 40} ${cx - 46} ${cy}Z`} />
        </clipPath>
      </defs>

      {/* surreal mountainscape in three ridges: far (pale lilac, soft), middle (violet), near (deep blue, bold) */}
      <g mask="url(#eyemask)" filter="url(#eyeink)" stroke={ink} strokeLinejoin="round" strokeLinecap="round">
        <path d="M20 200 L70 150 L96 162 L132 112 L152 98 L172 116 L196 104 L222 92 L248 120 L276 108 L312 146 L344 170 L360 178 L360 268 L0 268 L0 208Z" fill="#8b7fc4" opacity="0.32" strokeWidth="1.4" />
        <path d="M152 98 l-6 10 l7 -3 l5 6 l2 -9Z M222 92 l-7 12 l8 -4 l6 6 l1 -10Z" fill={cream} opacity="0.35" stroke="none" />
        <path d="M0 214 L40 182 L66 192 L104 146 L124 158 L150 136 L176 170 L206 160 L238 132 L262 146 L292 128 L330 172 L360 184 L360 268 L0 268Z" fill="#5a4aa0" opacity="0.55" strokeWidth="1.8" />
        <path d="M104 146 l-7 12 l8 -4 l6 7 l2 -11Z M292 128 l-8 13 l9 -4 l6 7 l1 -12Z" fill={cream} opacity="0.5" stroke="none" />
        <g fill="none" stroke="#231a4a" strokeWidth="1.2" opacity="0.6">
          <path d="M112 158 l-8 22 M122 164 l-2 20 M246 146 l-8 22 M256 150 l2 20 M300 140 l8 24" />
        </g>
        <path d="M0 238 L34 214 L58 222 L92 196 L118 212 L150 228 L184 206 L214 220 L250 198 L282 214 L320 200 L360 222 L360 268 L0 268Z" fill="#26457e" opacity="0.8" strokeWidth="2.2" />
        <g fill="none" stroke="#0e1838" strokeWidth="1.4" opacity="0.7">
          <path d="M92 196 l-10 24 M100 202 l-2 22 M184 206 l-8 24 M192 210 l4 20 M250 198 l-8 26 M258 204 l6 22" />
        </g>
      </g>

      {/* far half of the rings: behind the fire and eye */}
      <g ref={back} className="orbs back" filter="url(#eyeink)" stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />

      <g filter="url(#eyeink)" stroke={ink} strokeLinejoin="round" strokeLinecap="round">
        {[0, 1, 2].map(fire)}
      </g>

      <g className="eyeball" filter="url(#eyeink)" stroke={ink} strokeLinejoin="round" strokeLinecap="round">
        <path d={`M${cx - 48} ${cy} Q${cx} ${cy - 44} ${cx + 48} ${cy} Q${cx} ${cy + 44} ${cx - 48} ${cy}Z`} fill={cream} strokeWidth="3.4" />
        <g clipPath="url(#eyeclip)">
          <g className="iris">
            <circle cx={cx} cy={cy} r="19" fill={teal} strokeWidth="2.4" />
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2;
              return <line key={i} x1={cx + Math.cos(a) * 9} y1={cy + Math.sin(a) * 9} x2={cx + Math.cos(a) * 17} y2={cy + Math.sin(a) * 17} strokeWidth="1.1" stroke="#1d4a4e" />;
            })}
            <circle cx={cx} cy={cy} r="8" fill={ink} strokeWidth="1" />
            <circle cx={cx - 5} cy={cy - 6} r="3.2" fill={cream} stroke="none" />
          </g>
        </g>
        <path d={`M${cx - 44} ${cy - 5} Q${cx} ${cy - 46} ${cx + 44} ${cy - 5}`} fill="none" strokeWidth="2" />
        {[-34, -22, -11, 0, 11, 22, 34].map((dx) => (
          <line key={dx} x1={cx + dx} y1={cy - 32 + Math.abs(dx) * 0.42} x2={cx + dx * 1.18} y2={cy - 42 + Math.abs(dx) * 0.42} strokeWidth="2.2" />
        ))}
      </g>

      {/* near half: in front, with a shadow */}
      <g ref={front} className="orbs front" filter="url(#eyeink)" stroke={ink} strokeWidth="2.2" strokeLinejoin="round">
        {orbs.map((o, i) => (
          <g key={i} ref={(g) => void (nodes.current[i] = g)}>
            <g className={o.twinkle ? 'twinkle' : undefined}>{o.el}</g>
          </g>
        ))}
      </g>
    </svg>
  );
});
