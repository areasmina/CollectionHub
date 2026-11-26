import { describe, expect, it } from 'vitest';
import { parseBackupJson, syncRisk } from './sync';

describe('syncRisk', () => {
  it('blocks a push from an empty device over a full cloud', () => expect(syncRisk('push', 0, 120)).toMatch(/erase the cloud/));
  it('blocks a pull of an empty cloud over a full device', () => expect(syncRisk('pull', 50, 0)).toMatch(/erase this device/));
  it('allows normal syncs and first-time ones', () => {
    expect(syncRisk('push', 10, 0)).toBeNull();
    expect(syncRisk('push', 10, 99)).toBeNull();
    expect(syncRisk('pull', 0, 99)).toBeNull();
    expect(syncRisk('pull', 0, 0)).toBeNull();
  });
});

describe('parseBackupJson', () => {
  it('accepts valid CollectionHub backup snapshots and rejects invalid JSON', () => {
    const raw = JSON.stringify({
      app: 'collectionhub',
      fmt: 1,
      at: 12345,
      profiles: [{ id: 1, name: 'Binder 1' }],
      entries: [{ profile: 1, cardId: 'abc', name: 'Sol Ring', qty: 1 }],
      decks: [],
    });
    const parsed = parseBackupJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.entries).toHaveLength(1);
    expect(parseBackupJson('not json')).toBeNull();
    expect(parseBackupJson('{"app":"other"}')).toBeNull();
  });
});
