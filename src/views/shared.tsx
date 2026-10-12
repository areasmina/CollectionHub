import { statusOf } from '../lib/compare';

export interface Shared {
  profile: number;
  mine: Map<string, number>;
  other: Map<string, number>;
  otherName: string;
}

/** A card line: owned normal, missing greyed, "in <other binder>" labelled. */
export function CardLine({ name, img, s, right }: { name: string; img?: string; s: Shared; right?: React.ReactNode }) {
  const st = statusOf(name, s.mine, s.other);
  return (
    <li className={`card ${st}`}>
      {img ? <img src={img} alt="" loading="lazy" width={36} height={50} /> : <span className="noimg" />}
      <span className="cname">
        {name}
        {st === 'other' && <small className="tag">in {s.otherName}</small>}
        {st === 'missing' && <span className="sr">(missing)</span>}
      </span>
      {right && <span className="right">{right}</span>}
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
