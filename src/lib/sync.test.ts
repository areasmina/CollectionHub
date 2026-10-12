import { describe, expect, it } from 'vitest';
import { syncRisk } from './sync';

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
