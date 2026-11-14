import { expect, test, type Page } from '@playwright/test';
import { addSignet, mockWorld, opts, seed } from './mock';

/**
 * Dynamic Island, phase 4 step 4: other floating things never sit under the island. The swap window and sheets send it
 * away on every edge; a top-docked island never covers the Forge bar's name or ✕ LEAVE; on a phone a bottom-docked
 * island never covers the Forge suggestions sheet.
 */
const start = async (page: Page, dock: string, tab = 'decks') => {
  await mockWorld(page);
  await seed(page);
  await addSignet(page);
  await page.evaluate(([d, t]) => (localStorage.setItem('ch:island_dock', d), localStorage.setItem('ch:tab', t)), [dock, tab]);
  await page.reload();
};
/** The visible island's area that lies over the given elements (0 when it is away or hidden). */
const under = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const nav = document.querySelector('.pillnav') as HTMLElement;
    const cs = getComputedStyle(nav);
    if (nav.classList.contains('away') || cs.visibility === 'hidden' || cs.opacity === '0') return 0;
    const a = nav.querySelector('.island-content')!.getBoundingClientRect();
    let area = 0;
    for (const el of document.querySelectorAll(s)) {
      if (!(el as HTMLElement).checkVisibility()) continue;
      const b = el.getBoundingClientRect();
      area += Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    }
    return Math.round(area);
  }, sel);
const settle = (page: Page) => page.waitForTimeout(450); // the island and the bars slide
/** The island is out of the way: faded out, or (a phone's bottom dock) slid below the screen. */
const gone = (page: Page) =>
  expect
    .poll(() =>
      page.locator('.pillnav').evaluate((n) => {
        const cs = getComputedStyle(n);
        return cs.visibility === 'hidden' || cs.opacity === '0' || n.getBoundingClientRect().top >= innerHeight - 1;
      }),
    )
    .toBe(true);

for (const dock of ['top', 'bottom', 'left', 'right'] as const)
  test(`Island docked ${dock}: the swap window and the options sheet send it away`, async ({ page }, info) => {
    await start(page, dock, 'discover');
    await page.locator('.ccard').first().click();
    await page.waitForSelector('details.cat');
    await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
    await expect(page.locator('.swapnote')).toBeVisible();
    await gone(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.swapnote')).toHaveCount(0);
    await settle(page);
    await expect(page.locator('.pillnav')).toBeVisible(); // back as soon as the window closes
    if (info.project.name === 'phone') {
      await opts(page, '.lists');
      await gone(page);
    }
  });

test('Island docked top: never on the Forge bar\'s name or ✕ LEAVE', async ({ page }, info) => {
  await start(page, 'top');
  await page.locator('.dcard', { hasText: 'Tatyova Lands' }).click();
  await expect(page.locator('.forgetop')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  await expect(page.locator('.pillnav.away')).toHaveCount(0);
  expect(await under(page, '.forgetop .fstamp, .forgetop .ftitle, .forgetop button')).toBe(0);
  await page.screenshot({ path: `test-results/island-clear-forge-top-${info.project.name}.png` });
  // going down the island leaves and the bar goes back to the top edge; coming up, both come back. (Only where the bar
  // moves: from 1100px wide the Forge scrolls inside its own panes and the island rests in the bar's empty middle.)
  if ((page.viewportSize()?.width ?? 0) >= 1100) return;
  await page.evaluate(() => void ((document.querySelector('.stage') as HTMLElement).style.minHeight = `${innerHeight * 3}px`)); // room to scroll
  await page.mouse.wheel(0, 500);
  await expect(page.locator('.pillnav.away')).toHaveCount(1);
  await settle(page);
  expect(Math.round((await page.locator('.forgetop').boundingBox())!.y)).toBe(0);
  await page.mouse.wheel(0, -200);
  await expect(page.locator('.pillnav.away')).toHaveCount(0);
  await settle(page);
  expect(await under(page, '.forgetop .fstamp, .forgetop .ftitle, .forgetop button')).toBe(0);
});

test('Island docked bottom on a phone: the Forge suggestions sheet peeks above it', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the suggestions are a bottom sheet only on phones');
  await start(page, 'bottom');
  await page.locator('.dcard', { hasText: 'Tatyova Lands' }).click();
  await expect(page.locator('.fsugg')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  await expect(page.locator('.pillnav.away')).toHaveCount(0);
  expect(await under(page, '.fsugg')).toBe(0);
  await page.screenshot({ path: 'test-results/island-clear-forge-bottom-phone.png' });
  // pulled up, the sheet is the thing you are using: it goes to the bottom edge and covers the island
  await page.locator('.fsugg .fgrab').click();
  await expect(page.locator('.fsugg.up')).toBeVisible();
});
