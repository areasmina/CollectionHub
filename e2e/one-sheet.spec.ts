import { expect, test, type Page } from '@playwright/test';
import { closeOpts, mockWorld, opts, seed } from './mock';

/**
 * One sheet (audit roadmap, phase 2). On phones the ⋮ options, the card menu and the deck menu are the same bottom
 * sheet as Collection's filter: full width on the bottom edge, a ✕, thumb-sized controls, the page dimmed behind it and
 * the island out of the way. Wider screens keep the popover under the button.
 */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

const go = async (page: Page, tab: 'discover' | 'collection' | 'decks') => {
  await page.evaluate((t) => localStorage.setItem('ch:tab', t), tab);
  await page.reload();
};
const box = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => (({ left, right, top, bottom }) => ({ left, right, top, bottom, vw: innerWidth, vh: innerHeight, position: getComputedStyle(e).position }))(e.getBoundingClientRect()));

/** The checks every open options sheet must pass on a phone. */
const isSheet = async (page: Page) => {
  const body = '.tbmore[open] > .fbody';
  await expect.poll(async () => Math.round((await box(page, body)).bottom)).toBe(page.viewportSize()!.height);
  const b = await box(page, body);
  expect(b.position).toBe('fixed');
  expect(Math.round(b.left)).toBe(0);
  expect(Math.round(b.right)).toBe(b.vw);
  expect(b.top).toBeGreaterThanOrEqual(b.vh * 0.14); // never taller than 85% of the screen
  await expect(page.locator(`${body} .sheethead .close`)).toBeVisible();
  // every control is a full thumb target
  const small = await page.locator(`${body} :is(button, select)`).evaluateAll((els) => els.filter((e) => e.getClientRects().length && e.getBoundingClientRect().height < 43.5).map((e) => `${e.className}:${Math.round(e.getBoundingClientRect().height)}`));
  expect(small).toEqual([]);
  // the island has stepped off the screen, so nothing floats over the sheet
  await expect.poll(() => page.locator('.pillnav').evaluateAll((els) => els.every((e) => e.getBoundingClientRect().top >= innerHeight - 1))).toBe(true);
};

test('Options: a bottom sheet on phones, a popover under ⋮ on wider screens, on every page', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  const pages: [string, () => Promise<unknown>][] = [
    ['discover', async () => {}],
    ['commander', () => page.locator('.ccard').first().click()],
    ['collection', () => go(page, 'collection')],
    ['deck', async () => (await go(page, 'decks'), await page.locator('.dcard').first().click())],
  ];
  for (const [name, open] of pages) {
    await open();
    const d = await opts(page);
    await expect(d.locator('.fbody')).toBeVisible();
    if (phone) await isSheet(page);
    else {
      expect((await box(page, '.tbmore[open] > .fbody')).position, name).toBe('absolute');
      await expect(d.locator('.sheethead')).toBeHidden();
    }
    await page.screenshot({ path: `test-results/one-sheet-${name}-${info.project.name}.png` });
    await closeOpts(page);
    await expect(page.locator('.tbmore[open]')).toHaveCount(0);
  }
});

test('Options sheet closes four ways: ✕, Escape, a tap on the dimmed page, and ⋮ again', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the sheet is the phone shape');
  const open = page.locator('.tbmore[open]');
  const d = await opts(page);
  await d.locator('.sheethead .close').click();
  await expect(open).toHaveCount(0);
  await opts(page);
  await page.keyboard.press('Escape');
  await expect(open).toHaveCount(0);
  await opts(page);
  await page.mouse.click(200, 150); // the dimmed page above the sheet
  await expect(open).toHaveCount(0);
  await opts(page);
  await d.locator('summary').click();
  await expect(open).toHaveCount(0);
  // closed: the island is back and the page can be used again
  await expect.poll(() => page.locator('.pillnav').first().evaluate((e) => e.getBoundingClientRect().top < innerHeight)).toBe(true);
  await page.locator('.ccard').first().click();
  await expect(page.locator('.vhero')).toBeVisible();
});

test('Options sheet keeps every choice it had as a dropdown (commander page)', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the sheet is the phone shape');
  await page.locator('.ccard').first().click();
  const d = await opts(page);
  await expect(d.getByLabel('Pin card in deck')).toBeVisible();
  await expect(d.getByLabel('Card left out')).toBeVisible();
  await expect(d.getByRole('button', { name: 'APPLY' })).toBeVisible();
  await expect(d.locator('.themes')).toBeVisible();
  await expect(d.getByRole('radiogroup', { name: 'Gear' })).toBeVisible();
  await expect(d.locator('.sbox')).toHaveCount(5);
  // a choice made in the sheet takes effect and the sheet stays open for the next one
  await d.locator('.show-pick select').selectOption('owned');
  await expect(d.locator('.show-pick select')).toHaveValue('owned');
  await expect(page.locator('.tbmore[open]')).toHaveCount(1);
  await closeOpts(page);
});

test('Card menu: the same bottom sheet on phones, a pop-up by the card on wider screens', async ({ page }, info) => {
  await page.locator('.ccard').first().click();
  const card = page.locator('.lists [data-card]').first();
  await card.scrollIntoViewIfNeeded();
  await card.click({ button: 'right' });
  const menu = page.locator('.cardmenu');
  await expect(menu).toBeVisible();
  const b = await box(page, '.cardmenu');
  if (info.project.name === 'phone') {
    expect(Math.round(b.left)).toBe(0);
    expect(Math.round(b.right)).toBe(b.vw);
    expect(Math.round(b.bottom)).toBe(b.vh);
    const small = await menu.locator('li > :is(button, a)').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 43.5).length);
    expect(small).toBe(0);
    await expect.poll(() => page.locator('.pillnav').evaluateAll((els) => els.every((e) => e.getBoundingClientRect().top >= innerHeight - 1))).toBe(true);
  } else expect(b.right - b.left).toBeLessThan(b.vw / 2);
  await page.screenshot({ path: `test-results/one-sheet-cardmenu-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});
