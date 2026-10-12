// One place for the shop link: {q} = URL-encoded card name. shipsFrom=true is shop.com's "Sells from <your country>" filter.
export const SHOP_URL = 'https://shop.com/search/results?query={q}&inStock=true&shipsFrom=true';
export const shopUrl = (name: string, template = SHOP_URL) => template.replace('{q}', encodeURIComponent(name.split(/\s\/\/?\s/)[0]));

const FALLBACK = 1.4; // used only until the day's rate loads
let rate = FALLBACK;
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
export const rateNote = () => `est. CAD: TCGplayer market price via Scryfall × ${rate.toFixed(4)} USD→CAD${rateDate ? ` (ECB, ${rateDate})` : ' (approx.)'}`;
