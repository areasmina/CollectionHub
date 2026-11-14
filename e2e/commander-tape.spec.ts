import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

/** Collection grid: a card that can be a commander wears a yellow COMMANDER tape, on the same line as its price sticker. */
test('Collection grid: COMMANDER tape on commanders only, level with the price sticker, inside the screen', async ({ page }, info) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const tile = page.locator('.ctile', { hasText: 'Tatyova, Benthic Druid' });
  await tile.scrollIntoViewIfNeeded();
  const tape = tile.locator('.cmdtape');
  await expect(tape).toBeVisible();
  await expect(tape).toHaveText('COMMANDER');
  // only the one legendary creature in the binder has it
  await expect(page.locator('.ctile .cmdtape')).toHaveCount(1);
  await expect(page.locator('.ctile', { hasText: 'Sol Ring' }).locator('.cmdtape')).toHaveCount(0);
  // yellow tape, same top line as the price sticker, on the other corner, and not past the screen edge
  expect(await tape.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 204, 0)');
  const [t, p, c] = await tile.evaluate((li) => {
    const top = (s: string) => (li.querySelector(s) as HTMLElement).offsetTop;
    const el = li.querySelector('.cmdtape') as HTMLElement;
    const pr = li.querySelector('.cart > .price') as HTMLElement;
    return [top('.cmdtape'), top('.cart > .price'), el.offsetLeft + el.offsetWidth <= pr.offsetLeft ? 1 : 0];
  });
  expect(Math.abs(t - p)).toBeLessThanOrEqual(4);
  expect(c).toBe(1);
  const b = (await tape.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: `test-results/commander-tape-${info.project.name}.png` });
});
