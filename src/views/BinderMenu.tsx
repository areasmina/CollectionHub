import { useState } from 'react';
import { db, type Card, type Entry } from '../lib/db';
import { haptic } from '../lib/haptics';
import { slug } from '../lib/names';
import { shopUrl } from '../lib/prices';
import { flipEntryCopy } from '../lib/printings';
import { PointMenu } from './PointMenu';
import { scryfallUrl } from './shared';

/** Right-click / press-and-hold menu for a card in the binder: the same kind of menu the deck page has for its cards. */
export function BinderMenu({ e, card, at, onPrint, onClose }: { e: Entry; card?: Card; at: { x: number; y: number }; onPrint: () => void; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const act = (f: () => unknown) => () => (onClose(), f());
  const noFoil = !e.foil && !!card && !card.usdFoil; // Scryfall has no foil price for this printing: no foil version
  const link = (href: string, text: string) => (
    <li>
      <a href={href} target="_blank" rel="noreferrer" onClick={onClose}>
        {text} ↗
      </a>
    </li>
  );
  return (
    <PointMenu title={e.name} at={at} onClose={onClose}>
      <li>
        <button role="menuitem" onClick={act(() => (haptic('open'), onPrint()))}>
          ◧ Change set / art
          <small>{e.set ? ` · now ${e.set.toUpperCase()} #${e.cn ?? '?'}` : ' · no set yet'}</small>
        </button>
      </li>
      <li>
        <button role="menuitem" disabled={noFoil} onClick={act(() => (haptic('success'), flipEntryCopy(e)))}>
          {e.foil ? 'Switch one copy to non-foil' : '✦ Switch one copy to foil'}
          <small>{noFoil ? ' · no foil version of this printing' : e.qty > 1 ? ` · 1 of ${e.qty}` : ''}</small>
        </button>
      </li>
      <li>
        <button
          role="menuitem"
          onClick={() =>
            navigator.clipboard
              ?.writeText(e.name)
              .then(() => setCopied(true))
              .then(() => setTimeout(onClose, 600))
          }
        >
          {copied ? 'Copied ✓' : 'Copy card name'}
        </button>
      </li>
      {link(shopUrl(e.name), 'Open in shop')}
      {link(`https://edhrec.com/cards/${slug(e.name.split(' // ')[0])}`, 'Open on EDHREC')}
      {link(scryfallUrl(e.name), 'Open on Scryfall')}
      <li className="sep" />
      <li className="qtyrow">
        <span>Copies: {e.qty}</span>
        <button aria-label="One copy fewer" disabled={e.qty <= 1} onClick={() => (haptic('tap'), db.entries.update(e.id!, { qty: Math.max(1, e.qty - 1) }))}>
          −
        </button>
        <button aria-label="One copy more" onClick={() => (haptic('tap'), db.entries.update(e.id!, { qty: Math.min(999, e.qty + 1) }))}>
          +
        </button>
      </li>
      <li>
        <button role="menuitem" className="danger" onClick={act(() => confirm(`Remove ${e.name} from this binder?`) && (haptic('warn'), db.entries.delete(e.id!)))}>
          ✕ Remove from this binder
        </button>
      </li>
    </PointMenu>
  );
}
