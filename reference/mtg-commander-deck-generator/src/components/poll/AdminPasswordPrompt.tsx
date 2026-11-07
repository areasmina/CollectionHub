// src/components/poll/AdminPasswordPrompt.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setAdminSecret } from '@/services/poll/adminSecret';

interface Props {
  onAuthed: () => void;
}

export function AdminPasswordPrompt({ onAuthed }: Props) {
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!secret) return;
    setBusy(true); setError(null);
    setAdminSecret(secret);
    // Verify by calling a cheap admin endpoint with a bogus id — 401 = wrong secret, 400/404 = secret accepted.
    try {
      const { setDevNote } = await import('@/services/poll/client');
      try {
        await setDevNote('verification-noop-' + Date.now(), '');
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 401) {
          setError('Wrong secret.');
          setBusy(false);
          return;
        }
        // 400/404 mean the secret was accepted but the call was rejected for other reasons — that's the success path here.
      }
      onAuthed();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-6 max-w-sm mx-auto mt-12">
      <h2 className="text-lg font-semibold mb-2">Admin access</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Enter the poll admin secret. Stored only in this tab's session storage.
      </p>
      <Input
        type="password"
        value={secret}
        onChange={e => setSecret(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        placeholder="Admin secret"
        autoFocus
      />
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
      <div className="flex justify-end mt-4">
        <Button onClick={submit} disabled={!secret || busy} size="sm" className="btn-shimmer">
          {busy ? 'Checking…' : 'Unlock'}
        </Button>
      </div>
    </div>
  );
}
