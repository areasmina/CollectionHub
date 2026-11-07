import { useEffect, useState } from 'react';
import { syncNow } from '../lib/autosync';
import { changeCode, lastBackup, link, pull, push, turnOff, turnOn, undoPull } from '../lib/sync';
import { codeLink, prettyCode } from '../lib/synccode';
import { syncCode, useSyncCode, useSyncState } from '../lib/syncstate';
import { haptic } from '../lib/haptics';

type Result = { cards: number; decks: number };

export function IslandSync({ onDone }: { onDone?: () => void }) {
  const code = useSyncCode();
  const st = useSyncState();
  const [typed, setTyped] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [backupAt, setBackupAt] = useState<number | null>(null);

  useEffect(() => void lastBackup().then(setBackupAt), [busy]);

  const run = async (f: () => Promise<string | void>) => {
    setBusy(true);
    setMsg('');
    try {
      const m = await f();
      if (m) setMsg(m);
      haptic('success');
    } catch (e) {
      setMsg(`Failed: ${(e as Error).message}`);
      haptic('undo');
    }
    setBusy(false);
    void syncNow();
  };

  const counts = (r: Result) => `${r.cards} cards, ${r.decks} decks`;

  const doLink = (raw: string) =>
    run(async () => {
      await link(raw);
      setTyped('');
      return 'Device linked! Syncing your binders now.';
    });

  const share = code ? codeLink(code) : '';

  const copyLink = () => {
    if (!share) return;
    haptic('tap');
    navigator.clipboard?.writeText(share).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setMsg(share)
    );
  };

  const handleSyncNow = async () => {
    haptic('tap');
    setBusy(true);
    try {
      await syncNow();
      haptic('success');
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="id-sync-content" role="region" aria-label="Dynamic Island Sync Settings">
      {/* Status banner with Hatsune Miku green indicator */}
      <div className="id-sync-status-card">
        <div className="id-sync-status-left">
          <span className={`id-miku-dot ${code ? st.status : 'off'}`} aria-hidden="true" />
          <div className="id-sync-status-text">
            <b className="id-sync-status-title">
              {code
                ? st.status === 'synced'
                  ? 'SYNC ACTIVE · UP TO DATE'
                  : st.status === 'syncing'
                  ? 'SYNCING IN PROGRESS…'
                  : st.status === 'conflict'
                  ? 'NEEDS RESOLUTION'
                  : st.status === 'offline'
                  ? 'OFFLINE (WILL SYNC)'
                  : 'SYNC ERROR'
                : 'SYNC INACTIVE (DEVICE ONLY)'}
            </b>
            <span className="id-sync-status-sub">
              {code && st.at ? `Last synced ${new Date(st.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'No cloud sync active'}
            </span>
          </div>
        </div>
        {code && (
          <button
            type="button"
            className="id-sync-refresh-btn"
            disabled={busy || st.status === 'syncing'}
            onClick={handleSyncNow}
            title="Sync with cloud right now"
          >
            <span className={`id-sync-icon ${busy || st.status === 'syncing' ? 'spin' : ''}`}>⟳</span>
            <span>SYNC NOW</span>
          </button>
        )}
      </div>

      {/* Conflict Resolution banner */}
      {st.status === 'conflict' && (
        <div className="id-sync-conflict-box" role="alert">
          <b>Pick which copy to keep:</b>
          <p>{st.msg || 'Both this device and the cloud changed since last sync.'}</p>
          <div className="id-sync-act-row">
            <button
              type="button"
              className="id-btn-red"
              disabled={busy}
              onClick={() => run(async () => `Kept this device: ${counts(await push({ force: true }))}`)}
            >
              KEEP THIS DEVICE
            </button>
            <button
              type="button"
              className="id-btn-white"
              disabled={busy}
              onClick={() =>
                confirm("Replace binders and decks on this device with the cloud copy? (Undo last pull can restore them)") &&
                run(async () => `Kept cloud copy: ${counts(await pull())}`)
              }
            >
              KEEP CLOUD
            </button>
          </div>
        </div>
      )}

      {!code ? (
        <div className="id-sync-setup-box">
          <p className="id-sync-desc">
            Your binders and decks are currently saved <b>on this device only</b>. Turn on sync to automatically mirror them across phone, tablet, and PC.
          </p>

          <button
            type="button"
            className="id-btn-miku-primary"
            disabled={busy}
            onClick={() => run(async () => void (await turnOn()))}
          >
            <span className="id-miku-dot on" />
            <span>TURN ON SYNC (1-CLICK)</span>
          </button>

          <div className="id-sync-divider">
            <span>OR LINK EXISTING CODE</span>
          </div>

          <form
            className="id-sync-link-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim()) doLink(typed.trim());
            }}
          >
            <input
              type="text"
              placeholder="Paste code or link: xxxx-xxxx..."
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={busy}
              aria-label="Sync code or link"
            />
            <button type="submit" className="id-btn-red" disabled={busy || !typed.trim()}>
              LINK DEVICE
            </button>
          </form>
        </div>
      ) : (
        <div className="id-sync-active-box">
          <label className="id-sync-code-label">YOUR DEVICE SYNC CODE:</label>
          <div className="id-sync-code-chip" aria-label="Your sync code">
            <span className="id-code-mono">{prettyCode(code)}</span>
            <button
              type="button"
              className={`id-code-copy-btn ${copied ? 'copied' : ''}`}
              onClick={copyLink}
              title="Copy shareable link"
            >
              {copied ? '✓ COPIED' : 'COPY LINK'}
            </button>
          </div>

          <div className="id-sync-act-grid">
            {'share' in navigator && (
              <button
                type="button"
                className="id-btn-act"
                onClick={() => navigator.share({ title: 'DeckMage sync', url: share }).catch(() => {})}
              >
                SHARE LINK
              </button>
            )}
            <button
              type="button"
              className="id-btn-act"
              disabled={busy}
              onClick={() =>
                confirm('Make a new sync code? The old code stops working on other devices.') &&
                run(async () => {
                  await changeCode();
                  return 'New code generated. Link other devices with it.';
                })
              }
            >
              CHANGE CODE
            </button>
            <button
              type="button"
              className="id-btn-act danger"
              disabled={busy}
              onClick={() =>
                confirm('Turn off sync on this device? Your cards and decks stay here.') &&
                run(async () => {
                  turnOff();
                  return 'Sync is now off on this device.';
                })
              }
            >
              ✕ TURN OFF SYNC
            </button>
          </div>

          {backupAt && (
            <button
              type="button"
              className="id-btn-undo-pull"
              disabled={busy}
              onClick={() =>
                confirm(`Restore binders and decks from before the last pull (${new Date(backupAt).toLocaleString()})?`) &&
                run(async () => `Restored: ${counts(await undoPull())}`)
              }
            >
              ↶ UNDO LAST PULL ({new Date(backupAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
            </button>
          )}
        </div>
      )}

      {msg && (
        <div className="id-sync-msg-bar" role="status">
          {msg}
        </div>
      )}
    </div>
  );
}
