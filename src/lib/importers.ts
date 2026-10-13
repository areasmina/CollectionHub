export interface Row {
  name: string;
  qty: number;
  set?: string;
  cn?: string;
  id?: string;
  foil?: boolean;
  added?: string; // date the card entered the collection (ManaBox 'Added')
  section?: string;
  edge?: boolean; // alone in a short block at the very start or end of a text list (where exports put the commander)
}
export interface ParseError {
  line: number;
  text: string;
  reason: string;
}
export interface Parsed {
  format: 'manabox' | 'csv' | 'text';
  rows: Row[];
  errors: ParseError[];
}

export function parseCsv(text: string, delim = ','): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) row.push(cell), (cell = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell), out.push(row), (row = []), (cell = '');
    } else cell += ch;
  }
  if (cell || row.length) row.push(cell), out.push(row);
  return out.filter((r) => r.some((c) => c.trim()));
}

const COLS = {
  name: ['name', 'card name', 'card', 'cardname', 'card_name'],
  qty: ['quantity', 'qty', 'count', 'amount'],
  set: ['set code', 'set', 'edition code', 'edition', 'set_code'],
  cn: ['collector number', 'card number', 'number', 'collector_number', 'cn'],
  id: ['scryfall id', 'scryfall_id', 'scryfallid'],
  foil: ['foil', 'printing'],
  added: ['added', 'date added', 'added at'],
};
const col = (header: string[], names: string[]) => header.findIndex((h) => names.includes(h.trim().toLowerCase()));
const NOT_FOIL = ['', 'false', 'normal', '0', 'no', 'nonfoil'];

function parseCsvImport(text: string, delim: string): Parsed | null {
  const table = parseCsv(text, delim);
  const header = table[0] ?? [];
  const c = Object.fromEntries(Object.entries(COLS).map(([k, v]) => [k, col(header, v)])) as Record<keyof typeof COLS, number>;
  if (c.name < 0) return null;
  const rows: Row[] = [];
  const errors: ParseError[] = [];
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const name = (r[c.name] ?? '').trim();
    const qtyText = c.qty >= 0 ? (r[c.qty] ?? '').trim() : '1';
    const qty = qtyText === '' ? 1 : Number(qtyText);
    if (!name) return errors.push({ line, text: r.join(delim), reason: 'No card name' });
    if (!Number.isInteger(qty) || qty < 1) return errors.push({ line, text: r.join(delim), reason: `Bad quantity "${qtyText}"` });
    const get = (k: number) => (k >= 0 && r[k]?.trim()) || undefined;
    rows.push({ name, qty, set: get(c.set), cn: get(c.cn), id: get(c.id), foil: c.foil >= 0 && !NOT_FOIL.includes((r[c.foil] ?? '').trim().toLowerCase()), added: get(c.added) });
  });
  const manabox = header.some((h) => h.trim().toLowerCase() === 'manabox id');
  return { format: manabox ? 'manabox' : 'csv', rows, errors };
}

const HEADER =
  /^(commanders?|companion|deck|main|mainboard|maindeck|sideboard|side|maybe|maybeboard|considering|tokens?|lands?|creatures?|instants?|sorcery|sorceries|artifacts?|enchantments?|planeswalkers?|battles?|spells?|other)$/i;

function parseText(text: string): Parsed {
  const rows: Row[] = [];
  const errors: ParseError[] = [];
  let section: string | undefined;
  let block = 0; // blank lines and section headers start a new block
  const blockOf: number[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    let s = raw.trim();
    if (!s) return void block++;
    if (s.startsWith('#')) return;
    if (/^(\/\/|[^\d].*:$)/.test(s) || (!/^\d/.test(s) && HEADER.test(s.replace(/\s*\(\d+\)\s*$/, '').replace(/:$/, '').trim()))) block++;
    if (s.startsWith('//')) return void (section = s.slice(2).trim());
    const bare = s.replace(/\s*\(\d+\)\s*$/, '').replace(/:$/, '').trim();
    if (!/^\d/.test(s) && (HEADER.test(bare) || s.endsWith(':'))) return void (section = bare);
    const m = /^(\d+)\s*x?\s+(.+)$/i.exec(s);
    const qty = m ? Number(m[1]) : 1;
    s = m ? m[2] : s;
    let rowSection = section;
    const cat = /\[([^\]]*)\]/.exec(s); // Archidekt category, e.g. [Commander{top}]
    if (cat && /commander/i.test(cat[1])) rowSection = 'Commander';
    if (/\*CMDR\*/i.test(s)) rowSection = 'Commander'; // Moxfield's commander mark
    s = s.replace(/\*CMDR\*/gi, '');
    const foil = /\*[FE]\*/.test(s);
    s = s.replace(/\^[^^]*\^/g, '').replace(/\[[^\]]*\]/g, '').replace(/\*[FE]\*/g, '').trim();
    const sc = /\s+\(([A-Za-z0-9]{2,6})\)(?:\s+(\S+))?$/.exec(s);
    if (sc) s = s.slice(0, sc.index).trim();
    if (!s) return errors.push({ line, text: raw, reason: 'No card name' });
    if (qty < 1) return errors.push({ line, text: raw, reason: 'Quantity must be at least 1' });
    rows.push({ name: s, qty, set: sc?.[1], cn: sc?.[2], foil, section: rowSection });
    blockOf.push(block);
  });
  // A block of 1–2 single cards at the very start or end, set apart by a blank line, is where Moxfield / MTGO exports
  // put the commander. Only a hint: the deck import checks the card can be a commander.
  const blocks = new Map<number, number[]>();
  blockOf.forEach((b, i) => blocks.set(b, [...(blocks.get(b) ?? []), i]));
  const ids = [...blocks.keys()];
  if (ids.length > 1)
    for (const b of [ids[0], ids[ids.length - 1]]) {
      const rs = blocks.get(b)!;
      if (rs.length <= 2 && rs.every((i) => rows[i].qty === 1)) rs.forEach((i) => (rows[i].edge = true));
    }
  return { format: 'text', rows, errors };
}

/** Detects ManaBox CSV, other CSVs with a name column, or a text list (Moxfield / Archidekt / plain). */
export function parseImport(input: string): Parsed {
  const text = input.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = first.includes('\t') ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ',';
  return parseCsvImport(text, delim) ?? parseText(text);
}

/** Adds up quantities of the same printing. */
export function mergeRows(rows: Row[]): Row[] {
  const m = new Map<string, Row>();
  for (const r of rows) {
    const k = [r.id ?? r.name.toLowerCase(), r.set ?? '', r.cn ?? '', r.foil ? 'f' : ''].join('|');
    const prev = m.get(k);
    if (prev) prev.qty += r.qty;
    else m.set(k, { ...r });
  }
  return [...m.values()];
}
