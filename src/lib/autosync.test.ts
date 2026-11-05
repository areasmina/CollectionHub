import { beforeEach, describe, expect, it, vi } from 'vitest';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) });
vi.stubGlobal('navigator', { onLine: true });

const cloud = { version: 0, same: false, cloudCount: 0, localCount: 0 };
const calls: string[] = [];
vi.mock('./sync', () => ({
  ChangedElsewhere: class extends Error {},
  CodeGone: class extends Error {},
  cloudVersion: async () => cloud.version,
  sameAsCloud: async () => ({ same: cloud.same, cloudCount: cloud.cloudCount, localCount: cloud.localCount }),
  push: async () => {
    calls.push('push');
    const { setLastVersion, clearDirty } = await import('./syncstate');
    setLastVersion((cloud.version = 999));
    clearDirty(Date.now());
  },
  pull: async () => {
    calls.push('pull');
    const { setLastVersion } = await import('./syncstate');
    setLastVersion(cloud.version);
  },
}));
vi.mock('./db', () => {
  const t = { hook: () => {} };
  return { db: { entries: t, decks: t, profiles: t } };
});

const { syncNow } = await import('./autosync');
describe('automatic sync decisions', () => {
  beforeEach(() => {
    mem.clear();
    mem.set('ch:sync:code', 'x');
    calls.length = 0;
    Object.assign(cloud, { version: 0, same: false, cloudCount: 0, localCount: 0 });
  });
  it('stays off without a sync code', async () => {
    mem.clear();
    cloud.version = 200;
    await syncNow();
    expect(calls).toEqual([]);
  });
  const dirty = () => mem.set('ch:sync:dirty', String(Date.now()));

  it('pushes local edits when the cloud has not changed', async () => {
    mem.set('ch:code:last', '100');
    cloud.version = 100;
    dirty();
    await syncNow();
    expect(calls).toEqual(['push']);
  });
  it('pulls when only the cloud changed', async () => {
    mem.set('ch:code:last', '100');
    cloud.version = 200;
    await syncNow();
    expect(calls).toEqual(['pull']);
  });
  it('does nothing when both are unchanged', async () => {
    mem.set('ch:code:last', '100');
    cloud.version = 100;
    await syncNow();
    expect(calls).toEqual([]);
  });
  it('stops on a conflict when both changed and differ', async () => {
    mem.set('ch:code:last', '100');
    Object.assign(cloud, { version: 200, cloudCount: 5, localCount: 5 });
    dirty();
    await syncNow();
    expect(calls).toEqual([]);
    expect(mem.get('ch:code:last')).toBe('100');
  });
  it('treats both-changed-to-the-same-thing as in sync', async () => {
    mem.set('ch:code:last', '100');
    Object.assign(cloud, { version: 200, same: true, cloudCount: 5, localCount: 5 });
    dirty();
    await syncNow();
    expect(calls).toEqual([]);
    expect(mem.get('ch:code:last')).toBe('200');
    expect(mem.has('ch:sync:dirty')).toBe(false);
  });
  it('first sync: pulls onto an empty device, pushes into an empty cloud, else asks', async () => {
    Object.assign(cloud, { version: 200, cloudCount: 5, localCount: 0 });
    await syncNow();
    expect(calls).toEqual(['pull']);
    mem.clear();
    mem.set('ch:sync:code', 'x');
    calls.length = 0;
    Object.assign(cloud, { version: 0, cloudCount: 0, localCount: 5 });
    await syncNow();
    expect(calls).toEqual(['push']);
    mem.clear();
    mem.set('ch:sync:code', 'x');
    calls.length = 0;
    Object.assign(cloud, { version: 200, cloudCount: 5, localCount: 5 });
    await syncNow();
    expect(calls).toEqual([]);
  });
});
