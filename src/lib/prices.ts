// One place for the shop link: {q} = URL-encoded card name. shipsFrom=true is shop.com's "Sells from <your country>" filter.
export const SHOP_URL = 'https://shop.com/search/results?query={q}&inStock=true&shipsFrom=true';
export const shopUrl = (name: string, template = SHOP_URL) => template.replace('{q}', encodeURIComponent(name.split(/\s\/\/?\s/)[0]));

const FALLBACK = 1.4; // used only until the day's rate loads
let rate = FALLBACK;
// Start from the last saved rate (any day) so the first paint already shows near-right prices.
try {
  const c = JSON.parse(localStorage.getItem('ch:usdcad') ?? 'null');
  if (c?.rate) rate = c.rate;
} catch {
  /* no storage: fallback */
}
let rateDate = '';

/** USD→CAD from Frankfurter (European Central Bank rates), cached for the day. */
export async function loadRate() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const c = JSON.parse(localStorage.getItem('ch:usdcad') ?? 'null');
    if (c?.day === today) return void ((rate = c.rate), (rateDate = c.date));
  } catch {
    /* no storage: fetch */
  }
  try {
    const j = await (await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=CAD')).json();
    rate = j.rates.CAD;
    rateDate = j.date;
    try {
      localStorage.setItem('ch:usdcad', JSON.stringify({ day: today, rate, date: rateDate }));
    } catch {
      /* per-device cache only */
    }
  } catch {
    /* offline: keep fallback */
  }
}

export const toCad = (usd: number | string | undefined, r = rate) => (usd == null || usd === '' ? undefined : Math.round(Number(usd) * r * 100) / 100);
export const cad = (n: number) => `CA$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const rateNote = () => `est. CAD: TCGplayer market price (USD) via Scryfall × ${rate.toFixed(4)} USD→CAD${rateDate ? ` (ECB, ${rateDate})` : ' (approx.)'}. ${PRICE_METHOD}`;

/** One price method everywhere: what you own is valued at your printing and finish; anything you'd build or buy at the cheapest paper printing. */
export const PRICE_METHOD = 'Your cards: your printing and finish. Deck price, missing cost and buy lists: the cheapest paper printing (non-foil first).';

/** USD price of one printing in a given finish (foil falls back to non-foil when Scryfall has no foil price). */
export const finishUsd = (c: { usd?: string; usdFoil?: string } | undefined, foil?: boolean) => (foil ? (c?.usdFoil ?? c?.usd) : c?.usd);

/** "Scryfall prices fetched Oct 10–12" from the fetch times of the prices on screen. */
export function fetchedNote(ats: (number | undefined)[]) {
  const v = ats.filter((t): t is number => !!t);
  if (!v.length) return 'prices not fetched yet';
  const day = (t: number) => new Date(t).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  const lo = day(Math.min(...v)), hi = day(Math.max(...v));
  return `Scryfall prices fetched ${lo}${lo === hi ? '' : `–${hi}`}`;
}
