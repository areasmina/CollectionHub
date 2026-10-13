import { useEffect, useState } from 'react';
import { authReturn, currentUser, lastBackup, providerEnabled, pull, push, signIn, supabase, undoPull } from '../lib/sync';

// Provider marks for the sign-in buttons (Google "G" in its own colours, GitHub's Invertocat in the button colour).
const GOOGLE = (
  <svg width="22" height="22" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
    <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
  </svg>
);
const GITHUB = (
  <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

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
            <span className="ologo" aria-hidden="true">
              {provider === 'google' ? GOOGLE : GITHUB}
            </span>
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
