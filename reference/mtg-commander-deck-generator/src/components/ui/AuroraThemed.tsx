/**
 * Aurora background. Color swaps animate smoothly: the `--aurora-color-a/b`
 * CSS variables are registered as `<color>` via @property in index.css, with
 * an 800ms transition on `.aurora-themed`. The blobs stay fully visible
 * throughout and their colors interpolate to the new palette — no opacity
 * dip needed. (The earlier JS fade-out → swap → fade-in hack was a
 * workaround for CSS variables being untyped strings, which is no longer
 * the case now that they're registered.)
 */
export function AuroraThemed({ colors }: { colors: { a: string; b: string } }) {
  return (
    <div
      className="aurora-themed"
      style={{
        '--aurora-color-a': `hsl(${colors.a})`,
        '--aurora-color-b': `hsl(${colors.b})`,
      } as React.CSSProperties}
    >
      <div className="aurora-bg" />
    </div>
  );
}
