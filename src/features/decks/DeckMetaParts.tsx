import { useState } from 'react';
import { haptic } from '../../lib/haptics';
import { db, type Card, type Deck } from '../../lib/db';
import { type BracketCall } from '../../lib/deckstats';
import { guessCommander } from '../../lib/commander';
import { setCommander } from '../../lib/deckedit';
import { SHOWS, type Show } from '../../lib/arrange';
import { getDraftCheckpoint, setDraftCheckpoint, clearDraftCheckpoint } from '../../lib/drafts';
import { ChipPick } from '../../views/shared';

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
export type Grouping = 'type' | 'mv' | 'own' | 'none';
export const GROUPINGS: [Grouping, string][] = [
  ['type', 'CARD TYPE'],
  ['mv', 'MANA VALUE'],
  ['own', 'OWNED / MISSING'],
  ['none', 'NO GROUPS'],
];

/** A deck's own note and tags (saved on this device, synced on Push). */
export function DeckNotes({ deck }: { deck: Deck }) {
  const [tag, setTag] = useState('');
  const tags = deck.tags ?? [];
  const draftKey = `deck_note_${deck.id}`;
  const initialNote = getDraftCheckpoint<string>(draftKey) ?? deck.note ?? '';
  const [noteText, setNoteText] = useState(initialNote);

  const addTag = () => {
    const t = tag.trim().toLowerCase().slice(0, 30);
    if (t && !tags.includes(t)) db.decks.update(deck.id!, { tags: [...tags, t] });
    setTag('');
  };

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNoteText(val);
    setDraftCheckpoint(draftKey, val);
  };

  const handleNoteBlur = async () => {
    if (noteText !== (deck.note ?? '')) {
      await db.decks.update(deck.id!, { note: noteText });
    }
    clearDraftCheckpoint(draftKey);
  };

  return (
    <section className="decknotes" aria-label="Deck note and tags">
      <label className="notebook">
        <textarea
          aria-label="Deck note"
          rows={3}
          placeholder="game plan, who it's for, what to swap next_"
          value={noteText}
          onChange={handleNoteChange}
          onBlur={handleNoteBlur}
        />
      </label>
      <div className="tagrow">
        {tags.map((t) => (
          <button key={t} className="dtag" aria-label={`Remove tag ${t}`} onClick={() => db.decks.update(deck.id!, { tags: tags.filter((x) => x !== t) })}>
            #{t} <span aria-hidden="true">×</span>
          </button>
        ))}
        <input aria-label="New tag" placeholder="+ tag_" value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} onBlur={addTag} />
      </div>
    </section>
  );
}

/** GROUP and SHOW as the sheet's own chip rows (Nov 15 round 5): the panel holds no dropdown any more. */
export function GroupPick({ grouping, show, onGroup, onShow }: { grouping: Grouping; show: Show; onGroup: (g: Grouping) => void; onShow: (v: Show) => void }) {
  return (
    <>
      <ChipPick label="GROUP" value={grouping} options={GROUPINGS} onChange={onGroup} />
      <ChipPick label="SHOW" value={show} options={SHOWS} onChange={onShow} />
    </>
  );
}

/** Bracket estimate stamp; tap shows the reasons. */
export function BracketStat({ call, cedh }: { call: BracketCall; cedh?: boolean }) {
  const plus = cedh && call.bracket === 4;
  return (
    <details className="scrap bracket">
      <summary aria-label={`Estimated bracket ${call.bracket}${plus ? ' or 5, built from cEDH data' : ''}. Show why`}>
        <span className="k">BRACKET</span>
        <span className="bstamp">
          {ROMAN[call.bracket]}
          {plus && '+'}
        </span>
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </summary>
      <ul className="popnote">
        {plus && (
          <li>
            <b>IV+ · built from cEDH data</b>: forged from EDHREC's cEDH list, so it's meant for bracket 5 tables
          </li>
        )}
        {call.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
        {call.gameChangers.length > 0 && (
          <li>
            Game Changers: <b>{call.gameChangers.join(', ')}</b>
          </li>
        )}
        {call.combos.length > 0 && (
          <li>
            Two-card combos (Commander Spellbook): <b>{call.combos.map((c) => `${c.cards.join(' + ')}${c.early ? ' (early)' : ''}`).join(', ')}</b>
          </li>
        )}
        <li className="small">
          An estimate from the official bracket rules we can check: Game Changers, mass land denial, chained extra turns and two-card combos
          {call.combosChecked ? '' : ' (combo list still loading)'}. Bracket I vs II and V depend on how the deck is meant to play.
        </li>
      </ul>
    </details>
  );
}

/** A deck saved without a commander: suggest the likely one (one tap sets it); the card menu can set any card. */
export function PickCommander({ deck, cardOf }: { deck: Deck; cardOf: (name: string) => Card | undefined }) {
  const guess = guessCommander(deck.cards.map((c) => ({ name: c.name, card: cardOf(c.name) })));
  return (
    <aside className="shortalert pickcmdr" role="status">
      <b>▲ NO COMMANDER</b>{' '}
      {guess ? (
        <>
          This deck has no commander yet. It looks like <mark>{guess}</mark>.{' '}
          <button className="btn" onClick={() => (haptic('success'), setCommander(deck, guess))}>
            SET AS COMMANDER
          </button>
        </>
      ) : (
        'This deck has no commander yet. Right-click (or long-press) a card and choose Set as commander.'
      )}
    </aside>
  );
}

/** Mana curve: non-land cards by mana value (7 = 7+). */
export function Curve({ curve }: { curve: number[] }) {
  const max = Math.max(1, ...curve);
  return (
    <div className="curve" role="img" aria-label={`Mana curve: ${curve.map((n, i) => `${n} at ${i === 7 ? '7 or more' : i}`).join(', ')}`}>
      {curve.map((n, i) => (
        <span key={i} className="col">
          <span className="n">{n || ''}</span>
          <span className="bar" style={{ height: `${(n / max) * 100}%` }} />
          <span className="mv">{i === 7 ? '7+' : i}</span>
        </span>
      ))}
    </div>
  );
}
