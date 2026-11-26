import { useId } from 'react';

/**
 * The CollectionHub mark (design system v2): two stacked cards, the front one cut by a single slash. A crisp vector at
 * any size, transparent behind, so it never leaves a box on the island. `fire` is the Forge variant: the front card
 * glows ember and holds a flame, with a few sparks rising (sparks stop under reduced motion, see tokens.css).
 */
export function BrandMark({ size = 22, fire = false, className = '' }: { size?: number; fire?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '');
  const face = `bm-face-${id}`;
  return (
    <svg
      className={`brandmark2${fire ? ' fire' : ''}${className ? ` ${className}` : ''}`}
      width={Math.round(size * 0.86)}
      height={size}
      viewBox="0 0 24 28"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={face} x1="0" y1="0" x2="0.4" y2="1">
          {fire ? (
            <>
              <stop offset="0" stopColor="#ff7a1a" />
              <stop offset="0.55" stopColor="#f0280f" />
              <stop offset="1" stopColor="#9e0010" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="#ff2a2a" />
              <stop offset="1" stopColor="#c2000f" />
            </>
          )}
        </linearGradient>
      </defs>
      {/* back card: outlined paper */}
      <rect x="2.6" y="5" width="12.6" height="17.6" rx="1.8" transform="rotate(-9 8.9 13.8)" fill="#0b0b0d" stroke="#f4f1ea" strokeWidth="1.5" />
      {/* front card */}
      <g transform="rotate(7 15 14.6)">
        <rect x="8.6" y="5.8" width="12.6" height="17.6" rx="1.8" fill={`url(#${face})`} />
        <rect x="8.6" y="5.8" width="12.6" height="17.6" rx="1.8" fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="0.8" />
        {fire ? (
          <>
            <path className="bm-flame" d="M14.9 9.2c2.2 2.4 3.7 4.2 3.7 6.9a3.7 3.7 0 0 1-7.4 0c0-1.7.9-2.9 1.8-3.9.1 1.4.8 2.1 1.5 2.4-.6-1.8-.5-3.7.4-5.4z" fill="#ffe7a8" />
            <path d="M14.9 13.6c1 1.1 1.6 1.9 1.6 3a1.6 1.6 0 0 1-3.2 0c0-.8.5-1.4 1-1.9.1.5.3.8.6.9-.2-.7-.2-1.4 0-2z" fill="#fff8e1" />
          </>
        ) : (
          <path d="M11.4 20.2 18.6 9" stroke="#f4f1ea" strokeWidth="2" strokeLinecap="square" />
        )}
      </g>
      {fire && (
        <g className="bm-sparks" fill="#ffb347">
          <circle className="s1" cx="12" cy="4.6" r="0.9" />
          <circle className="s2" cx="17.6" cy="3.2" r="0.7" />
          <circle className="s3" cx="20.4" cy="5.4" r="0.6" />
        </g>
      )}
    </svg>
  );
}
