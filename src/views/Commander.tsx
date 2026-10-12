import { useEffect, useState } from 'react';
import { statusOf, summarize } from '../lib/compare';
import { db, type Card } from '../lib/db';
import { cardsByIds } from '../lib/scryfall';
import { BRACKETS, BUDGETS, fetchPage, imgOf, pagePath, type EdhPage } from '../lib/edhrec';
import { slug as toSlug } from '../lib/names';
import { CardLine, money, priceSum, Seg, type Shared } from './shared';

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function CommanderView({ name, s, onBack }: { name: string; s: Shared; onBack: () => void }) {
  const slug = toSlug(name);
  const [kind, setKind] = useState<'commander' | 'average'>('commander');
  const [bracket, setBracket] = useState('');
  const [budget, setBudget] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState<EdhPage | null>(null);
  const [tags, setTags] = useState<EdhPage['tags']>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const path = pagePath(kind, slug, bracket, tag, budget);

  useEffect(() => {
    fetchPage(pagePath('commander', slug))
      .then((p) => setTags(p.tags))
      .catch(() => setTags([]));
  }, [slug]);
  useEffect(() => {
    let live = true;
    setPage(null);
    setError('');
    fetchPage(path)
      .then((p) => live && setPage(p))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [path]);

  // EDHREC lists carry Scryfall ids but no prices: fetch prices/images from Scryfall (cached a week).
  const [cards, setCards] = useState<Map<string, Card>>(new Map());
  useEffect(() => {
    const ids = page?.lists.flatMap((l) => l.cards.map((c) => c.id).filter(Boolean) as string[]) ?? [];
    let live = true;
    if (ids.length) cardsByIds(ids).then((m) => live && setCards(m)).catch(() => {});
    return () => {
      live = false;
    };
  }, [page]);

  const all = page?.lists.flatMap((l) => l.cards) ?? [];
  const names = [...new Set(all.map((c) => c.name))];
  const sum = summarize(names, s.mine, s.other);
  const missing = [...new Map(all.filter((c) => statusOf(c.name, s.mine) !== 'owned').map((c) => [c.name, c])).values()];
  const missingCost = priceSum(missing.map((c) => ({ card: c.id ? cards.get(c.id) : undefined, qty: c.qty ?? 1 })));

  async function saveDeck() {
    if (!page) return;
    const cards = page.lists.flatMap((l) => l.cards.map((c) => ({ name: c.name, qty: c.qty ?? 1 })));
    await db.decks.add({ profile: s.profile, name: `${name} (EDHREC average)`, commander: name, cards: [{ name, qty: 1 }, ...cards], updated: Date.now() });
    setSaved('Saved to Decks.');
  }

  return (
    <section>
      <button className="link" onClick={onBack}>
        ← Commanders
      </button>
      <h1>{name}</h1>
      <div className="controls">
        <Seg label="View" value={kind} options={[['commander', 'As Commander'], ['average', 'Average Deck']]} onChange={(v) => setKind(v as typeof kind)} />
        <Seg label="Bracket" value={bracket} options={BRACKETS} onChange={setBracket} />
        <Seg label="Budget" value={budget} options={BUDGETS} onChange={setBudget} />
      </div>
      {tags.length > 0 && (
        <div className="chips" aria-label="Tags">
          {tags.slice(0, 24).map((t) => (
            <button key={t.slug} aria-pressed={tag === t.slug} onClick={() => setTag(tag === t.slug ? '' : t.slug)}>
              {t.value} <small>{t.count.toLocaleString()}</small>
            </button>
          ))}
        </div>
      )}
      <p className="muted">
        <a href={`https://edhrec.com/${path}`} target="_blank" rel="noreferrer">
          Open on EDHREC ↗
        </a>
        {page?.numDecks ? ` · ${page.numDecks.toLocaleString()} decks` : ''}
      </p>
      {error && <p className="error">{error}</p>}
      {!page && !error && <p className="muted">Loading EDHREC data…</p>}
      {page && (
        <>
          <div className="summary">
            <strong>{sum.pct}%</strong> owned · {sum.owned} of {sum.total} cards in this binder
            {sum.other > 0 && ` · ${sum.other} more in ${s.otherName}`}
            {cards.size > 0 && ` · missing cards ≈ ${money(missingCost)}`}
            {kind === 'average' && (
              <button onClick={saveDeck} disabled={!!saved}>
                {saved || 'Save as deck'}
              </button>
            )}
          </div>
          {page.lists.map((l) => {
            const ls = summarize(l.cards.map((c) => c.name), s.mine, s.other);
            return (
              <details key={l.header} open>
                <summary>
                  {l.header} <small className="muted">{ls.owned}/{ls.total} owned</small>
                </summary>
                <ul className="cards">
                  {l.cards.map((c) => (
                    <CardLine
                      key={c.name}
                      name={c.name}
                      img={imgOf(c.id)}
                      card={c.id ? cards.get(c.id) : undefined}
                      s={s}
                      right={
                        c.potential ? (
                          <span title={`${(c.decks ?? 0).toLocaleString()} of ${c.potential.toLocaleString()} decks · synergy ${pct(c.synergy ?? 0)}`}>
                            {pct((c.decks ?? 0) / c.potential)} <small>{c.lift ? `${c.lift.toFixed(1)}x lift` : `syn ${pct(c.synergy ?? 0)}`}</small>
                          </span>
                        ) : c.qty && c.qty > 1 ? (
                          `×${c.qty}`
                        ) : undefined
                      }
                    />
                  ))}
                </ul>
              </details>
            );
          })}
        </>
      )}
    </section>
  );
}
