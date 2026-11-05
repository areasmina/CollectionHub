import { useEffect, useState } from 'react';
import { authReturn, currentUser, moveCheck, providerEnabled, pull, signIn, signOutLegacy, supabase } from '../lib/legacysync';
import { turnOn } from '../lib/sync';

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

/** Moving from the old sign-in sync (Supabase) to a sync code. Shown for one release, then removed with Supabase.
 *  Signed in: "Move to sync code" fetches the old cloud copy when it's newer than this device, then turns on a sync code.
 *  Not signed in: a folded way to sign in once and bring an old cloud copy back. */
export function LegacyMove({ hasCode, onSignedIn, onDone }: { hasCode: boolean; onSignedIn: () => void; onDone: (msg: string) => void }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    const seen = (yes: boolean) => (setSignedIn(yes), yes && onSignedIn());
    currentUser().then((u) => seen(!!u));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => seen(!!session));
    return () => data.subscription.unsubscribe();
  }, []);
  const [choice, setChoice] = useState(false); // both sides changed: ask which to keep
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(authReturn?.error ? `Sign-in failed: ${authReturn.error}` : '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Linked or turned on with a code: the old sign-in isn't needed on this device any more.
  useEffect(() => {
    if (signedIn && hasCode) void signOutLegacy();
  }, [signedIn, hasCode]);

  const move = async (how?: 'device' | 'cloud') => {
    setBusy(true);
    setMsg('');
    try {
      const need = how === 'device' ? 'keep' : how === 'cloud' ? 'pull' : await moveCheck();
      if (need === 'ask') return setChoice(true);
      setChoice(false);
      const got = need === 'pull' ? await pull() : null;
      await turnOn();
      await signOutLegacy();
      onDone(`Moved to a sync code${got ? ` (with the old cloud copy: ${got.cards} card entries, ${got.decks} decks)` : ''}. On your other devices, open the link below or type the code; the old sign-in is no longer used.`);
    } catch (e) {
      setMsg(`Failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  if (signedIn && hasCode) return null;
  if (signedIn)
    return (
      <div className="legacymove">
        <p>
          <b>Sync now works with a sync code: no account or email.</b> This device is still signed in to the old sync. On your first device, tap Move: it fetches the old cloud copy if it's newer than this device, then turns on a sync code. On your other devices, enter that code above instead.
        </p>
        {choice ? (
          <>
            <p className="syncstate conflict" role="alert">
              <b>Pick which copy to keep.</b> This device and the old cloud copy both changed.
            </p>
            <div className="row">
              <button className="btn" disabled={busy} onClick={() => move('device')}>
                KEEP THIS DEVICE
              </button>
              <button className="btn secondary" disabled={busy} onClick={() => move('cloud')}>
                KEEP THE OLD CLOUD COPY
              </button>
            </div>
          </>
        ) : (
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => move()}>
              {busy ? 'MOVING…' : 'MOVE TO SYNC CODE'}
            </button>
          </div>
        )}
        {msg && <p role="status">{msg}</p>}
      </div>
    );
  if (!supabase) return null;
  return (
    <details className="legacymove">
      <summary>Used the old sign-in sync? Bring that copy here</summary>
      <p className="muted small">Only needed if your binders are in the old sync and on no device. Sign in once, then tap Move to sync code.</p>
      {(['google', 'github'] as const).map((provider) => (
        <button
          key={provider}
          className={`oauth ${provider}`}
          onClick={async () => {
            if (!(await providerEnabled(provider))) return setMsg(`Sign in with ${provider === 'google' ? 'Google' : 'GitHub'} isn't switched on.`);
            const { error } = await supabase!.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname } });
            if (error) setMsg(error.message);
          }}
        >
          <span className="ologo" aria-hidden="true">
            {provider === 'google' ? GOOGLE : GITHUB}
          </span>
          Sign in with {provider === 'google' ? 'Google' : 'GitHub'}
        </button>
      ))}
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = password ? await supabase!.auth.signInWithPassword({ email, password }) : await signIn(email);
          if (error) return setMsg(error.message);
          if (!password) setMsg('Check your email for the sign-in link.');
        }}
      >
        <input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
        <input type="password" autoComplete="current-password" placeholder="Password (if you set one)" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />
        <button className="btn" type="submit">
          {password ? 'Sign in' : 'Send link'}
        </button>
      </form>
      {msg && <p role="status">{msg}</p>}
    </details>
  );
}
