import { useMemo, useState } from 'react';
import { importCollection, importDeck, type ImportResult } from '../../lib/actions';
import { haptic } from '../../lib/haptics';
import { parseImport } from '../../lib/importers';
import { freeDeckName, openDeck } from '../../lib/nav';
import { SAMPLE_COLLECTION } from '../../lib/sample';
import { Progress } from '../../views/shared';

/** Files larger than this (about 5,000 lines) are held aside instead of being shown in the text box. */
const BIG_FILE = 200_000;

export function ImportReport({ r, deck }: { r: ImportResult; deck?: boolean }) {
  return (
    <div className="report" role="status">
      <p>
        {deck ? (
          <>Saved deck ({r.added} cards in deck — none added to your collection).</>
        ) : (
          <>
            Read as <b>{r.format === 'manabox' ? 'ManaBox CSV' : r.format === 'csv' ? 'CSV' : 'text list'}</b>: {r.added.toLocaleString()} cards added.
          </>
        )}
      </p>
      {!!r.failed?.length && (
        <p className="error">
          Scryfall kept refusing for several minutes, so {r.failed.length.toLocaleString()} {r.failed.length === 1 ? 'card was' : 'cards were'} not looked up yet. The rest are saved. The box now holds
          just those cards: press + ADD again in a few minutes and it picks up where it stopped.
        </p>
      )}
      {r.unmatched.length > 0 && (
        <details>
          <summary className="error">
            {r.unmatched.length} {r.unmatched.length === 1 ? 'name' : 'names'} Scryfall couldn't find (not added)
          </summary>
          <ul>
            {r.unmatched.map((u, i) => (
              <li key={i}>
                {u.qty} {u.name}
                {u.set && ` (${u.set}${u.cn ? ' ' + u.cn : ''})`}
              </li>
            ))}
          </ul>
        </details>
      )}
      {r.errors.length > 0 && (
        <details>
          <summary className="error">{r.errors.length} lines skipped</summary>
          <ul>
            {r.errors.map((e) => (
              <li key={e.line}>
                Line {e.line}: {e.reason} — <code>{e.text}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export interface ImportModalProps {
  profile: number;
  name: string;
  entriesCount: number;
  onClose: () => void;
}

export function ImportModal({ profile, name, entriesCount, onClose }: ImportModalProps) {
  const [text, setText] = useState('');
  const [big, setBig] = useState<{ name: string; text: string; lines: number } | null>(null);
  const [busy, setBusy] = useState<{ done: number; total: number; wait?: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const deckLike = useMemo(() => {
    if (!text.trim()) return false;
    const p = parseImport(text);
    return p.format === 'text' && p.rows.some((r) => /^(commanders?|companion|deck|main|mainboard|maindeck|sideboard|side|maybe|maybeboard|considering)$/i.test(r.section ?? ''));
  }, [text]);
  const input = big?.text ?? text;

  async function run(raw: string, replace: boolean) {
    if (replace && entriesCount && !confirm(`Replace all ${entriesCount} entries in ${name}?`)) return;
    setError('');
    setResult(null);
    setBusy({ done: 0, total: 0 });
    try {
      const r = await importCollection(profile, raw, replace, (done, total, wait) => setBusy({ done, total, wait }));
      setResult(r);
      setBig(null);
      setText((r.failed ?? []).map((f) => `${f.qty} ${f.name}${f.set && f.cn ? ` (${f.set.toUpperCase()}) ${f.cn}` : ''}${f.foil ? ' *F*' : ''}`).join('\n'));
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}. Nothing was lost; try again.`);
    }
    setBusy(null);
  }

  async function saveAsDeckInstead() {
    setError('');
    setResult(null);
    setBusy({ done: 0, total: 0 });
    try {
      const p = parseImport(text);
      const cmdrRow = p.rows.find((r) => /commander/i.test(r.section ?? '')) ?? p.rows[0];
      const baseName = cmdrRow ? `${cmdrRow.name.split(' // ')[0]} deck` : 'Imported deck';
      const deckName = await freeDeckName(profile, baseName);
      const r = await importDeck(profile, deckName, text, (done, total) => setBusy({ done, total }));
      setText('');
      haptic('success');
      openDeck(r.deck.name);
    } catch (e) {
      setError(`Deck import failed: ${(e as Error).message}`);
    }
    setBusy(null);
  }

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="importbox-pop note-pop" role="dialog" aria-modal="true" aria-label="Import cards" onClick={(e) => e.stopPropagation()}>
        <div className="nh">
          <span>
            IMPORT <mark>CARDS</mark>
          </span>
          <button type="button" className="close" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>
        <section className="importbox importrow">
          <p className="ihelp">
            Add cards you own to <b>{name}</b>: ManaBox CSV, a CSV with name/quantity columns, or a card list ("1 Sol Ring"). To add a deck without adding its cards to your collection, use <b>+ DECK</b>.
          </p>
          <label className="u-btn file">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M3 12 V15 H15 V12 M9 3 V11 M5 7 L9 3 L13 7" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            CHOOSE A FILE
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              disabled={!!busy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                const t = await f.text();
                setResult(null);
                if (t.length > BIG_FILE) (setBig({ name: f.name, text: t, lines: t.split('\n').filter((l) => l.trim()).length }), setText(''));
                else (setBig(null), setText(t));
              }}
            />
          </label>
          {big ? (
            <p className="ibig" role="status">
              <b>{big.name}</b> is ready: {big.lines.toLocaleString()} lines. Press + ADD.{' '}
              <button type="button" className="u-btn ghost" disabled={!!busy} onClick={() => setBig(null)}>
                REMOVE FILE
              </button>
            </p>
          ) : (
            <label className="ipaste">
              <span>…or paste cards you own</span>
              <textarea rows={6} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder={'1 Sol Ring\n1x Arcane Signet (CMM) 375_'} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            </label>
          )}
          {deckLike && (
            <div className="deckwarn" role="status">
              <span>
                <b>▲ Looks like a deck list.</b> Adding here puts every card into your <b>{name}</b> collection. Decks never add cards to your collection:
              </span>
              <button type="button" className="u-btn" disabled={!!busy} onClick={() => void saveAsDeckInstead()}>
                SAVE AS A DECK INSTEAD →
              </button>
            </div>
          )}
          <div className="ibtns">
            <button className="u-btn primary" disabled={!input.trim() || !!busy} onClick={() => run(input, false)}>
              + ADD
            </button>
            <button className="u-btn" disabled={!input.trim() || !!busy} onClick={() => run(input, true)} title={`Replace every card in ${name} with this list`}>
              REPLACE
            </button>
            <button type="button" className="u-btn ghost" onClick={onClose}>
              CANCEL
            </button>
          </div>
          {entriesCount === 0 && !text.trim() && !busy && !result && (
            <p className="ihelp isample">
              No list at hand?{' '}
              <button type="button" className="u-btn ghost" onClick={() => (haptic('select'), setText(SAMPLE_COLLECTION))}>
                TRY A SAMPLE COLLECTION
              </button>{' '}
              60 common cards around three commanders. Nothing is saved until you press + ADD; RESET empties the binder again.
            </p>
          )}
          {busy && <Progress {...busy} />}
          {error && <p className="error">{error}</p>}
          {result && <ImportReport r={result} />}
        </section>
      </div>
    </>
  );
}
