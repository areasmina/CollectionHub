import { describe, expect, it } from 'vitest';
import { cleanCode, codeFromHash, CODE_LEN, keysFor, newCode, prettyCode, seal, unseal } from './synccode';

describe('sync codes', () => {
  it('makes readable, unique codes', () => {
    const a = newCode();
    expect(a).toHaveLength(CODE_LEN);
    expect(a).toMatch(/^[a-hjkmnp-z2-9]+$/);
    expect(newCode()).not.toBe(a);
  });
  it('reads a code typed with dashes, in capitals, or as a whole link', () => {
    const c = newCode();
    expect(cleanCode(prettyCode(c))).toBe(c);
    expect(cleanCode(prettyCode(c).toUpperCase())).toBe(c);
    expect(cleanCode(`https://x.app/#sync/${c}`)).toBe(c);
    expect(codeFromHash(`#sync/${c}`)).toBe(c);
    expect(codeFromHash('#collection')).toBe('');
    expect(cleanCode('too-short')).toBe('');
    expect(cleanCode('0'.repeat(CODE_LEN))).toBe(''); // 0 isn't in the alphabet: a typo
  });
});

describe('encryption', () => {
  const data = { entries: Array.from({ length: 500 }, (_, i) => ({ name: 'Sol Ring', qty: i })), note: 'Grishnákh' };
  it('round-trips a snapshot', async () => {
    const k = await keysFor(newCode());
    expect(await unseal(await seal(data, k), k)).toEqual(data);
  });
  it('derives a fixed storage id that is not the code', async () => {
    const c = newCode();
    const [a, b] = [await keysFor(c), await keysFor(c)];
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^[0-9a-f]{64}$/);
    expect(a.id).not.toContain(c);
  });
  it('stores nothing readable and compresses', async () => {
    const k = await keysFor(newCode());
    const bytes = await seal(data, k);
    expect(new TextDecoder().decode(bytes)).not.toContain('Sol Ring');
    expect(bytes.length).toBeLessThan(JSON.stringify(data).length / 4);
  });
  it("can't be read with another code", async () => {
    const bytes = await seal(data, await keysFor(newCode()));
    await expect(unseal(bytes, await keysFor(newCode()))).rejects.toThrow(/couldn't be read/);
  });
});
