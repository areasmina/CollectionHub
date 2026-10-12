import { useEffect, useState } from 'react';
import { authReturn, currentUser, lastBackup, providerEnabled, pull, push, signIn, supabase, undoPull } from '../lib/sync';

export function SyncPanel({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<string | null>(null);
  const [msg, setMsg] = useState(authReturn?.error ? `Sign-in failed: ${authReturn.error}` : '');
  const [busy, setBusy] = useState(false);
  const [backupAt, setBackupAt] = useState<number | null>(null);
  useEffect(() => void lastBackup().then(setBackupAt), [busy]);

  useEffect(() => {
    if (!supabase) return;
    currentUser().then((u) => setUser(u?.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  const act = async (f: () => Promise<{ cards: number; decks: number; migrated?: boolean }>, done: string) => {
    setBusy(true);
    setMsg('');
    try {
      const r = await f();
      setMsg(`${done}: ${r.cards} card entries, ${r.decks} decks.${r.migrated === false ? ' Swaps, shopping-list checks and dates stayed on this device: run supabase/migrations/002_extras.sql in Supabase to sync them too.' : ''}`);
    } catch (e) {
      setMsg(`Failed: ${(e as Error).message}`);
    }
    setBusy(false);
  };

  return (
    <div className="panel" role="region" aria-label="Sync">
      <button className="close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      <h2>SYNC BETWEEN DEVICES</h2>
      {!supabase ? (
        <p className="muted">Sync isn't set up. Everything is saved on this device. See README → "Device sync" to turn it on.</p>
      ) : !user ? (
        <>
        {(['google', 'github'] as const).map((provider) => (
          <button
            key={provider}
            className={`oauth ${provider}`}
            onClick={async () => {
              if (!(await providerEnabled(provider))) return setMsg(`Sign in with ${provider === 'google' ? 'Google' : 'GitHub'} isn't switched on in Supabase yet.`);
              const { error } = await supabase!.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname } });
              if (error) setMsg(error.message.includes('not enabled') ? `Sign in with ${provider === 'google' ? 'Google' : 'GitHub'} isn't switched on in Supabase yet.` : error.message);
            }}
          >
            Sign in with {provider === 'google' ? 'Google' : 'GitHub'}
          </button>
        ))}
        <p className="muted">Or with your email:</p>
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault();
            // Password if typed (no email needed), else a magic link.
            const { error } = password ? await supabase!.auth.signInWithPassword({ email, password }) : await signIn(email);
            setMsg(error ? error.message : password ? '' : 'Check your email for the sign-in link.');
          }}
        >
          <input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
          <input type="password" autoComplete="current-password" placeholder="Password (if you set one)" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />
          <button className="btn" type="submit">{password ? 'Sign in' : 'Send link'}</button>
        </form>
        </>
      ) : (
        <>
          <p className="muted">Signed in as {user}. Push replaces the cloud copy with this device; Pull replaces this device with the cloud copy.</p>
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => act(push, 'Pushed')}>
              Push to cloud
            </button>
            <button className="btn secondary" disabled={busy} onClick={() => confirm('Replace both binders and decks on this device with the cloud copy?') && act(pull, 'Pulled')}>
              Pull from cloud
            </button>
            <button className="btn secondary" onClick={() => supabase!.auth.signOut()}>SIGN OUT</button>
          </div>
          {backupAt && (
            <div className="row">
              <button className="btn secondary" disabled={busy} onClick={() => confirm(`Put back this device's binders and decks from before the last Pull (${new Date(backupAt).toLocaleString()})?`) && act(undoPull, 'Restored')}>
                UNDO LAST PULL
              </button>
            </div>
          )}
          <form
            className="row"
            onSubmit={async (e) => {
              e.preventDefault();
              const { error } = await supabase!.auth.updateUser({ password });
              setMsg(error ? error.message : 'Password set. Sign in on other devices with your email and this password.');
              if (!error) setPassword('');
            }}
          >
            <input type="password" autoComplete="new-password" minLength={6} required placeholder="Set a password (sign in without email)" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="New password" />
            <button className="btn secondary" type="submit">SET PASSWORD</button>
          </form>
        </>
      )}
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}
