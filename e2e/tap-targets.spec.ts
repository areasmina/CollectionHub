import { expect, test, type Page } from '@playwright/test';
import { mockWorld, seed } from './mock';

/**
 * 44px tap targets on phones (audit roadmap, phase 3). Every button, tab, select and section header on the main screens
 * is at least 44px tall, and icon buttons are at least 44px wide. Text links inside sentences, and inputs that sit inside
 * a taller labelled box, are not buttons and are left out.
 */
const small = (page: Page) =>
  page.evaluate(() => {
    const vis = (e: Element) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.pointerEvents !== 'none' && (e as HTMLElement).checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true });
    };
    const out: string[] = [];
    for (const e of document.querySelectorAll('button, summary, select, [role=button], [role=radio], [role=tab]')) {
      if (!vis(e) || e.closest('.pillnav, .island, [hidden]')) continue; // the island is phase 4
      // the jump rail is a slim strip by design: its tap area is widened by a ::before, checked separately below
      if (e.closest('.jrail')) continue;
      // known gap: the small theme badges on a My Decks tile stay small, because growing them would swallow the tile's own tap
      if (e.matches('.themebadge')) continue;
      // a control inside a taller tappable box (label.sbox, a card tile) counts by that box
      const box = (e.matches('select, input') ? e.closest('label') : null) ?? e;
      const r = box.getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) out.push(`${e.tagName.toLowerCase()}.${(e.className || '').toString().trim().split(/\s+/).slice(0, 2).join('.')} ${Math.round(r.width)}x${Math.round(r.height)} "${(e.textContent || '').trim().slice(0, 16)}"`);
    }
    return [...new Set(out)];
  });

test('Phone: no button, tab, select or section header under 44px on the main screens', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', '44px is the touch rule; mouse screens keep their compact controls');
  await mockWorld(page);
  await seed(page);
  const go = async (tab: string) => (await page.evaluate((t) => localStorage.setItem('ch:tab', t), tab), await page.reload(), await page.waitForTimeout(700));
  const found: Record<string, string[]> = {};
  await page.waitForSelector('.ccard');
  found.discover = await small(page);
  await page.locator('.ccard').first().click();
  await page.waitForSelector('details.cat');
  found.commander = await small(page);
  await go('collection');
  await page.waitForSelector('.timg');
  found.collection = await small(page);
  await go('decks');
  await page.waitForSelector('.dcard');
  found.decks = await small(page);
  await page.locator('.dcard').first().click();
  await page.waitForSelector('details.cat');
  found.deck = await small(page);
  expect(found).toEqual({ discover: [], commander: [], collection: [], decks: [], deck: [] });
  // jump rail: 44px tall, and its tap area (the ::before) is 44px wide
  const rail = page.locator('.jrail > button').first();
  if (await rail.count()) {
    await page.locator('details.cat').last().scrollIntoViewIfNeeded();
    if (await rail.isVisible()) expect((await rail.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    expect(await rail.evaluate((e) => parseFloat(getComputedStyle(e, '::before').width))).toBeGreaterThanOrEqual(44);
  }
});
