import { useEffect, useState } from 'react';
import { syncNow } from '../lib/autosync';
import { backupFile, listBackups, restoreBackup, type Backup } from '../lib/sync';
import { haptic } from '../lib/haptics';

const WHY: Record<string, string> = { pull: 'before a pull', merge: 'before a merge', restore: 'before a restore' };
const many = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const when = (at: number) => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** BACKUPS, in the sync drawer (Phase 5D): this device's binders and decks from before each of the last 5 pulls,
 *  merges or restores, each one restorable, and DOWNLOAD BACKUP (everything on this device as a file to keep). */
export function SyncBackups({ busy: outer = false, tick = 0 }: { busy?: boolean; tick?: number }) {
  const [list, setList] = useState<Backup[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const refresh = () => listBackups().then(setList, () => setList([]));
  useEffect(() => void refresh(), [tick, outer]);

  const restore = async (b: Backup) => {
    if (!confirm(`Put back this device's binders and decks from ${when(b.at)} (${many(b.cards, 'card')}, ${many(b.decks, 'deck')})? What is here now is kept as a backup first.`)) return;
    haptic('tap');
    setBusy(true);
    try {
      const r = await restoreBackup(b.path);
      setMsg(`Restored: ${many(r.cards, 'card')}, ${many(r.decks, 'deck')}. Sync asks which copy to keep.`);
      haptic('success');
    } catch (e) {
      setMsg(`Couldn't restore: ${(e as Error).message}`);
    }
    setBusy(false);
    void refresh();
    void syncNow();
  };
  const download = async () => {
    haptic('tap');
    const { name, blob } = await backupFile();
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setMsg(`Saved ${name}. Keep it somewhere safe.`);
  };

  return (
    <section className="id-sync-backups" aria-label="Backups">
      <div className="id-sync-label-row">
        <span className="id-sync-code-label">BACKUPS</span>
        <span className="id-sync-privacy">{list.length ? `last ${list.length} on this device` : 'none yet'}</span>
      </div>
      <p className="id-sync-desc">Before sync replaces or merges anything here, this device keeps a copy of its binders and decks.</p>
      {list.length > 0 && (
        <ul className="id-sync-backup-list">
          {list.map((b) => (
            <li key={b.path}>
              <span>
                <b>{when(b.at)}</b> {WHY[b.why] ?? ''} · {many(b.cards, 'card')}, {many(b.decks, 'deck')}
              </span>
              <button type="button" className="id-btn-act warning" disabled={busy || outer} onClick={() => restore(b)}>
                RESTORE
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="id-sync-act-row">
        <button type="button" className="id-btn-act" disabled={busy || outer} onClick={download}>
          DOWNLOAD BACKUP
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
