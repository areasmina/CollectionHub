import { useEffect, useRef, useState } from 'react';
import { haptic } from '../../lib/haptics';
import { setForgeCube, setForgeIsland } from '../../lib/nav';
import { cad, shopUrl } from '../../lib/prices';

/** Focus mode on the whole page while `on` (the nav and the page decoration step back). */
export function useForgeMode(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const el = document.documentElement;
    el.classList.add('forging');
    return () => el.classList.remove('forging');
  }, [on]);
}

/** Leave the Forge with Esc (unless a window is open on top) and undo the last change with Ctrl/Cmd+Z. */
function useForgeKeys(onLeave: () => void, onUndo?: () => void) {
  const live = useRef({ onLeave, onUndo });
  live.current = { onLeave, onUndo };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select');
      const over = document.querySelector('.swapnote, .note-pop, .cmenu, .leavenote, [role="dialog"], [role="alertdialog"]');
      if (e.key === 'Escape' && !over && !typing) return live.current.onLeave();
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing && live.current.onUndo) {
        e.preventDefault();
        haptic('undo');
        live.current.onUndo();
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);
}

/** The Forge's live assistant state: synced into the Dynamic Island instead of hanging mid-page. */
export function ForgeTop({
  label,
  sub,
  undo,
  onLeave,
  onSave,
  saving,
  reserved,
}: {
  label: string;
  sub?: string;
  undo?: { text: string; run: () => void };
  onLeave: () => void;
  onSave?: () => void;
  saving?: boolean;
  reserved?: boolean;
}) {
  useForgeKeys(onLeave, undo?.run);
  useEffect(() => {
    setForgeIsland({ label, sub, undo, onLeave, onSave, saving, reserved });
  }, [label, sub, undo, onLeave, onSave, saving, reserved]);
  useEffect(() => () => setForgeIsland(null), []);
  return null;
}

const FACES = [
  ['.lists', 'CARDS'],
  ['.forge-analysis', 'ANALYSIS'],
  ['.forge-buy', 'TO BUY'],
] as const;

export function ForgeCube({ grid, buyCount }: { grid: { current: HTMLElement | null }; buyCount?: number }) {
  const [face, setFace] = useState(0);
  const bar = useRef<HTMLDivElement>(null);
  const faceRef = useRef(0);
  useEffect(() => {
    const g = grid.current;
    if (!g) return;
    const phone = matchMedia('(max-width: 700px)');
    const paneOf = (i: number) => g.querySelector<HTMLElement>(`:scope > ${FACES[i][0]}`);
    const fit = () => {
      if (!phone.matches) return void (g.style.height = '');
      const p = paneOf(faceRef.current);
      if (p) g.style.height = `${p.offsetHeight}px`;
    };
    const sync = () => {
      if (!phone.matches) return;
      let best = 0;
      FACES.forEach((_, i) => {
        const p = paneOf(i);
        const b = paneOf(best);
        if (p && b && Math.abs(p.offsetLeft - g.scrollLeft) < Math.abs(b.offsetLeft - g.scrollLeft)) best = i;
      });
      if (best !== faceRef.current) {
        faceRef.current = best;
        setFace(best);
        haptic('select');
        const top = bar.current?.getBoundingClientRect().top ?? 0;
        if (top < 0) bar.current?.scrollIntoView({ block: 'start' });
      }
      fit();
    };
    let t = 0;
    const onScroll = () => (clearTimeout(t), (t = window.setTimeout(sync, 60)));
    g.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(fit);
    FACES.forEach((_, i) => {
      const p = paneOf(i);
      if (p) ro.observe(p);
    });
    phone.addEventListener('change', fit);
    fit();
    return () => {
      clearTimeout(t);
      g.removeEventListener('scroll', onScroll);
      ro.disconnect();
      phone.removeEventListener('change', fit);
      g.style.height = '';
    };
  }, [grid]);
  const go = (i: number) => {
    const g = grid.current;
    const p = g?.querySelector<HTMLElement>(`:scope > ${FACES[i][0]}`);
    if (!g || !p) return;
    haptic('select');
    faceRef.current = i;
    setFace(i);
    g.style.height = `${p.offsetHeight}px`;
    g.scrollTo({ left: p.offsetLeft, behavior: 'smooth' });
    const top = bar.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) bar.current?.scrollIntoView({ block: 'start' });
  };
  useEffect(() => {
    setForgeCube({ face, buyCount, onFace: go });
  }, [face, buyCount]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setForgeCube(null), []);
  return null;
}

/** The cube's TO BUY face on a saved deck: the cards you don't own, cheapest first, each price a shop link. */
export function BuyList({ items, binder }: { items: { name: string; qty: number; cad?: number }[]; binder: string }) {
  const total = items.reduce((n, c) => n + (c.cad ?? 0) * c.qty, 0);
  const rows = [...items].sort((a, b) => (a.cad ?? 1e9) - (b.cad ?? 1e9) || a.name.localeCompare(b.name));
  return (
    <section className="fbuylist" aria-label="To buy">
      <h3>
        TO BUY{' '}
        <small>
          {items.reduce((n, c) => n + c.qty, 0)} cards{total > 0 ? ` · ≈${cad(total)}` : ''}
        </small>
      </h3>
      {rows.length === 0 ? (
        <p className="fbuy-none">Nothing to buy: every card is in {binder}.</p>
      ) : (
        <ul>
          {rows.map((c) => (
            <li key={c.name}>
              <span className="nm">
                {c.qty > 1 ? `${c.qty}× ` : ''}
                {c.name}
              </span>
              {c.cad != null ? (
                <a className="u-sticker" href={shopUrl(c.name)} target="_blank" rel="noreferrer" title={`Find ${c.name} in a shop`}>
                  ≈{cad(c.cad)}
                </a>
              ) : (
                <a className="fbuy-find" href={shopUrl(c.name)} target="_blank" rel="noreferrer">
                  FIND ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
