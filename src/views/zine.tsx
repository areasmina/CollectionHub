// "Midnight Override" zine kit: ransom titles, marker doodles, page decor, pips (design/midnight-override-spec.md).
import { useMemo } from 'react';

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

/** Discover header art, folk-tattoo style (thick black ink, flat red / yellow / cream): two hands holding a fan of
 *  cards, an eye on the palm, rays and stars. Decorative. */
export function HandsDoodle() {
  const ink = '#0a0a0a';
  const cards = [-34, -17, 0, 17, 34];
  const marks = ['eye', 'star', 'skull', 'sun', 'drop'];
  return (
    <svg className="handsdoodle" viewBox="0 0 420 300" aria-hidden="true">
      {/* rays */}
      <g stroke="#ffcc00" strokeWidth="5" strokeLinecap="round">
        {Array.from({ length: 11 }, (_, i) => {
          const a = ((-170 + i * 16) * Math.PI) / 180;
          return <line key={i} x1={210 + Math.cos(a) * 150} y1={210 + Math.sin(a) * 150} x2={210 + Math.cos(a) * 192} y2={210 + Math.sin(a) * 192} />;
        })}
      </g>
      {/* fan of cards */}
      {cards.map((r, i) => (
        <g key={r} transform={`translate(210 230) rotate(${r}) translate(-38 -196)`}>
          <rect width="76" height="106" rx="7" fill="#f4efe1" stroke={ink} strokeWidth="5" />
          <rect x="8" y="8" width="60" height="44" rx="3" fill={i % 2 ? '#e60012' : '#0a0a0a'} stroke={ink} strokeWidth="3" />
          <line x1="10" y1="64" x2="66" y2="64" stroke={ink} strokeWidth="3" />
          <line x1="10" y1="74" x2="56" y2="74" stroke={ink} strokeWidth="2.5" />
          <line x1="10" y1="83" x2="60" y2="83" stroke={ink} strokeWidth="2.5" />
          {marks[i] === 'eye' && (
            <g transform="translate(38 30)">
              <path d="M-20 0 Q0 -16 20 0 Q0 16 -20 0Z" fill="#f4efe1" stroke={ink} strokeWidth="3" />
              <circle r="6" fill="#ffcc00" stroke={ink} strokeWidth="3" />
            </g>
          )}
          {marks[i] === 'star' && <path transform="translate(38 30)" d="M0 -16 L4 -5 L16 -5 L6 2 L10 14 L0 6 L-10 14 L-6 2 L-16 -5 L-4 -5Z" fill="#ffcc00" stroke={ink} strokeWidth="3" strokeLinejoin="round" />}
          {marks[i] === 'skull' && (
            <g transform="translate(38 30)" stroke={ink} strokeWidth="3">
              <path d="M-13 2 Q-13 -15 0 -15 Q13 -15 13 2 L8 6 L8 12 L-8 12 L-8 6Z" fill="#f4efe1" />
              <circle cx="-5" cy="-2" r="3.5" fill={ink} />
              <circle cx="5" cy="-2" r="3.5" fill={ink} />
            </g>
          )}
          {marks[i] === 'sun' && (
            <g transform="translate(38 30)" stroke={ink} strokeWidth="3">
              <circle r="9" fill="#ffcc00" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <line key={a} x1={Math.cos((a * Math.PI) / 180) * 12} y1={Math.sin((a * Math.PI) / 180) * 12} x2={Math.cos((a * Math.PI) / 180) * 17} y2={Math.sin((a * Math.PI) / 180) * 17} />
              ))}
            </g>
          )}
          {marks[i] === 'drop' && <path transform="translate(38 32)" d="M0 -16 Q11 0 8 7 Q4 14 0 14 Q-4 14 -8 7 Q-11 0 0 -16Z" fill="#ffcc00" stroke={ink} strokeWidth="3" />}
        </g>
      ))}
      {/* left hand: palm out with an eye, fingers curled over the fan */}
      <g stroke={ink} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M72 300 L96 236 Q104 200 140 186 Q176 176 200 196 L206 232 Q190 268 160 282 L150 300Z" fill="#e8a77c" />
        <rect x="150" y="160" width="58" height="22" rx="11" fill="#e8a77c" transform="rotate(-24 179 171)" />
        <rect x="160" y="180" width="58" height="22" rx="11" fill="#e8a77c" transform="rotate(-14 189 191)" />
        <rect x="164" y="202" width="54" height="21" rx="10.5" fill="#e8a77c" transform="rotate(-4 191 212)" />
        <path d="M118 238 Q138 222 158 238 Q138 254 118 238Z" fill="#f4efe1" strokeWidth="3.5" />
        <circle cx="138" cy="238" r="6" fill="#e60012" strokeWidth="3" />
        <path d="M84 282 L150 282" stroke="#e60012" strokeWidth="9" />
        <path d="M80 292 L152 292" strokeWidth="4" strokeDasharray="7 6" />
      </g>
      {/* right hand: thumb pinning the fan */}
      <g stroke={ink} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M352 300 L330 240 Q318 206 286 198 Q256 194 240 214 L236 246 Q252 276 282 288 L292 300Z" fill="#e8a77c" />
        <rect x="214" y="168" width="64" height="24" rx="12" fill="#e8a77c" transform="rotate(-42 246 180)" />
        <path d="M290 282 L350 282" stroke="#ffcc00" strokeWidth="9" />
        <path d="M288 292 L354 292" strokeWidth="4" strokeDasharray="7 6" />
        <path d="M296 238 l6 -10 l6 10 l-6 10Z" fill="#e60012" strokeWidth="3" />
      </g>
      {/* sparks */}
      <g fill="#ffcc00" stroke={ink} strokeWidth="3" strokeLinejoin="round">
        <path d="M36 70 l6 14 l14 6 l-14 6 l-6 14 l-6 -14 l-14 -6 l14 -6Z" />
        <path d="M384 52 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4Z" />
        <path d="M396 196 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3Z" fill="#e60012" />
      </g>
    </svg>
  );
}
