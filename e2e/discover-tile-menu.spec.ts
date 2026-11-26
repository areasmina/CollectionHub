import { expect, test, type Page } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

// Guillermo, Nov 16: "add a right click menu when clicking decks in discover with useful menu option".
// Right-click (or press and hold on touch) a commander tile: a menu. A plain tap still opens the commander page.

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await mockWorld(page);
  await seed(page);
});

const tile = (page: Page) => page.locator('.disc .ccard').first();
const deckCount = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((ok) => {
        const q = indexedDB.open('collectionhub');
        q.onsuccess = () => {
          const r = q.result.transaction('decks').objectStore('decks').count();
          r.onsuccess = () => ok(r.result);
        };
      }),
  );

test('right-click a commander tile: the menu, on screen, with its options', async ({ page }) => {
  await expect(tile(page)).toBeVisible();
  await expect(tile(page).locator('.cmatch b')).toHaveText(/%/); // EDHREC stats are in
  await tile(page).click({ button: 'right' });
  const menu = page.locator('.tilemenu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.mh')).toContainText('Tatyova');
  await expect(menu.locator('.mstat')).toHaveText(/\d+% OWNED/);
  for (const name of ['OPEN COMMANDER PAGE', /SAVE TO MY DECKS/, /COPY DECK LIST/, /COPY MISSING/, /^EDHREC/, /^COMBOS/, /^ARCHIDEKT/]) {
    await expect(menu.getByRole('menuitem', { name })).toBeVisible();
  }
  // the saved deck led by this commander is one tap away
  await expect(menu.getByRole('menuitem', { name: 'Tatyova Lands' })).toBeVisible();
  // the outside links point at this commander
  await expect(menu.getByRole('menuitem', { name: /^EDHREC/ })).toHaveAttribute('href', 'https://edhrec.com/commanders/tatyova-benthic-druid');
  await expect(menu.getByRole('menuitem', { name: /SAVE TO MY DECKS/ })).toBeEnabled();
  await fits(page, ['.tilemenu', '.tilemenu li']);
  // still on Discover: the right-click didn't open the commander page
  await expect(page.locator('.discohero')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('a plain tap still opens the commander page; the menu item does too', async ({ page }) => {
  await tile(page).click();
  await expect(page.locator('.vcard').first()).toBeVisible();
  await expect(page.locator('.tilemenu')).toHaveCount(0);
  await page.goto('/');
  await tile(page).click({ button: 'right' });
  await page.locator('.tilemenu').getByRole('menuitem', { name: 'OPEN COMMANDER PAGE' }).click();
  await expect(page.locator('.tilemenu')).toHaveCount(0);
  await expect(page.locator('.vcard').first()).toBeVisible();
});

test('press and hold on touch opens the menu, and the hold does not open the commander page', async ({ page }) => {
  const box = (await tile(page).boundingBox())!;
  const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 3, button: 0, pointerType: 'touch', isPrimary: true, bubbles: true };
  await tile(page).dispatchEvent('pointerdown', at);
  await page.waitForTimeout(650);
  await tile(page).dispatchEvent('pointerup', at);
  await tile(page).dispatchEvent('click', at); // the click a hold ends in
  await expect(page.locator('.tilemenu')).toBeVisible();
  await expect(page.locator('.discohero')).toBeVisible();
  await expect(page.locator('.vcard')).toHaveCount(0);
});

test('save the average deck to My Decks, with UNDO', async ({ page }) => {
  await expect(tile(page).locator('.cmatch b')).toHaveText(/%/);
  const before = await deckCount(page);
  await tile(page).click({ button: 'right' });
  await page.locator('.tilemenu').getByRole('menuitem', { name: /SAVE TO MY DECKS/ }).click();
  const toast = page.locator('.toast');
  await expect(toast).toContainText('Saved as “Tatyova, Benthic Druid (EDHREC average)”');
  expect(await deckCount(page)).toBe(before + 1);
  await toast.getByRole('button', { name: 'UNDO' }).click();
  await expect.poll(() => deckCount(page)).toBe(before);
});

test('copy the deck list as "qty name" lines, commander first', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard read needs Chromium permissions');
  await expect(tile(page).locator('.cmatch b')).toHaveText(/%/);
  await tile(page).click({ button: 'right' });
  await page.locator('.tilemenu').getByRole('menuitem', { name: /COPY DECK LIST/ }).click();
  await expect(page.locator('.toast')).toContainText('Copied');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  const lines = text.split(/\r?\n/);
  expect(lines[0]).toBe('1 Tatyova, Benthic Druid');
  expect(lines).toContain('1 Sol Ring');
  expect(lines).toContain('10 Forest');
});
