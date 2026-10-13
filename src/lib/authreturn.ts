// Kept apart from lib/sync so the first page load doesn't pull in the Supabase client.
const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
// Read the sign-in return before Supabase consumes the URL: errors come back here and were silently dropped.
const ret = new URLSearchParams((typeof location !== 'undefined' && (location.hash.slice(1) || location.search.slice(1))) || '');
/** Set when the page was opened by a sign-in redirect: success (session in the URL) or Supabase's error text. */
export const authReturn: { error?: string; ok?: boolean } | null = ret.get('error_description') || ret.get('error')
  ? { error: safeDecode((ret.get('error_description') || ret.get('error') || '').replace(/\+/g, ' ')) }
  : ret.get('access_token') || ret.get('code')
    ? { ok: true }
    : null;
if (authReturn?.error && typeof history !== 'undefined') history.replaceState(null, '', location.pathname);
