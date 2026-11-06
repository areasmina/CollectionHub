/** Card search by name AND rules text (Oracle text, which carries the reminder text) and type line.
 *  Every word of the query has to appear somewhere; case and accents are ignored. */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export type Searchable = { name: string; type?: string; text?: string };

/** 2 = the name matches, 1 = only the rules text / type line matches, 0 = no match. Empty query = 2 (everything). */
export function matchRank(q: string, c: Searchable): 0 | 1 | 2 {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return 2;
  const name = fold(c.name);
  if (words.every((w) => name.includes(w))) return 2;
  const all = `${name}\n${fold(c.type ?? '')}\n${fold(c.text ?? '')}`;
  return words.every((w) => all.includes(w)) ? 1 : 0;
}

/** Filter a list by query; name matches first, then rules-text matches, each in their original order. */
export function searchByText<T>(items: T[], q: string, of: (t: T) => Searchable): T[] {
  if (!q.trim()) return items;
  const ranked = items.map((t, i) => ({ t, i, r: matchRank(q, of(t)) })).filter((x) => x.r > 0);
  return ranked.sort((a, b) => b.r - a.r || a.i - b.i).map((x) => x.t);
}
