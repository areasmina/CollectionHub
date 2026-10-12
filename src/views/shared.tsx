import { statusOf } from '../lib/compare';
import type { Card } from '../lib/db';

export interface Shared {
  profile: number;
  mine: Map<string, number>;
  other: Map<string, number>;
  otherName: string;
}

/** A card line: owned normal, missing greyed, "in <other binder>" labelled. */
export const usd = (c?: Card) => (c?.usd ? `$${Number(c.usd).toFixed(2)}` : c?.eur ? `€${Number(c.eur).toFixed(2)}` : '');

/** USD total × quantity; cards without a USD price are left out. */
export const priceSum = (items: { card?: Card; qty: number }[]) => items.reduce((n, i) => n + Number(i.card?.usd ?? 0) * i.qty, 0);
export const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CardLine({ name, img, card, s, right }: { name: string; img?: string; card?: Card; s: Shared; right?: React.ReactNode }) {
  const st = statusOf(name, s.mine, s.other);
  const src = card?.img ?? img;
  const price = usd(card);
  return (
    <li className={`card ${st}`}>
      {src ? <img src={src} alt="" loading="lazy" width={36} height={50} /> : <span className="noimg" />}
      <span className="cname">
        {name}
        {card?.mana && <small className="mana"> {card.mana}</small>}
        {st === 'other' && <small className="tag">in {s.otherName}</small>}
        {st === 'missing' && <span className="sr">(missing)</span>}
      </span>
      {(right || price) && (
        <span className="right">
          {right}
          {price && (card?.buy ? <a className="price" href={card.buy} target="_blank" rel="noreferrer">{price}</a> : <small className="price">{price}</small>)}
        </span>
      )}
    </li>
  );
}

export function Seg({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      <span className="seglabel">{label}</span>
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export const Progress = ({ done, total }: { done: number; total: number }) => (
  <div className="progress">
    <progress value={done} max={total || 1} /> <span>{total ? `Looking up cards on Scryfall: ${done} / ${total}` : 'Reading…'}</span>
  </div>
);
