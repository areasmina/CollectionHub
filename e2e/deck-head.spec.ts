import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

/**
 * Guillermo, Nov 15 (deck page): "price value can be moved below to the squares… remove black bar"; and in the Forge,
 * "suggestions on the right should be only for owned cards so remove green and check as we already know we own them".
 */
test('The deck price rides with the stat squares, and the black bar under the hero is gone', async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'discover'));
  await page.reload();
  await page.locator('.cgrid li, .cgrid .ctile').first().click();
  await expect(page.locator('.vhero .vtiles')).toBeVisible();

  // a fourth square, inside the hero, next to READINESS · BRACKET FIT · SALT LEVEL
  const note = page.locator('.vhero .vtiles .vtile.vnote');
  await expect(note).toHaveCount(1);
  await expect(note).toContainText(/deck ≈|stand-in/);

  // the cost no longer lives in the strip, and the strip is no longer a band
  await expect(page.locator('.dstrip .dcost')).toHaveCount(0);
  const flat = await page.locator('.dstrip').evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, top: s.borderTopWidth, bottom: s.borderBottomWidth };
  });
  expect(flat.bg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(flat.top).toBe('0px');
  expect(flat.bottom).toBe('0px');

  // the squares and the note sit on the same line on a wide screen
  if (test.info().project.name === 'desktop') {
    const tops = await page.locator('.vhero .vtiles > *').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size, 'the note dropped off the squares row').toBe(1);
  }
});

test('Forge suggestions drop the "yours" and "owned" tags', async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'discover'));
  await page.reload();
  await page.locator('.cgrid li, .cgrid .ctile').first().click();
  const forge = page.locator('.dacts .forge').first();
  await expect(forge).toBeVisible();
  await forge.click();
  await expect(page.locator('.fsugg')).toBeVisible();

  await expect(page.locator('.fsugg .cown')).toHaveCount(0);
  await expect(page.locator('.fsugg')).not.toContainText('✓ yours');
  await expect(page.locator('.fsugg-mini-card.owned')).toHaveCount(0);
});

/** Guillermo, Nov 15: "I'm worried if I have more than enough decks — how will you list them there?" */
test('"your decks" shows three and a count when a commander has more', async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  // five decks on the same commander as the seeded one
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok, no) => {
      const q = indexedDB.open('collectionhub');
      q.onsuccess = () => ok(q.result);
      q.onerror = no;
    });
    const tx = db.transaction(['decks'], 'readwrite');
    const all: { name: string; commander?: string; cards: unknown }[] = await new Promise((ok) => {
      const r = tx.objectStore('decks').getAll();
      r.onsuccess = () => ok(r.result);
    });
    const first = all[0];
    for (let i = 2; i <= 5; i++) {
      const copy = { ...(first as Record<string, unknown>), name: `${first.name} ${i}`, updated: Date.now() };
      delete copy.id;
      tx.objectStore('decks').put(copy);
    }
    await new Promise((ok) => (tx.oncomplete = ok));
  });
  await page.evaluate(() => localStorage.setItem('ch:tab', 'discover'));
  await page.reload();
  await page.locator('.cgrid li, .cgrid .ctile').first().click();

  const line = page.locator('.vhero .vmeta .mydecks');
  await expect(line).toBeVisible();
  await expect(line.locator('.decklink')).toHaveCount(3);
  const more = line.locator('.mydecks-more');
  await expect(more).toHaveText('+2 more');
  await more.click();
  await expect(line.locator('.decklink')).toHaveCount(5);
  await expect(more).toHaveText('fewer');
});
