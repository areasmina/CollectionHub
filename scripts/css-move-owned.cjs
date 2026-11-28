// Cleanup Phase A: moves a feature's rules out of the three legacy files into that feature's folder.
// A rule moves when EVERY selector in it names at least one of the feature's own classes (classes no other screen uses).
// Moved rules keep their order, their @media wrappers and their cascade layer: the new file wraps them in
// `@layer legacy { … }`, so they stay in the legacy layer (only their position inside it moves after polish.css,
// which the computed-style checker then verifies changes nothing on screen).
// usage: node scripts/css-move-owned.cjs <repo root> <target file> <class,class,...>
const [root, target, list] = process.argv.slice(2);
const postcss = require(root + '/node_modules/postcss');
const fs = require('fs');
const path = require('path');
const own = new Set(list.split(','));
const files = ['src/styles.css', 'src/ui.css', 'src/polish.css'];
const owned = (sel) =>
  sel.split(',').every((part) => [...part.matchAll(/\.([a-zA-Z_][\w-]*)/g)].some((m) => own.has(m[1])));
// --- order safety: moving a rule to the end of the legacy layer only changes what wins against a LATER legacy rule
// that stays put, sets the same property with the same !important-ness and has the SAME specificity, and could
// match the same element. Such rules are left where they are.
const spec = (sel) => {
  const s = sel.replace(/:where\([^)]*\)/g, '').replace(/::?(before|after|placeholder|selection|first-letter|first-line|-webkit-[\w-]+)/g, ' ~pe~');
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const cls = (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!not|is|has)[\w-]+(\([^)]*\))?/g) || []).length;
  const tags = (s.replace(/\([^)]*\)/g, '').match(/(^|[\s>+~])([a-z][\w-]*)/gi) || []).length + (s.match(/~pe~/g) || []).length;
  return ids * 10000 + cls * 100 + tags;
};
const last = (part) => {
  const comp = part.trim().split(/[\s>+~]+/).pop() || '';
  return { cls: new Set([...comp.matchAll(/\.([\w-]+)/g)].map((m) => m[1])), tag: (comp.match(/^[a-z][\w-]*/i) || [''])[0].toLowerCase() };
};
const mayMeet = (a, b) => {
  if (a.tag && b.tag && a.tag !== b.tag) return false;
  if (!a.cls.size || !b.cls.size) return true;
  return [...a.cls].some((c) => b.cls.has(c));
};
const all = [];
const asts = files.map((f) => postcss.parse(fs.readFileSync(path.join(root, f), 'utf8'), { from: f }));
asts.forEach((ast) => ast.walkRules((r) => {
  if (r.parent.type === 'rule') return;
  for (let p = r.parent; p && p.type !== 'root'; p = p.parent) if (p.type === 'atrule' && p.name === 'keyframes') return;
  const parts = r.selector.split(',').map((x) => ({ spec: spec(x), last: last(x) }));
  const props = new Map();
  // compare by property family (margin-top and margin clash; so do background-color and background)
  r.walkDecls((d) => props.set(d.prop.toLowerCase().replace(/^-\w+-/, '').split('-')[0] + (d.important ? '!' : ''), !!d.important));
  all.push({ r, parts, props, own: owned(r.selector) });
}));
const blocked = new Set();
// a moved rule can block another candidate, so repeat until nothing changes
for (let changed = true; changed; ) {
  changed = false;
  all.forEach((x, i) => {
    if (!x.own || blocked.has(x)) return;
    for (let j = i + 1; j < all.length; j++) {
      const y = all[j];
      if (y.own && !blocked.has(y)) continue; // moves along, order kept
      const clash = [...x.props].some(([p, imp]) => y.props.has(p) && y.props.get(p) === imp) &&
        x.parts.some((a) => y.parts.some((b) => a.spec === b.spec && mayMeet(a.last, b.last)));
      if (clash) { blocked.add(x); changed = true; return; }
    }
  });
}
const out = postcss.root();
let moved = 0;
for (const [fi, f] of files.entries()) {
  const ast = asts[fi];
  ast.walkRules((r) => {
    const rec = all.find((x) => x.r === r);
    if (!rec || !rec.own || blocked.has(rec)) return;
    // rebuild its at-rule wrappers (media / supports) around a clone
    let node = r.clone();
    for (let p = r.parent; p && p.type !== 'root'; p = p.parent) {
      if (p.type !== 'atrule' || ['keyframes'].includes(p.name)) return;
      const wrap = p.clone({ nodes: [] });
      wrap.append(node);
      node = wrap;
    }
    // merge into the last top-level node when it is the same @media, to keep the file readable
    const last = out.last;
    if (node.type === 'atrule' && last && last.type === 'atrule' && last.name === node.name && last.params === node.params) last.append(node.nodes);
    else out.append(node);
    const parent = r.parent;
    r.remove();
    moved++;
    if (parent.type === 'atrule' && !parent.nodes.some((n) => n.type !== 'comment')) parent.remove();
  });
  fs.writeFileSync(path.join(root, f), ast.toString());
}
const header = `/* Moved out of the legacy files (styles.css, ui.css, polish.css) in cleanup Phase A, Nov 28: every rule here styles only
   this feature. Wrapped in the legacy layer so its place in the cascade stays the same. */\n@layer legacy {\n`;
fs.writeFileSync(path.join(root, target), header + out.toString().replace(/^/gm, '  ').replace(/^  $/gm, '') + '\n}\n');
console.log('moved rules', moved, '→', target, '; kept in place (order-sensitive):', blocked.size);
