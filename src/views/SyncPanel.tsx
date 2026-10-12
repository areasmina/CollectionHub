import { useEffect, useState } from 'react';
import { pull, push, signIn, supabase } from '../lib/sync';

export function SyncPanel({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user?.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  const act = async (f: () => Promise<{ cards: number; decks: number }>, done: string) => {
    setBusy(true);
    setMsg('');
    try {
      const r = await f();
      setMsg(`${done}: ${r.cards} card entries, ${r.decks} decks.`);
    } catch (e) {
      setMsg(`Failed: ${(e as Error).message}`);
    }
    setBusy(false);
  };

  return (
    <div className="panel" role="region" aria-label="Sync">
      <button className="icon close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      <h2>Sync between devices</h2>
      {!supabase ? (
        <p className="muted">Sync isn't set up. Everything is saved on this device. See README → "Device sync" to turn it on.</p>
      ) : !user ? (
        <>
        <button
          className="github"
          onClick={async () => {
            const { error } = await supabase!.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: location.origin + location.pathname } });
            if (error) setMsg(error.message);
          }}
        >
          Sign in with GitHub
        </button>
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
          <button type="submit">{password ? 'Sign in' : 'Send link'}</button>
        </form>
        </>
      ) : (
        <>
          <p className="muted">Signed in as {user}. Push replaces the cloud copy with this device; Pull replaces this device with the cloud copy.</p>
          <div className="row">
            <button disabled={busy} onClick={() => act(push, 'Pushed')}>
              Push to cloud
            </button>
            <button disabled={busy} onClick={() => confirm('Replace both binders and decks on this device with the cloud copy?') && act(pull, 'Pulled')}>
              Pull from cloud
            </button>
            <button onClick={() => supabase!.auth.signOut()}>Sign out</button>
          </div>
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
            <button type="submit">Set password</button>
          </form>
        </>
      )}
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}
