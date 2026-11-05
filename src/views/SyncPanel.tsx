import { lazy, Suspense, useEffect, useState } from 'react';
import { syncNow } from '../lib/autosync';
import { changeCode, lastBackup, link, pull, push, turnOff, turnOn, undoPull } from '../lib/sync';
import { codeLink, prettyCode } from '../lib/synccode';
import { hasLegacySession, syncCode, useSyncState } from '../lib/syncstate';

// The old sign-in sync, loaded only on devices that still use it (or to bring data back from it).
const LegacyMove = lazy(() => import('./LegacyMove').then((m) => ({ default: m.LegacyMove })));

type Result = { cards: number; decks: number };

/** Sync between devices with a sync code: no account, no email. `incoming` = a code from a `#sync/<code>` link. */
export function SyncPanel({ onClose, incoming = '' }: { onClose: () => void; incoming?: string }) {
  const [code, setCode] = useState(syncCode);
  const [typed, setTyped] = useState('');
  const [ask, setAsk] = useState(incoming && incoming !== code ? incoming : '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const st = useSyncState();
  const [backupAt, setBackupAt] = useState<number | null>(null);
  const [legacy, setLegacy] = useState(hasLegacySession);
  useEffect(() => void lastBackup().then(setBackupAt), [busy]);

  const run = async (f: () => Promise<string | void>) => {
    setBusy(true);
    setMsg('');
    try {
      const m = await f();
      if (m) setMsg(m);
    } catch (e) {
      setMsg(`Failed: ${(e as Error).message}`);
    }
    setCode(syncCode());
    setBusy(false);
    void syncNow(); // refresh the status (and resume automatic sync after a conflict)
  };
  const counts = (r: Result) => `${r.cards} card entries, ${r.decks} decks`;
  const doLink = (raw: string) =>
    run(async () => {
      await link(raw);
      setAsk('');
      setTyped('');
      return 'This device is linked. It fetches your binders now, or asks which copy to keep if this device already has different ones.';
    });
  const share = code ? codeLink(code) : '';

  return (
    <div className="panel" role="region" aria-label="Sync">
      <button className="close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      <h2>SYNC BETWEEN DEVICES</h2>
      {ask && (
        <div className="syncstate conflict" role="alert">
          <b>Link this device with the sync code from your link?</b> {code ? 'This device stops using its current code. ' : ''}If this device already has different binders, you'll pick which copy to keep.
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => doLink(ask)}>
              LINK THIS DEVICE
            </button>
            <button className="btn secondary" onClick={() => setAsk('')}>
              NOT NOW
            </button>
          </div>
        </div>
      )}
      {!code ? (
        <>
          <p className="muted">Right now your binders and decks are saved on this device only. Turn on sync to use them on your phone, computer and any browser.</p>
          {/* Still signed in to the old sync: "Move to sync code" (below) turns sync on, after fetching the old copy if it's newer. */}
          {!legacy && (
            <div className="row">
              <button className="btn" disabled={busy} onClick={() => run(async () => void (await turnOn()))}>
                TURN ON SYNC
              </button>
            </div>
          )}
          <p className="muted">Already turned it on somewhere else? Enter that sync code or paste its link:</p>
          <form className="row" onSubmit={(e) => (e.preventDefault(), doLink(typed))}>
            <input placeholder="xxxx-xxxx-xxxx-xxxx-xxxx" autoCapitalize="off" autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Sync code" />
            <button className="btn" type="submit" disabled={busy || !typed.trim()}>
              LINK
            </button>
          </form>
          <p className="muted small">No account, email or password. Your sync code is the key: it also encrypts your binders before they leave this device, so only your own devices can read them.</p>
        </>
      ) : (
        <>
          {st.status === 'conflict' ? (
            <div className="syncstate conflict" role="alert">
              <b>Pick which copy to keep.</b> {st.msg} Automatic sync is paused so nothing gets overwritten.
              <div className="row">
                <button className="btn" disabled={busy} onClick={() => run(async () => `Kept this device: ${counts(await push({ force: true }))}.`)}>
                  KEEP THIS DEVICE
                </button>
                <button className="btn secondary" disabled={busy} onClick={() => confirm("Replace both binders and decks on this device with the cloud copy? (Undo last pull can put this device's copy back.)") && run(async () => `Kept the cloud copy: ${counts(await pull())}.`)}>
                  KEEP THE CLOUD
                </button>
              </div>
            </div>
          ) : (
            <p className="syncstate" role="status">
              <span className={`syncdot s-${st.status}`} aria-hidden="true" />
              {st.status === 'synced' ? `Up to date · ${new Date(st.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : st.status === 'syncing' ? 'Syncing…' : st.status === 'offline' ? 'Offline: will sync when back online' : st.status === 'error' ? `Sync failed: ${st.msg}` : 'Starting…'}
              {st.status !== 'syncing' && (
                <button className="linkbtn" onClick={() => void syncNow()}>
                  sync now
                </button>
              )}
            </p>
          )}
          <p className="muted">Changes sync on their own: edits here go up a few seconds later, edits from your other devices come down when you open the app. To add another device, open this link on it, or type the code there:</p>
          <div className="synccode" aria-label="Your sync code">
            {prettyCode(code)}
          </div>
          <div className="row">
            <button className="btn" onClick={() => navigator.clipboard?.writeText(share).then(() => setMsg('Link copied. Open it on your other device.'), () => setMsg(share))}>
              COPY LINK
            </button>
            {'share' in navigator && (
              <button className="btn secondary" onClick={() => navigator.share({ title: 'DeckMage sync', url: share }).catch(() => {})}>
                SHARE
              </button>
            )}
          </div>
          <p className="muted small">
            Only share this code with your own devices: anyone with it can see and change your binders. Keep a copy somewhere safe, because the code is the only key. Lose it on every device and the cloud copy can't be opened (each device still keeps its own copy).
          </p>
          <div className="row">
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => confirm('Make a new sync code? The old code stops working on every device; link your other devices again with the new one.') && run(async () => (await changeCode(), 'New code made. Link your other devices with it.'))}
            >
              CHANGE CODE
            </button>
            <button className="btn secondary" disabled={busy} onClick={() => confirm('Turn off sync on this device? Your binders and decks stay here, and your other devices keep syncing.') && run(async () => (turnOff(), 'Sync is off on this device.'))}>
              TURN OFF ON THIS DEVICE
            </button>
          </div>
        </>
      )}
      {backupAt && (
        <div className="row">
          <button className="btn secondary" disabled={busy} onClick={() => confirm(`Put back this device's binders and decks from before the last Pull (${new Date(backupAt).toLocaleString()})?`) && run(async () => `Restored: ${counts(await undoPull())}.`)}>
            UNDO LAST PULL
          </button>
        </div>
      )}
      {(legacy || (!code && import.meta.env.VITE_SUPABASE_URL)) && (
        <Suspense fallback={null}>
          <LegacyMove hasCode={!!code} onSignedIn={() => setLegacy(true)} onDone={(m) => (setCode(syncCode()), setMsg(m), void syncNow())} />
        </Suspense>
      )}
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}
