import { useEffect, useState } from 'react';
import { haptic } from '../lib/haptics';
import { AHEAD, browserDeps, clearPics, picCounts, saveAhead } from '../lib/offlinepics';
import { deckPicUrls } from '../lib/deckpics';
import { cardListAt } from '../lib/cardlist';

/** OFFLINE PICTURES, in the sync drawer (Phase 5B): how many card pictures this device keeps, the space they take,
 *  SAVE MY DECKS NOW (the small picture of every card in your decks) and CLEAR. Pictures only: binders and decks are never
 *  touched here. */
export function OfflinePics() {
  const d = browserDeps();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [mb, setMb] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const refresh = async () => {
    if (!d) return;
    setCounts(await picCounts(d.open).catch(() => null));
    const est = (await navigator.storage?.estimate?.().catch(() => undefined)) as (StorageEstimate & { usageDetails?: { caches?: number } }) | undefined;
    setMb(est?.usageDetails?.caches != null ? Math.round(est.usageDetails.caches / 1e6) : null);
  };
  useEffect(() => void refresh(), []);
  if (!d) return null;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const saveNow = async () => {
    haptic('tap');
    setMsg('');
    setBusy('save');
    try {
      const r = await saveAhead(
        await deckPicUrls(),
        d,
        { force: true, onProgress: (done, all) => setBusy(`save ${done}/${all}`) },
      );
      setMsg('stopped' in r && r.stopped ? `Saved ${r.saved}; the connection dropped. It carries on next time.` : `Done: every card in your decks shows offline (${r.saved} new).`);
      haptic('success');
    } catch (e) {
      setMsg(`Couldn't save pictures: ${(e as Error).message}`);
    }
    setBusy('');
    void refresh();
  };
  const clear = async () => {
    if (!confirm('Remove every saved card picture from this device? Your binders and decks stay. Pictures download again as you look at them.')) return;
    haptic('tap');
    setBusy('clear');
    await clearPics((n) => caches.delete(n), d.set).catch(() => {});
    setBusy('');
    setMsg('Saved pictures removed.');
    void refresh();
  };
  return (
    <section className="id-sync-offline" aria-label="Offline card pictures">
      <div className="id-sync-label-row">
        <span className="id-sync-code-label">OFFLINE PICTURES</span>
        <span className="id-sync-privacy">{counts ? `${total.toLocaleString()} saved${mb != null ? ` · ${mb} MB` : ''}` : '…'}</span>
      </div>
      <p className="id-sync-desc">
        Pictures you look at stay on this device, up to about 100 MB, oldest first. On Wi-Fi, the small picture of every card in your decks is saved too ({(counts?.[AHEAD] ?? 0).toLocaleString()} now), so your decks show offline.
      </p>
      <p className="id-sync-desc id-sync-cardlist">
        {cardListAt()
          ? `Card list saved ${new Date(cardListAt()).toLocaleDateString([], { month: 'short', day: 'numeric' })}: imports and syncs know every card even without Scryfall.`
          : 'Card list: saved on the next Wi-Fi visit to Collection, so imports and syncs work without Scryfall.'}
      </p>
      <div className="id-sync-act-row">
        <button type="button" className="id-btn-act" disabled={!!busy} onClick={saveNow}>
          {busy.startsWith('save') ? `SAVING${busy.slice(4) ? ` ${busy.slice(5)}` : '…'}` : 'SAVE MY DECKS NOW'}
        </button>
        <button type="button" className="id-btn-act danger" disabled={!!busy || !total} onClick={clear}>
          CLEAR
        </button>
      </div>
      {msg && (
        <p className="id-sync-desc" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}
