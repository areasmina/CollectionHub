import { expect, test } from '@playwright/test';
import { addSignet, mockWorld, seed } from './mock';

/** Interface precision: every pop-up that opens under a button stays inside the screen, on the smallest phones too. */
for (const [w, h] of [[320, 568], [360, 640]] as const) {
  test(`Pop-ups stay on screen at ${w}px: deck notes, the ⋮ options menu`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await mockWorld(page);
    await seed(page);
    await addSignet(page);
    const inside = async (sel: string) => {
      const box = await page.locator(sel).first().boundingBox();
      expect(box, `${sel} is open`).not.toBeNull();
      expect(box!.x, `${sel} left edge`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${sel} right edge`).toBeLessThanOrEqual(w);
    };
    // the options (⋮) menu of the binder's tool bar
    await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
    await page.reload();
    const more = page.locator('details.tbmore').first();
    await more.locator('summary').click();
    await expect(more.locator('.fbody')).toBeVisible();
    await page.waitForTimeout(200);
    await inside('details.tbmore[open] > .fbody');
    // the notes on a deck page (bracket, salt, readiness): every one that opens
    await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
    await page.reload();
    await page.locator('.dcard').first().click();
    await page.waitForTimeout(600);
    const pops = page.locator('details > .popnote, details > .vpop');
    const triggers = page.locator('details.scrap > summary, details.vtile > summary');
    const n = await triggers.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const t = triggers.nth(i);
      if (!(await t.isVisible())) continue;
      await t.click({ force: true });
      await page.waitForTimeout(200);
      const open = page.locator('details[open] > .popnote, details[open] > .vpop').first();
      if (await open.count()) await inside('details[open] > .popnote, details[open] > .vpop');
      await t.click({ force: true });
    }
    void pops;
  });
}
