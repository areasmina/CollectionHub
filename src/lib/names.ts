// Comparison key for a card name: front face only, no accents, lowercase.
export const norm = (s: string) =>
  s
    .split(/\s\/\/?\s/)[0]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// EDHREC URL slug: "Atraxa, Praetors' Voice" -> "atraxa-praetors-voice".
export const slug = (name: string) =>
  norm(name)
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
