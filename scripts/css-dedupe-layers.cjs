// Cleanup Phase A step 3: removes declarations that the cascade can never apply, ACROSS cascade layers.
// For one property on the exact same selector text (so the same elements, same specificity) in the same media context:
//   - an !important declaration beats every normal one; among !important ones the LOWEST layer wins
//     (legacy < tokens < features < unlayered is reversed for !important), then the later one;
//   - among normal declarations the HIGHEST layer wins (unlayered beats features beats legacy), then the later one.
// Every declaration that is not the winner is removed, except two values inside one rule (a deliberate fallback).
// Order is only compared where it is known: inside the legacy layer (styles → ui → polish → legacy blocks after them),
// inside the unlayered app styles (tokens.css, then src/app.css imports in order) and inside one features file.
// usage: node scripts/css-dedupe-layers.cjs <repo root>
const root = process.argv[2];
const postcss = require(root + '/node_modules/postcss');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const appImports = [...read('src/app.css').matchAll(/@import '\.\/(.+?)';/g)].map((m) => 'src/' + m[1]);
// [file, default layer, order group]
const plan = [
  ['src/styles.css', 'legacy', 'legacy'],
  ['src/ui.css', 'legacy', 'legacy'],
  ['src/polish.css', 'legacy', 'legacy'],
  ['src/tokens.css', 'unlayered', 'unlayered'],
  ...appImports.map((f) => [f, 'unlayered', 'unlayered']),
  ...['src/features/collection/Collection.css', 'src/features/decks/Decks.css', 'src/features/forge/Forge.css', 'src/features/commander/Commander.css'].map((f) => [f, 'unlayered', 'file:' + f]),
];
const RANK = { legacy: 0, tokens: 1, features: 2, unlayered: 3 };
const asts = plan.map(([f]) => postcss.parse(read(f), { from: f }));
const decls = [];
let seq = 0;
asts.forEach((ast, i) => {
  const [file, defLayer, group] = plan[i];
  ast.walkDecls((d) => {
    if (d.parent.type !== 'rule') return;
    const media = [];
    let layer = defLayer;
    let skip = false;
    for (let p = d.parent.parent; p && p.type !== 'root'; p = p.parent) {
      if (p.type === 'rule') { skip = true; break; } // nested rules: leave alone
      if (p.type !== 'atrule') continue;
      if (p.name === 'layer') { layer = p.params.trim(); continue; }
      if (['keyframes', 'font-face', 'supports', 'container'].includes(p.name)) { skip = true; break; }
      media.unshift(`@${p.name} ${p.params.replace(/\s+/g, ' ').trim()}`);
    }
    if (skip || !(layer in RANK)) return;
    // a legacy block written inside an unlayered file still joins the legacy order, after the legacy files
    const og = layer === 'legacy' ? 'legacy' : group;
    const sel = d.parent.selector.split(',').map((x) => x.trim().replace(/\s+/g, ' ')).join(',');
    decls.push({ d, file, key: `${media.join(' / ')} || ${sel} || ${d.prop.toLowerCase()}`, imp: !!d.important, rank: RANK[layer], og, seq: seq++ });
  });
});
const byKey = new Map();
for (const x of decls) (byKey.get(x.key) ?? byKey.set(x.key, []).get(x.key)).push(x);
// a beats b (both apply to the same elements) — or undefined when it depends on an order we do not know
const beats = (a, b) => {
  if (a.imp !== b.imp) return a.imp;
  if (a.rank !== b.rank) return a.imp ? a.rank < b.rank : a.rank > b.rank;
  if (a.og !== b.og) return undefined;
  return a.seq > b.seq;
};
let removed = 0, imp = 0;
const perFile = {};
for (const list of byKey.values()) {
  if (list.length < 2) continue;
  for (const x of list) {
    // x is dead when some other declaration surely beats it
    const killer = list.find((y) => y !== x && beats(y, x) === true);
    if (!killer) continue;
    // keep a same-rule fallback pair (two values for one property in one rule)
    if (list.some((y) => y !== x && y.d.parent === x.d.parent && y.d.value !== x.d.value)) continue;
    if (x.imp) imp++;
    removed++;
    perFile[x.file] = (perFile[x.file] ?? 0) + 1;
    x.d.remove();
  }
}
asts.forEach((ast) => {
  ast.walkRules((r) => { if (!r.nodes.some((n) => n.type !== 'comment')) r.remove(); });
  ast.walkAtRules((a) => { if (['media', 'layer'].includes(a.name) && a.nodes && !a.nodes.some((n) => n.type !== 'comment')) a.remove(); });
});
asts.forEach((ast, i) => fs.writeFileSync(path.join(root, plan[i][0]), ast.toString()));
console.log('removed', removed, '(!important', imp + ')', perFile);
