import { cloudVersion, currentUser, pull, push, sameAsCloud, supabase } from './sync';
import { clearDirty, dirtyAt, lastVersion, onLocalChange, setLastVersion, setSyncState } from './syncstate';

/** Keeps this device and the cloud in step on its own:
 *  - this device changed and the cloud didn't → push (a few seconds after the last edit)
 *  - the cloud changed and this device didn't → pull (the old copy is kept for Undo)
 *  - both changed, or a first sync with different data on each side → stop and let the person pick (Push or Pull). */
let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export function syncSoon(ms = 4000) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

export async function syncNow() {
  if (!supabase) return;
  if (running) return void (again = true);
  running = true;
  try {
    if (!navigator.onLine) return setSyncState({ status: 'offline', msg: '' });
    const user = await currentUser();
    if (!user) return setSyncState({ status: 'off', msg: '' });
    setSyncState({ status: 'syncing', msg: '' });
    const cloud = await cloudVersion(user.id);
    const last = lastVersion();
    const dirty = dirtyAt();
    const cloudChanged = cloud !== last;
    if (!last || (cloudChanged && dirty)) {
      // Never synced here, or both sides changed: only safe when they hold the same thing (or one side is empty).
      const started = Date.now();
      const { same, cloudCount, localCount } = await sameAsCloud();
      if (same) {
        setLastVersion(cloud || null);
        clearDirty(started);
        if (!cloud && localCount) await push();
      } else if (!cloudCount) await push();
      else if (!localCount) await pull();
      else return setSyncState({ status: 'conflict', msg: last ? 'Changed on this device and in the cloud.' : 'This device and the cloud hold different binders or decks.' });
    } else if (cloudChanged) await pull();
    else if (dirty) await push();
    setSyncState({ status: 'synced', at: Date.now(), msg: '' });
  } catch (e) {
    setSyncState({ status: navigator.onLine ? 'error' : 'offline', msg: (e as Error).message });
  } finally {
    running = false;
    if (again) {
      again = false;
      syncSoon(1000);
    }
  }
}

let started = false;
export function startAutoSync() {
  if (!supabase || started) return;
  started = true;
  onLocalChange(() => syncSoon());
  addEventListener('online', () => syncSoon(500));
  addEventListener('offline', () => setSyncState({ status: 'offline', msg: '' }));
  document.addEventListener('visibilitychange', () => {
    // Back on the app: fetch what other devices did. Leaving it: send pending edits now.
    if (document.visibilityState === 'visible' || dirtyAt()) syncSoon(document.visibilityState === 'visible' ? 300 : 0);
  });
  // A quiet check while the app stays open, for edits made on another device.
  setInterval(() => document.visibilityState === 'visible' && syncSoon(0), 3 * 60_000);
  supabase.auth.onAuthStateChange((e) => {
    if (e === 'SIGNED_IN') syncSoon(300);
    if (e === 'SIGNED_OUT') {
      setLastVersion(null);
      setSyncState({ status: 'off', msg: '' });
    }
  });
  syncSoon(500);
}
