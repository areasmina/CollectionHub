import { expect, test } from '@playwright/test';
import { mockWorld, seed, settled } from './mock';

/**
 * Round 7c (Guillermo, Nov 16): three things that belong to the whole app.
 *  - the jump rail is drawn over the cards, never behind them;
 *  - the ⋮ on a card is nearly invisible while you read the card and clear as soon as you point at it;
 *  - the ⋮ options button is the first thing on every tool bar ("should be a world rule in the app").
 */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('The jump rail is painted over the cards, not behind them', async ({ page }, info) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard', { hasText: 'Tatyova Lands' }).click();
  const rail = page.getByRole('navigation', { name: 'Jump to section' });
  if (info.project.name === 'phone') {
    await expect(page.locator('.dpage .lists').first()).toBeAttached();
    await page.locator('.lists > .tbar').first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
  }
  await expect(rail).toBeVisible();
  await settled(page);
  // Every rail tag is the thing the browser hits at its own centre: nothing from the card list is on top of it.
  // The sticky tool bar is frame and sits over everything in its lane; the cards must not.
  const buried = await rail.evaluate((nav) => {
    const bad: string[] = [];
    for (const b of nav.querySelectorAll('button')) {
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) as HTMLElement | null;
      if (!hit || nav.contains(hit) || hit.closest('.tbar, .pillnav, .islandwrap')) continue;
      bad.push(`${b.getAttribute('aria-label')} → ${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0]}`);
    }
    return bad;
  });
  expect(buried, 'rail tags covered by the cards').toEqual([]);
});

test('A card\'s ⋮ is faint until you point at it', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const tile = page.locator('.coll .ctile').first();
  await expect(tile).toBeVisible();
  const more = tile.locator('.morebtn').first();
  const rest = await more.evaluate((e) => Number(getComputedStyle(e).opacity));
  const canHover = await page.evaluate(() => matchMedia('(hover: hover)').matches && matchMedia('(min-width: 701px)').matches);
  if (!canHover) {
    // a finger cannot hover: the dots keep enough presence to be found, and still stay out of the way
    expect(rest).toBeGreaterThan(0.3);
    expect(rest).toBeLessThan(0.7);
  } else {
    expect(rest).toBeLessThan(0.35);
    await tile.hover();
    await expect.poll(() => more.evaluate((e) => Number(getComputedStyle(e).opacity))).toBe(1);
  }
  // it is still a full tap target, whatever its colour
  const box = (await more.boundingBox())!;
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24);
});

test('The ⋮ options button is the first thing on a tool bar', async ({ page }) => {
  for (const tab of ['discover', 'collection'] as const) {
    await page.evaluate((t) => localStorage.setItem('ch:tab', t), tab);
    await page.reload();
    const bar = page.locator('.dtools.tbar').first();
    await expect(bar).toBeVisible();
    const left = await bar.evaluate((b) => {
      const kid = (e: Element) => ({ cls: String((e as HTMLElement).className).split(' ').slice(-1)[0], x: Math.round(e.getBoundingClientRect().left) });
      const kids = [...b.children].filter((e) => e.getBoundingClientRect().width > 4).map(kid);
      const more = kids.find((k) => k.cls === 'tbmore')!;
      return { more, ahead: kids.filter((k) => k.x < more.x - 1) };
    });
    expect(left.ahead, `${tab}: things to the left of the ⋮`).toEqual([]);
    // and the keyboard meets it in the same order the eye does
    expect(await bar.evaluate((b) => b.firstElementChild?.classList.contains('tbmore'))).toBe(true);
  }
  // the deck page's own list bar follows the same rule
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard', { hasText: 'Tatyova Lands' }).click();
  const bar = page.locator('.lists > .dtools.tbar').first();
  await expect(bar).toBeVisible();
  expect(await bar.evaluate((b) => b.firstElementChild?.classList.contains('tbmore'))).toBe(true);
});
