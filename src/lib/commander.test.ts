import { describe, expect, it } from 'vitest';
import { canLead, guessCommander } from './commander';
import { parseImport } from './importers';

const card = (type: string, ci: string[], text = '') => ({ type, ci, text });
const ystola = { name: 'Ystola, Who Plays Her Part', card: card('Legendary Creature — Human Elf', ['B', 'G', 'U']) };
const sidekick = { name: 'Tatyova, Benthic Druid', card: card('Legendary Creature — Merfolk Druid', ['G', 'U']) };
const sol = { name: 'Sol Ring', card: card('Artifact', []) };
const swamp = { name: 'Doom Blade', card: card('Instant', ['B']) };

describe('canLead', () => {
  it('legendary creatures and "can be your commander" cards', () => {
    expect(canLead(card('Legendary Creature — Elf', ['G']))).toBe(true);
    expect(canLead(card('Legendary Planeswalker — Teferi', ['W', 'U'], 'Teferi can be your commander.'))).toBe(true);
    expect(canLead(card('Legendary Artifact', []))).toBe(false);
    expect(canLead(card('Creature — Elf', ['G']))).toBe(false);
  });
});

describe('guessCommander', () => {
  it('takes the only legend that covers every colour in the deck', () => {
    expect(guessCommander([sol, sidekick, swamp, ystola])).toBe('Ystola, Who Plays Her Part');
  });
  it('prefers a lone legend at the edge of the list', () => {
    expect(guessCommander([{ ...sidekick, edge: true }, ystola, sol])).toBe('Tatyova, Benthic Druid');
  });
  it('gives up when it is ambiguous', () => {
    expect(guessCommander([sol, sidekick, { ...sidekick, name: 'Other Simic Legend' }])).toBeUndefined();
  });
});

describe('text import commander hints', () => {
  it('marks a lone card set apart at the end (Moxfield / MTGO export)', () => {
    const p = parseImport('1 Sol Ring\n1 Doom Blade\n1 Cultivate\n\n1 Ystola, Who Plays Her Part');
    expect(p.rows.find((r) => r.name.startsWith('Ystola'))?.edge).toBe(true);
    expect(p.rows.find((r) => r.name === 'Sol Ring')?.edge).toBeFalsy();
  });
  it('reads *CMDR*', () => {
    expect(parseImport('1 Ystola, Who Plays Her Part *CMDR*\n1 Sol Ring').rows[0]).toMatchObject({ name: 'Ystola, Who Plays Her Part', section: 'Commander' });
  });
});
