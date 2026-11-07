import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { gzipSync } from 'node:zlib';

const s3 = new S3Client({});
const BUCKET = process.env.BUCKET_NAME!;
const UA = 'MtgDeckBuilder-SpellChromaIndex/1.0';

const DICT_KEY = 'spellchroma-tag-dictionary.json';
const INDEX_KEY = 'spellchroma-tag-index.json';

// Shape of one entry in Scryfall's oracle_tags bulk file (only the fields we use).
interface ScryfallTag {
  id?: string;
  slug?: string;
  label?: string;
  description?: string;
  parent_ids?: string[];
  taggings?: { oracle_id?: string; weight?: string }[];
}

interface TagDictEntry { s: string; l: string; d: string; p?: string[]; }

export interface Artifacts {
  dictFile: string;
  indexFile: string;
  stats: { tags: number; cards: number; taggings: number; generatedAt: string };
}

/**
 * Pure transform: oracle_tags bulk array → the two shipped artifacts.
 * Dictionary array order IS each tag's integer id; the index references those ids.
 * Parent UUIDs are resolved to slugs so the client can group/expand the hierarchy later.
 */
export function buildArtifacts(tags: ScryfallTag[], generatedAt: string): Artifacts {
  const idToSlug = new Map<string, string>();
  for (const t of tags) if (t.id && t.slug) idToSlug.set(t.id, t.slug);

  const dictionary: TagDictEntry[] = [];
  const index: Record<string, number[]> = {};
  let taggings = 0;

  for (const t of tags) {
    if (!t.slug) continue;
    const intId = dictionary.length;
    const entry: TagDictEntry = { s: t.slug, l: t.label ?? '', d: t.description ?? '' };
    const parents = (t.parent_ids ?? [])
      .map(pid => idToSlug.get(pid))
      .filter((s): s is string => !!s);
    if (parents.length) entry.p = parents;
    dictionary.push(entry);

    for (const tg of t.taggings ?? []) {
      const oid = tg.oracle_id;
      if (!oid) continue;
      (index[oid] ??= []).push(intId);
      taggings++;
    }
  }

  return {
    dictFile: JSON.stringify({ generatedAt, tags: dictionary }),
    indexFile: JSON.stringify({ generatedAt, index }),
    stats: { tags: dictionary.length, cards: Object.keys(index).length, taggings, generatedAt },
  };
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function putGzip(key: string, body: string): Promise<number> {
  const gz = gzipSync(Buffer.from(body), { level: 9 });
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: gz,
    ContentType: 'application/json',
    ContentEncoding: 'gzip', // browsers transparently inflate — ~1.1 MB on the wire
    CacheControl: 'public, max-age=604800', // 7 days, matching tagger-tags.json
  }));
  return gz.length;
}

export async function handler(): Promise<{ statusCode: number; body: string }> {
  console.log('SpellChroma index build: locating oracle_tags bulk file...');
  const catalog = await fetchJson('https://api.scryfall.com/bulk-data');
  const entry = (catalog.data ?? []).find((d: any) => d.type === 'oracle_tags');
  if (!entry?.download_uri) throw new Error('oracle_tags bulk entry not found');

  console.log(`Downloading ${entry.download_uri} (~${Math.round((entry.size ?? 0) / 1e6)} MB)...`);
  const tags: ScryfallTag[] = await fetchJson(entry.download_uri);

  const { dictFile, indexFile, stats } = buildArtifacts(tags, new Date().toISOString());
  console.log(`Built: ${stats.tags} tags, ${stats.cards} cards, ${stats.taggings} taggings`);

  const dictBytes = await putGzip(DICT_KEY, dictFile);
  const indexBytes = await putGzip(INDEX_KEY, indexFile);
  console.log(`Uploaded: dict ${(dictBytes / 1e6).toFixed(2)}MB gz, index ${(indexBytes / 1e6).toFixed(2)}MB gz`);

  return { statusCode: 200, body: JSON.stringify({ ...stats, dictBytes, indexBytes }) };
}
