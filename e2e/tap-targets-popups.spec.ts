import { expect, test, type Page } from '@playwright/test';
import { closeOpts, mockWorld, openImport, opts, seed } from './mock';

/**
 * 44px tap targets inside pop-ups on phones (phase 3 leftover). Every button, picker, link and colour dot in the pop-up
 * named by `scope` is at least 44px tall and wide. A select or input counts by its labelled box.
 */
const small = (page: Page, scope: string) =>
  page.evaluate((scope) => {
    const root = document.querySelector(scope);
    if (!root) return [`pop-up not found: ${scope}`];
    const out: string[] = [];
    for (const e of root.querySelectorAll('button, summary, select, a[href], [role=button], [role=radio], [role=tab], [role=menuitem], input[type=checkbox], input[type=color], label')) {
      const r0 = e.getBoundingClientRect();
      if (!(r0.width > 0 && r0.height > 0) || getComputedStyle(e).pointerEvents === 'none' || !(e as HTMLElement).checkVisibility({ visibilityProperty: true })) continue;
      const box = (e.matches('select, input') ? e.closest('label') : null) ?? e;
      const r = box.getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) out.push(`${e.tagName.toLowerCase()}.${(e.className || '').toString().trim().split(/\s+/).slice(0, 2).join('.')} ${Math.round(r.width)}x${Math.round(r.height)} "${(e.textContent || '').trim().slice(0, 16)}"`);
    }
    return [...new Set(out)];
  }, scope);

test('Phone: nothing under 44px inside the pop-ups (options, card menu, swap window, import, binder menu, filter, deck menu)', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', '44px is the touch rule; mouse screens keep their compact controls');
  await mockWorld(page);
  await seed(page);
  const go = async (tab: string) => (await page.evaluate((t) => localStorage.setItem('ch:tab', t), tab), await page.reload(), await page.waitForTimeout(700));
  const found: Record<string, string[]> = {};
  const shot = (n: string) => page.screenshot({ path: `test-results/popup-${n}.png` });

  // commander page: ⋮ options, a card's menu, the swap window
  await page.locator('.ccard').first().click();
  await page.waitForSelector('details.cat');
  await opts(page);
  await page.waitForTimeout(600); // the sheet slides up
  found.options = await small(page, '.tbmore[open]');
  await shot('options');
  await closeOpts(page);
  await page.locator('.ztile').first().click({ button: 'right' });
  await page.waitForSelector('.cardmenu');
  found.cardMenu = await small(page, '.cardmenu');
  await shot('card-menu');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
  await page.waitForSelector('.swapnote');
  found.swap = await small(page, '.swapnote');
  await page.keyboard.press('Escape');

  // Collection: import, the binder menu, the filter sheet
  await go('collection');
  await openImport(page);
  found.import = await small(page, '.importbox-pop');
  await page.keyboard.press('Escape');
  await page.locator('.chead2 button').first().click();
  await page.waitForSelector('.bindermenu button');
  found.binder = await small(page, '.bindermenu');
  await shot('binder-menu');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /filter/i }).first().click();
  await page.waitForSelector('.fsheet2');
  found.filter = await small(page, '.fsheet2');
  await page.keyboard.press('Escape');

  // My Decks: import a deck, the deck menu (colour dots and custom shade)
  await go('decks');
  await page.getByRole('button', { name: 'IMPORT DECK' }).click();
  found.deckImport = await small(page, '.dimport');
  await page.keyboard.press('Escape');
  await page.locator('.dcard').first().click({ button: 'right' });
  await page.waitForSelector('.deckmenu');
  found.deckMenu = await small(page, '.deckmenu');
  await shot('deck-menu');
  await page.keyboard.press('Escape');

  expect(found).toEqual({ options: [], cardMenu: [], swap: [], import: [], binder: [], filter: [], deckImport: [], deckMenu: [] });
});
