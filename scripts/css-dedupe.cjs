// Removes declarations that are provably overridden by a LATER declaration of the same property, for the SAME selector,
// in the SAME at-rule context, in the SAME cascade layer (legacy: styles.css → ui.css → polish.css, in that order).
// A later declaration with identical selector text and context wins over an earlier one whenever their !important-ness
// is the same (same specificity, same layer, later in order); when the earlier one is !important and the later is not,
// the earlier wins, so it is kept. Nothing else is touched.
// usage: node scripts/css-dedupe.cjs <repo root>
const postcss = require(process.argv[2] + '/node_modules/postcss');
const fs = require('fs');
const root = process.argv[2];
const files = ['src/styles.css', 'src/ui.css', 'src/polish.css'].map((f) => root + '/' + f);
const asts = files.map((f) => postcss.parse(fs.readFileSync(f, 'utf8'), { from: f }));
const ctx = (node) => {
  const parts = [];
  for (let p = node.parent; p && p.type !== 'root'; p = p.parent) if (p.type === 'atrule') parts.unshift(`@${p.name} ${p.params}`);
  return parts.join(' / ');
};
const normSel = (s) => s.split(',').map((x) => x.trim().replace(/\s+/g, ' ')).join(',');
// walk all declarations in cascade order
const decls = [];
asts.forEach((ast, fi) => ast.walkDecls((d) => {
  if (d.parent.type !== 'rule') return;
  if (ctx(d.parent).includes('@keyframes') || ctx(d.parent).includes('@font-face') || ctx(d.parent).includes('@supports')) return;
  decls.push({ d, key: `${ctx(d.parent)} || ${normSel(d.parent.selector)} || ${d.prop.toLowerCase()}`, imp: !!d.important });
}));
// for each key, keep the winner(s): process from last to first
const byKey = new Map();
for (const x of decls) (byKey.get(x.key) ?? byKey.set(x.key, []).get(x.key)).push(x);
let removed = 0, impRemoved = 0;
for (const list of byKey.values()) {
  if (list.length < 2) continue;
  // the effective one: last important if any important, else last
  const lastImp = [...list].reverse().find((x) => x.imp);
  const winner = lastImp ?? list[list.length - 1];
  for (const x of list) {
    if (x === winner) continue;
    // a non-important earlier one loses to any later one; an important one loses only to a later important one
    const later = list.slice(list.indexOf(x) + 1);
    const beaten = x.imp ? later.some((y) => y.imp) : later.length > 0 || false;
    // an earlier non-important loses to the winner whether the winner is important or not
    // two values for one property inside the SAME rule are usually a deliberate fallback (100vh then 100dvh): keep them
    const fallback = later.some((y) => y.d.parent === x.d.parent && y.d.value !== x.d.value) || (winner.d.parent === x.d.parent && winner.d.value !== x.d.value);
    if (fallback) continue;
    if (beaten || (!x.imp)) { if (x.imp) impRemoved++; x.d.remove(); removed++; }
  }
}
// drop empty rules / at-rules left behind
asts.forEach((ast) => {
  ast.walkRules((r) => { if (!r.nodes.some((n) => n.type === 'decl' || n.type === 'rule' || n.type === 'atrule')) r.remove(); });
  ast.walkAtRules((a) => { if (['media', 'supports', 'layer'].includes(a.name) && a.nodes && !a.nodes.some((n) => n.type !== 'comment')) a.remove(); });
});
asts.forEach((ast, i) => fs.writeFileSync(files[i], ast.toString()));
console.log('removed declarations', removed, 'of which !important', impRemoved);
