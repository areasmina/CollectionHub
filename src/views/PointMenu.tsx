import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Tape } from './zine';

/** The taped-note menu that opens at the spot you right-clicked / held (a bottom sheet on phones; see .cardmenu).
 *  Kept on screen, closes on Escape, scroll, or a tap outside. */
export function PointMenu({ title, at, onClose, children }: { title: string; at: { x: number; y: number }; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y });
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(at.x, innerWidth - r.width - 8)), top: Math.max(8, Math.min(at.y, innerHeight - r.height - 8)) });
  }, [at.x, at.y]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', key);
    addEventListener('scroll', onClose, { passive: true });
    return () => (removeEventListener('keydown', key), removeEventListener('scroll', onClose));
  }, []);
  // At the top level of the page: the tab bar sits above anything inside the page content.
  return createPortal(
    <>
      <div className="backdrop menuback" onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />
      <div ref={ref} className="cardmenu" role="menu" aria-label={`${title} options`} style={pos}>
        <Tape style={{ top: -11, left: '42%', width: 70, height: 22, transform: 'rotate(4deg)' }} />
        <div className="mh">{title}</div>
        <ul>{children}</ul>
      </div>
    </>,
    document.body,
  );
}
