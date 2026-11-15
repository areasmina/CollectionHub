import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

/**
 * Collection: the two faces swipe (Guillermo, Nov 15), and the move is shown rather than hidden — the tabs stay on
 * screen and the first visit on a device leans the tabs once and says "swipe".
 */
const swipe = (page: import('@playwright/test').Page, from: number, to: number) =>
  page.evaluate(
    ([a, b]) => {
      const el = document.querySelector('main.coll')!;
      const fire = (type: string, x: number) =>
        el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: 420, bubbles: true }));
      fire('pointerdown', a);
      fire('pointerup', b);
    },
    [from, to],
  );

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
});

test('Collection: a swipe turns the page to ANALYTICS and back, and the tabs stay the plain way to do it', async ({ page }) => {
  const cards = page.getByRole('tab', { name: /CARDS/ });
  const analytics = page.getByRole('tab', { name: 'ANALYTICS' });
  await expect(cards).toHaveAttribute('aria-selected', 'true');
  await swipe(page, 320, 90); // right to left: the next face
  await expect(analytics).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.coll .apanel')).toBeVisible();
  await swipe(page, 90, 320); // and back
  await expect(cards).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.coll .cgrid2, .coll .ctile').first()).toBeVisible();
  // a short drag is not a swipe: it leaves the page where it was
  await swipe(page, 300, 260);
  await expect(cards).toHaveAttribute('aria-selected', 'true');
});

test('Collection: the swipe hint shows once on a device, then never again', async ({ page }) => {
  const hint = page.locator('.coll .ctab-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText(/swipe/i);
  await page.getByRole('tab', { name: 'ANALYTICS' }).click(); // the hint's job is done once the move is known
  await expect(hint).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('tab', { name: /CARDS/ })).toBeVisible();
  await expect(page.locator('.coll .ctab-hint')).toHaveCount(0);
});
