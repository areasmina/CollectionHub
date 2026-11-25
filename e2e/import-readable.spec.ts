import { expect, test, type Locator } from '@playwright/test';
import { fits, mockWorld } from './mock';

/** WCAG contrast ratio of an element's text colour against the dialog's background (both read from the real page). */
async function contrast(el: Locator) {
  return el.evaluate((node) => {
    const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    // nearest ancestor with a solid background
    let bg = 'rgb(0,0,0)';
    for (let n: Element | null = node; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const v = rgb(c);
      if (v.length && (v.length < 4 || v[3] > 0.9)) {
        bg = c;
        break;
      }
    }
    const cs = getComputedStyle(node);
    // anything fading the text (opacity on it or a parent) counts against it
    let alpha = 1;
    for (let n: Element | null = node; n; n = n.parentElement) alpha *= Number(getComputedStyle(n).opacity);
    const fg = rgb(cs.color);
    const b = rgb(bg);
    const a = alpha * (fg[3] ?? 1);
    const mix = fg.slice(0, 3).map((c, i) => c * a + b[i] * (1 - a));
    const [l1, l2] = [lum(mix), lum(b)].sort((x, y) => y - x);
    return { ratio: (l1 + 0.05) / (l2 + 0.05), size: parseFloat(cs.fontSize), line: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) };
  });
}

const csv = ['Name,Quantity,Set code,Collector number,Foil,Scryfall ID']
  .concat(Array.from({ length: 40 }, (_, i) => `Test Card ${i},1,tst,${i + 1},normal,${i.toString(16).padStart(8, '0')}-aaaa-4bbb-8ccc-000000000000`))
  .join('\n');

test('Import: the pasted list, the lookup progress and the Scryfall pause are easy to read', async ({ page }, info) => {
  await mockWorld(page);
  // Scryfall asks for a pause on the first request and never answers the next, so the progress stays on screen
  let calls = 0;
  await page.route(/api\.scryfall\.com\/cards\/collection/, async (r) => {
    if (++calls === 1) return r.fulfill({ status: 429, headers: { 'Retry-After': '30', 'Access-Control-Expose-Headers': 'Retry-After' }, json: { object: 'error', status: 429 } });
    await new Promise(() => {});
  });
  await page.goto('/');
  await page.waitForSelector('.pillnav', { state: 'attached' });
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const pop = page.locator('.importbox-pop');
  await expect(pop).toBeVisible();
  // the dialog fades in (the note-pop drop): measure once it has landed, not mid-fade
  await pop.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  const box = pop.locator('textarea');
  await box.fill(csv);

  // the pasted text: AA contrast, at least 14px, roomy lines
  const t = await contrast(box);
  expect(t.ratio).toBeGreaterThanOrEqual(4.5);
  expect(t.size).toBeGreaterThanOrEqual(14);
  expect(t.line).toBeGreaterThanOrEqual(1.5);
  // the label over the box
  expect((await contrast(pop.locator('.ipaste > span'))).ratio).toBeGreaterThanOrEqual(4.5);

  await pop.getByRole('button', { name: '+ ADD' }).click();
  const status = pop.locator('.progress > span');
  await expect(status).toContainText('Looking up cards on Scryfall');
  await expect(pop.locator('.pwait')).toBeVisible({ timeout: 15_000 });
  for (const el of [status, pop.locator('.pwait')]) {
    const c = await contrast(el);
    expect(c.ratio, await el.innerText()).toBeGreaterThanOrEqual(4.5);
    expect(c.size).toBeGreaterThanOrEqual(14);
  }
  await fits(page, ['.importbox-pop']);
  await page.screenshot({ path: info.outputPath(`import-readable-${info.project.name}.png`) });
});
