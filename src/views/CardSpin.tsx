// The black-and-white pixel card that spins while something loads.
// Rendered in Blender for card-hunt (48 frames, 94×140, transparent); moved here when the apps merged.
// Reduced motion shows the still card instead of the spin.
export function CardSpin({ label = 'Loading…', page = false }: { label?: string; page?: boolean }) {
  return (
    <div className={page ? 'cardspin pageload' : 'cardspin'} role="status" aria-live="polite">
      <picture aria-hidden="true">
        <source srcSet="/card-spin.png" media="(prefers-reduced-motion: reduce)" />
        <img src="/card-spin.webp" alt="" width={94} height={140} />
      </picture>
      <p className="count">{label}</p>
    </div>
  );
}
