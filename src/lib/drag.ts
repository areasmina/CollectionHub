import { haptic } from './haptics';

/**
 * Forge drag and drop. Where a card is dropped: on a deck card (swap), on the deck (add), or back on the
 * suggestions list (cut). Mouse uses the browser's drag and drop; touch holds 300 ms to pick a card up.
 */
export interface DropAt {
  card?: string; // a deck card under the pointer
  zone?: 'deck' | 'sugg';
}

export function dropAt(el: Element | null): DropAt {
  const h = el as HTMLElement | null;
  if (!h?.closest) return {};
  if (h.closest('.fsugg')) return { zone: 'sugg' };
  const deck = h.closest('.lists');
  if (!deck) return {};
  const card = h.closest<HTMLElement>('[data-card]')?.dataset.card;
  return { card, zone: 'deck' };
}

let lit: HTMLElement | null = null;
/** The yellow "⇄ DROP TO SWAP" outline on the deck card under the pointer (or the deck / list as a whole). */
export function lightUp(el: Element | null) {
  const h = el as HTMLElement | null;
  const t = (h?.closest?.('.lists [data-card]') ?? h?.closest?.('.lists') ?? h?.closest?.('.fsugg')) as HTMLElement | null;
  if (t === lit) return;
  lit?.classList.remove('dropover');
  lit = t;
  lit?.classList.add('dropover');
}
export const lightOff = () => lightUp(null);

export const DRAG_TYPE = 'text/x-card';
export const FROM_TYPE = 'text/x-from';

/** Mouse: start a browser drag of a card from the suggestions ('sugg') or the deck ('deck'). */
export function dragStart(e: React.DragEvent, name: string, from: 'sugg' | 'deck') {
  e.dataTransfer.setData(DRAG_TYPE, name);
  e.dataTransfer.setData(FROM_TYPE + '-' + from, '1'); // types are readable during dragover, values only on drop
  e.dataTransfer.effectAllowed = 'move';
  document.documentElement.classList.add('dragging');
}
export const dragEnd = () => (lightOff(), document.documentElement.classList.remove('dragging'));
export const fromOf = (e: React.DragEvent) => (e.dataTransfer.types.includes(FROM_TYPE + '-deck') ? 'deck' : 'sugg');

/**
 * Touch: hold 300 ms (with a buzz) to pick the card up; a ghost follows the finger, the page scrolls near the
 * top and bottom edges, and letting go drops it. Moving before the 300 ms is a normal scroll.
 */
export function holdToDrag(e: React.PointerEvent, opts: { label: string; img?: string; onDrop: (at: DropAt) => void }) {
  if (e.pointerType === 'mouse') return;
  const x0 = e.clientX;
  const y0 = e.clientY;
  let ghost: HTMLDivElement | null = null;
  let scroll = 0;
  let raf = 0;
  const cleanup = () => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    removeEventListener('pointermove', early);
    removeEventListener('pointerup', early2);
    removeEventListener('pointercancel', early2);
    document.removeEventListener('touchmove', move);
    document.removeEventListener('touchend', end);
    document.removeEventListener('touchcancel', cancel);
    ghost?.remove();
    ghost = null;
    lightOff();
    document.documentElement.classList.remove('dragging');
  };
  const early = (m: PointerEvent) => !ghost && Math.hypot(m.clientX - x0, m.clientY - y0) > 10 && cleanup();
  const early2 = () => !ghost && cleanup();
  const tick = () => {
    if (scroll) scrollBy(0, scroll);
    raf = requestAnimationFrame(tick);
  };
  const place = (x: number, y: number) => {
    if (!ghost) return;
    ghost.style.transform = `translate(${x - 40}px, ${y - 56}px) rotate(-4deg)`;
    scroll = y < 70 ? -12 : y > innerHeight - 90 ? 12 : 0;
    lightUp(document.elementFromPoint(x, y));
  };
  const move = (t: TouchEvent) => {
    t.preventDefault(); // while a card is held the page doesn't scroll by itself (the edges scroll it)
    const p = t.touches[0];
    if (p) place(p.clientX, p.clientY);
  };
  const end = (t: TouchEvent) => {
    const p = t.changedTouches[0];
    const at = p ? dropAt(document.elementFromPoint(p.clientX, p.clientY)) : {};
    cleanup();
    if (at.zone) opts.onDrop(at);
  };
  const cancel = () => cleanup();
  const timer = window.setTimeout(() => {
    haptic('open');
    ghost = document.createElement('div');
    ghost.className = 'dragghost';
    ghost.setAttribute('aria-hidden', 'true');
    if (opts.img) {
      const im = document.createElement('img');
      im.src = opts.img;
      im.alt = '';
      ghost.appendChild(im);
    } else ghost.textContent = opts.label;
    document.body.appendChild(ghost);
    document.documentElement.classList.add('dragging');
    place(x0, y0);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', cancel);
    raf = requestAnimationFrame(tick);
  }, 300);
  addEventListener('pointermove', early);
  addEventListener('pointerup', early2); // a held card is dropped on touchend, which comes after pointerup
  addEventListener('pointercancel', early2);
}
