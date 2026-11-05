// The black-and-white pixel card that spins while something loads.
// Rendered in Blender (first for card-hunt), 48 frames, 92×134, transparent; source: brand/card-spin/build.py.
// Reduced motion shows the still card instead of the spin.
export function CardSpin({ label = 'Loading…', page = false }: { label?: string; page?: boolean }) {
  return (
    <div className={page ? 'cardspin pageload' : 'cardspin'} role="status" aria-live="polite">
      <picture aria-hidden="true">
        <source srcSet="/card-spin.png" media="(prefers-reduced-motion: reduce)" />
        <img src="/card-spin.webp" alt="" width={92} height={134} />
      </picture>
      <p className="count">{label}</p>
    </div>
  );
}
