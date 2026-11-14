import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

/** Sacred card rule: nothing sits on top of a card's name, mana cost, rules text or collector line. */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('Commander and deck pages: the ⋯ OPTIONS tag hangs under the commander card, never on it', async ({ page }) => {
  const check = async () => {
    const btn = page.locator('.cmdrbtn').first();
    await expect(btn).toBeVisible();
    // both boxes in one read: the page can still be scrolling into place after a load, and two separate reads would
    // measure the card and the tag at different scroll positions
    const [imgBottom, tagTop] = await btn.evaluate((b) => [b.querySelector('img')!.getBoundingClientRect().bottom, b.querySelector('.cmdrmore')!.getBoundingClientRect().top]);
    expect(tagTop).toBeGreaterThanOrEqual(imgBottom - 1); // below the card's bottom edge
    await expect(btn.locator('.cmdrhint')).toHaveCount(0); // the old tape over the rules text is gone
  };
  await page.locator('.ccard').first().click();
  await check();
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard', { hasText: 'Tatyova Lands' }).click();
  await check();
});

test('Collection: a foil card shines on its picture and frame, never over its name, type line or rules text', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const foil = page.locator('.timg.foil').first();
  await expect(foil).toBeVisible();
  const look = await foil.evaluate((e) => {
    const a = getComputedStyle(e, '::after');
    const b = getComputedStyle(e, '::before');
    return { clip: a.clipPath, mask: b.maskImage || (b as unknown as Record<string, string>).webkitMaskImage };
  });
  expect(look.clip).toContain('inset'); // the strong shine is held to the art box
  expect(look.mask).toContain('gradient'); // the frame sheen is masked to the outer border
});

test('Foil shine is animated (sweep + drifting rainbow) and stands still when motion is reduced', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const foil = page.locator('.timg.foil').first();
  await expect(foil).toBeVisible();
  const names = () => foil.evaluate((e) => getComputedStyle(e, '::after').animationName);
  expect(await names()).toContain('foilsweep');
  expect(await names()).toContain('foilwash');
  // the light really moves: the sweep position changes over time
  const pos = () => foil.evaluate((e) => getComputedStyle(e, '::after').getPropertyValue('--sw'));
  const first = await pos();
  await expect.poll(pos, { timeout: 4000 }).not.toBe(first);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(names).toBe('none');
});

test('Card pictures are never tilted: the Hidden Gem thumbnail and the collection grid sit square', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  await expect(page.locator('.ztile .timg, .ctile .timg').first()).toBeVisible();
  const tilted = await page.evaluate(() => {
    const bad: string[] = [];
    // a stand-in Hidden Gem card, styled by the real stylesheet
    const host = document.createElement('div');
    host.className = 'dpage';
    host.innerHTML = '<div class="wildcard"><img class="wthumb" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></div>';
    document.body.appendChild(host);
    const all = [...document.querySelectorAll('.timg, .thumb, .wthumb')];
    for (const el of all) {
      for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
        const t = getComputedStyle(n).transform;
        if (t !== 'none' && !/^matrix\(1, 0, 0, 1,/.test(t)) bad.push(`${el.className} <- ${(n as HTMLElement).className}: ${t}`);
      }
    }
    host.remove();
    return bad;
  });
  expect(tilted).toEqual([]);
});
