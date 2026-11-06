// Builds public/brain/combos.json: every two-card combo Commander Spellbook knows that is legal in Commander and
// either infinite or wins the game, with what the bracket rules need. Spellbook's API sends no CORS headers, so the
// browser can't ask it directly; a monthly GitHub Action reruns this script instead.
// Run: node scripts/build-combos.mjs   (a few minutes; one request every 0.35 s)
// Row: [card A, card B, flags, mana value needed, Spellbook id, Spellbook bracket tag]
//   flags: 1 = infinite, 2 = wins or is "relevant" (a produced feature with status S, as Spellbook's own bracket
//   estimate counts it), 4 = no notable prerequisite (definitely just these two cards), 8 = A must be the commander,
//   16 = B must be the commander.
import { mkdirSync, writeFileSync } from 'node:fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'User-Agent': 'CollectionHub-combos/1.0', Accept: 'application/json' };
async function get(url) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(url, { headers: UA }).catch(() => null);
    if (r?.ok) return r.json();
    const wait = Number(r?.headers.get('retry-after')) * 1000 || 3000 * 2 ** i;
    await sleep(wait);
  }
  throw new Error(`Commander Spellbook did not answer: ${url}`);
}

const rows = [];
let seen = 0;
let url = `https://backend.commanderspellbook.com/variants/?${new URLSearchParams({ q: 'cards=2 legal:commander', limit: '100' })}`;
while (url) {
  const page = await get(url);
  const res = page.results ?? [];
  for (const v of res) {
    seen++;
    if (v.status !== 'OK' || (v.requires ?? []).length || (v.uses ?? []).length !== 2) continue;
    const feats = (v.produces ?? []).map((p) => p.feature);
    const infinite = feats.some((f) => f.uncountable);
    const relevant = feats.some((f) => f.status === 'S');
    const wins = feats.some((f) => /win the game/i.test(f.name));
    if (!infinite && !wins) continue;
    const [a, b] = v.uses;
    const flags = (infinite ? 1 : 0) | (relevant || wins ? 2 : 0) | (!(v.notablePrerequisites ?? '').trim() ? 4 : 0) | (a.mustBeCommander ? 8 : 0) | (b.mustBeCommander ? 16 : 0);
    rows.push([a.card.name, b.card.name, flags, v.manaValueNeeded ?? 0, v.id, v.bracketTag ?? '']);
  }
  if (seen % 2000 < 100) console.log(`${seen} read, ${rows.length} kept`);
  url = res.length ? page.next : null;
  await sleep(350);
}
if (rows.length < 500) throw new Error(`Only ${rows.length} combos: Spellbook's answer looks wrong, file not written`);
rows.sort((x, y) => x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]));
mkdirSync('public/brain', { recursive: true });
writeFileSync('public/brain/combos.json', JSON.stringify({ v: 1, at: new Date().toISOString().slice(0, 10), source: 'https://commanderspellbook.com', rows }));
console.log(`${rows.length} two-card combos written (of ${seen} read)`);
