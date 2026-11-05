/** Sync codes and the encryption made from them. Pure functions, no storage, no network (tested in synccode.test.ts).
 *
 *  A sync code is 20 random characters (about 99 bits: unguessable). From it the app derives
 *  - a storage id: SHA-256 of the code, the only thing the server learns, and
 *  - an AES-256-GCM key (HKDF), which never leaves the device.
 *  A snapshot is JSON, gzipped, then encrypted; the server stores bytes it cannot read. */

const ALPH = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o, 1/l/i: easy to read and type
export const CODE_LEN = 20;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function newCode() {
  let out = '';
  while (out.length < CODE_LEN)
    for (const b of crypto.getRandomValues(new Uint8Array(32)))
      if (b < 248 && out.length < CODE_LEN) out += ALPH[b % 31]; // 248 = 8 × 31: no bias toward early letters
  return out;
}
/** What someone typed or pasted (a code with dashes, or a whole link) → the bare code, or '' when it isn't one. */
export function cleanCode(raw: string) {
  const s = String(raw || '').trim();
  const m = s.match(/#sync\/([A-Za-z0-9-]+)/);
  const c = (m ? m[1] : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  return c.length === CODE_LEN && [...c].every((ch) => ALPH.includes(ch)) ? c : '';
}
export const prettyCode = (c: string) => c.match(/.{1,4}/g)!.join('-');
export const codeLink = (c: string, base = `${location.origin}${location.pathname}`) => `${base}#sync/${c}`;
/** The code in a `#sync/<code>` link this page was opened with, or ''. */
export const codeFromHash = (hash: string) => (/^#sync\//.test(hash) ? cleanCode(hash) : '');

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export interface Keys {
  id: string;
  key: CryptoKey;
}
export async function keysFor(code: string): Promise<Keys> {
  const id = hex(await crypto.subtle.digest('SHA-256', enc.encode('collectionhub-sync-id:v1:' + code)));
  const base = await crypto.subtle.importKey('raw', enc.encode(code), 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('collectionhub-sync'), info: enc.encode('snapshot-key:v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { id, key };
}

const pipe = async (bytes: Uint8Array, t: CompressionStream | DecompressionStream) =>
  new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(t)).arrayBuffer());
const GZIP = 1;
// Layout: [format 1][flags][12-byte IV][ciphertext]. The storage id is bound in as associated data,
// so a copy can't be moved to another code's slot.
export async function seal(data: unknown, k: Keys): Promise<Uint8Array> {
  let body = enc.encode(JSON.stringify(data));
  let flags = 0;
  if (typeof CompressionStream === 'function') (body = await pipe(body, new CompressionStream('gzip'))), (flags |= GZIP);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(k.id) }, k.key, body as BufferSource));
  const out = new Uint8Array(2 + 12 + ct.length);
  out.set([1, flags]);
  out.set(iv, 2);
  out.set(ct, 14);
  return out;
}
export async function unseal<T = unknown>(bytes: Uint8Array, k: Keys): Promise<T> {
  if (bytes[0] !== 1) throw new Error('This cloud copy was saved by a newer version of the app. Update the app first.');
  let body: Uint8Array;
  try {
    body = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(2, 14), additionalData: enc.encode(k.id) }, k.key, bytes.slice(14)));
  } catch {
    throw new Error("The cloud copy couldn't be read with this sync code (damaged copy).");
  }
  if (bytes[1] & GZIP) body = await pipe(body, new DecompressionStream('gzip'));
  return JSON.parse(dec.decode(body));
}
