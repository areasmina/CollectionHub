import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

/** Deck and commander pages on phones: ⋮ and the search share the bar's first row; view and SIZE sit on the second. */
test('Phone tool bar: ⋮ and search on one row, view controls under them', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the two-row bar is the phone shape');
  await mockWorld(page);
  await seed(page);
  await page.locator('.ccard').first().click();
  const bar = page.locator('.lists > .tbar');
  await bar.scrollIntoViewIfNeeded();
  const top = (sel: string) => bar.locator(sel).first().evaluate((e) => Math.round(e.getBoundingClientRect().top));
  expect(Math.abs((await top('.tbmore')) - (await top('.tsearch')))).toBeLessThanOrEqual(2);
  expect(await top('.tquick')).toBeGreaterThan(await top('.tsearch'));
  expect(Math.round((await bar.boundingBox())!.height)).toBeLessThanOrEqual(108);
});
