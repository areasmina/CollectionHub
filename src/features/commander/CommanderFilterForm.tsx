import { useState } from 'react';
import type { CardSynergyMatch } from '../../brain/themes';
import { statusOf } from '../../lib/compare';
import type { Card } from '../../lib/db';
import { filterWebUrl, imgOf, pagePath, type CardFilter, type EdhCard, type EdhPage } from '../../lib/edhrec';
import { haptic } from '../../lib/haptics';
import { norm } from '../../lib/names';
import type { Pins } from '../../lib/pins';

type AutocompleteCandidate = EdhCard | Card;

interface PinAutocompleteFieldProps {
  tab: string;
  value: string;
  placeholder: string;
  ariaLabel: string;
  focused: boolean;
  candidates: AutocompleteCandidate[];
  mine: Map<string, number>;
  cardByName: (n: string) => Card | undefined;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onPick: (name: string) => void;
}

/** Shared autocomplete input + visual card-glance popover for PIN and WITHOUT filters. */
function PinAutocompleteField({
  tab,
  value,
  placeholder,
  ariaLabel,
  focused,
  candidates,
  mine,
  cardByName,
  onChange,
  onFocus,
  onBlur,
  onPick,
}: PinAutocompleteFieldProps) {
  const q = norm(value);
  const matches =
    focused && value.trim().length >= 2
      ? candidates
          .filter((c, idx, arr) => arr.findIndex((x) => norm(x.name) === norm(c.name)) === idx)
          .filter((c) => norm(c.name).includes(q) || (('type' in c && typeof c.type === 'string' ? c.type : cardByName(c.name)?.type) ?? '').toLowerCase().includes(q))
          .slice(0, 8)
      : [];

  return (
    <div className="cglance-wrap">
      <label className="sbox">
        <span className="tab">{tab}</span>
        <input
          list="cfnames"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          aria-label={ariaLabel}
        />
      </label>
      {matches.length > 0 && (
        <div className="cglance-popover" role="listbox">
          {matches.map((m) => {
            const id = 'id' in m ? m.id : undefined;
            const img = ('img' in m && m.img) || imgOf(id, 'small');
            const isOwned = statusOf(m.name, mine) === 'owned';
            const sub = ('type' in m && typeof m.type === 'string' ? m.type : cardByName(m.name)?.type) ?? 'Card';
            return (
              <div
                key={m.name}
                className="cglance-item"
                role="option"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(m.name);
                  haptic('select');
                }}
              >
                {img && <img src={img} alt="" className="cglance-thumb" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                <div className="cglance-meta">
                  <span className="cglance-name">{m.name}</span>
                  <span className="cglance-sub">{sub}</span>
                </div>
                {isOwned && <span className="cglance-badge">✓ OWNED</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface CommanderFilterFormProps {
  cf: CardFilter;
  cfDraft: { inc: string; exc: string };
  pins: Pins;
  recCard: Map<string, EdhCard>;
  binder: Card[];
  mine: Map<string, number>;
  filtered: { page: EdhPage; applied: boolean; pins?: boolean } | null;
  slug: string;
  bracket: string;
  tag: string;
  budget: string;
  synergyHint: CardSynergyMatch | null;
  cardByName: (n: string) => Card | undefined;
  onDraftChange: (next: { inc: string; exc: string }) => void;
  onApply: (cf: CardFilter) => void;
  onPin: (card: string, side: 'in' | 'out') => Promise<void> | void;
  onTuneSynergy: (hint: CardSynergyMatch) => void;
}

/** PIN / WITHOUT filter form, active pin chips, EDHREC filter status, and synergy auto-tune banner. */
export function CommanderFilterForm({
  cf,
  cfDraft,
  pins,
  recCard,
  binder,
  mine,
  filtered,
  slug,
  bracket,
  tag,
  budget,
  synergyHint,
  cardByName,
  onDraftChange,
  onApply,
  onPin,
  onTuneSynergy,
}: CommanderFilterFormProps) {
  const [cfFocus, setCfFocus] = useState<'inc' | 'exc' | null>(null);
  const candidates: AutocompleteCandidate[] = [...recCard.values(), ...binder];

  return (
    <form
      id="cfilter-form"
      className="cfilter"
      onSubmit={(e) => {
        e.preventDefault();
        haptic('select');
        const inc = cfDraft.inc.trim();
        const exc = cfDraft.exc.trim();
        if (inc && !pins.in.includes(inc)) void onPin(inc, 'in');
        if (exc && !pins.out.includes(exc)) void onPin(exc, 'out');
        setCfFocus(null);
        onApply({ inc: inc ? [inc] : [], exc: exc ? [exc] : [] });
      }}
    >
      <div className="cf-row">
        <PinAutocompleteField
          tab="PIN"
          value={cfDraft.inc}
          placeholder="card in the deck_"
          ariaLabel="Pin card in deck"
          focused={cfFocus === 'inc'}
          candidates={candidates}
          mine={mine}
          cardByName={cardByName}
          onChange={(inc) => onDraftChange({ ...cfDraft, inc })}
          onFocus={() => setCfFocus('inc')}
          onBlur={() => setTimeout(() => setCfFocus(null), 200)}
          onPick={(name) => {
            onDraftChange({ ...cfDraft, inc: name });
            setCfFocus(null);
          }}
        />
        <PinAutocompleteField
          tab="WITHOUT"
          value={cfDraft.exc}
          placeholder="card left out_"
          ariaLabel="Card left out"
          focused={cfFocus === 'exc'}
          candidates={candidates}
          mine={mine}
          cardByName={cardByName}
          onChange={(exc) => onDraftChange({ ...cfDraft, exc })}
          onFocus={() => setCfFocus('exc')}
          onBlur={() => setTimeout(() => setCfFocus(null), 200)}
          onPick={(name) => {
            onDraftChange({ ...cfDraft, exc: name });
            setCfFocus(null);
          }}
        />
      </div>
      <datalist id="cfnames">
        {[...recCard.values()].slice(0, 300).map((c) => (
          <option key={c.name} value={c.name} />
        ))}
      </datalist>
      {pins.in.length + pins.out.length > 0 && (
        <div className="cf-pins" role="group" aria-label="Pinned and excluded cards">
          {pins.in.map((n) => (
            <button key={'in' + n} type="button" className="u-chip pinchip in" onClick={() => (haptic('undo'), onPin(n, 'in'))} aria-label={`Unpin ${n}`} title="Tap to unpin">
              PIN {n} ×
            </button>
          ))}
          {pins.out.map((n) => (
            <button key={'out' + n} type="button" className="u-chip pinchip out" onClick={() => (haptic('undo'), onPin(n, 'out'))} aria-label={`Remove exclusion for ${n}`} title="Tap to remove">
              WITHOUT {n} ×
            </button>
          ))}
        </div>
      )}
      {(cf.inc.length > 0 || cf.exc.length > 0) && (
        <p className="small cfnote" role="status">
          {!filtered
            ? 'Asking EDHREC…'
            : filtered.applied
              ? `Suggestions from ${filtered.page.numDecks?.toLocaleString()} EDHREC decks${cf.inc.length ? ` with ${cf.inc.join(', ')}` : ''}${cf.exc.length ? ` without ${cf.exc.join(', ')}` : ''}.`
              : `EDHREC didn't filter this page from the app${cf.inc.length ? `; ${cf.inc.join(', ')} is pinned in your deck` : ''}${cf.exc.length ? `; ${cf.exc.join(', ')} is left out of your suggestions` : ''}.`}{' '}
          <a href={filterWebUrl(pagePath('commander', slug, bracket, tag, budget), cf)} target="_blank" rel="noreferrer">
            Open filtered on EDHREC ↗
          </a>
        </p>
      )}
      {synergyHint && (
        <div className="synergy-autotune-card" role="region" aria-label="Synergy recommendation">
          <div className="syn-info">
            <span className="syn-badge">SYNERGY DETECTED</span>
            <p>
              <strong>{synergyHint.card}</strong> {synergyHint.explanation}!
            </p>
          </div>
          <button
            type="button"
            className="syn-btn"
            onClick={() => {
              haptic('success');
              onTuneSynergy(synergyHint);
            }}
          >
            TUNE DECK TO THIS SYNERGY
          </button>
        </div>
      )}
    </form>
  );
}
