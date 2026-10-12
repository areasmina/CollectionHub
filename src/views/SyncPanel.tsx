import { useEffect, useState } from 'react';
import { pull, push, signIn, supabase } from '../lib/sync';

export function SyncPanel({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
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
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await signIn(email);
            setMsg(error ? error.message : 'Check your email for the sign-in link.');
          }}
        >
          <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
          <button type="submit">Send link</button>
        </form>
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
        </>
      )}
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}
