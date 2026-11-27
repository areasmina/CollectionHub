import { test, expect, type Page } from '@playwright/test';
import { addSignet, mockWorld, seed, showStats } from './mock';

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

const go = async (page: Page, tab: 'discover' | 'collection' | 'decks') => {
  await page.evaluate((t) => localStorage.setItem('ch:tab', t), tab);
  await page.reload();
};

test.describe('Collection & Decks Workbench Features', () => {
  test('Collection: no duplicate numbers bar, big squared cards visible, and import pop-up modal opens cleanly', async ({ page }) => {
    await go(page, 'collection');

    // Duplicate dsum text bar is removed (and with it the fold it sat on)
    await expect(page.locator('.dsum, details.dash')).toHaveCount(0);

    // Squared stat cards are visible
    await showStats(page); // they start folded (Nov 13)
    await expect(page.locator('.stats .stat')).toHaveCount(3);
    await expect(page.locator('.stats .slip')).toBeVisible();

    // Inline details.importbox accordion is removed
    await expect(page.locator('details.importbox')).toHaveCount(0);

    // Clicking IMPORT button opens the modal pop-up window
    await page.locator('.slip-btn.import').click();
    const modal = page.locator('.importbox-pop');
    await expect(modal).toBeVisible();
    await expect(modal.locator('h2, .nh')).toContainText('IMPORT CARDS');
    await expect(modal.locator('textarea')).toBeVisible();
    await expect(modal.locator('.u-btn.file')).toBeVisible();

    // Closing modal via Cancel button
    await modal.getByRole('button', { name: 'CANCEL' }).click();
    await expect(modal).toHaveCount(0);
  });

  test('Decks Workbench: redundant shelf removed, zine ribbon, workbench toolbar with search/sort/filter, and custom color picker', async ({ page }) => {
    await go(page, 'decks');

    // Redundant horizontal shelf row is removed from Decks
    await expect(page.locator('.shelfhead, .shelfrow')).toHaveCount(0);

    // The deck buttons ride the ransom title band since Nov 15 (they used to sit on the overview ribbon)
    // and since Nov 19 they are Collection's own labels and tabs (DECKS | STATS, + GUIDED / + NEW DECK, IMPORT)
    await expect(page.locator('.dlist .decksactions .slip-btn.deck').first()).toBeVisible();
    await expect(page.locator('.dribbon')).toHaveCount(0); // the tiles wait on the STATS tab

    // Decks toolbar is visible with search, sort, and filters
    const toolbar = page.locator('.decktoolbar');
    await expect(toolbar).toBeVisible();
    await expect(toolbar.locator('input[type="search"]')).toBeVisible();
    await expect(toolbar.locator('select')).toBeVisible();
    await expect(toolbar.locator('.dstatuspick .u-chip')).toHaveCount(4);

    // Open deck menu on first deck
    const firstDeck = page.locator('.dtile .dcard').first();
    await firstDeck.scrollIntoViewIfNeeded();
    await firstDeck.click({ button: 'right' });
    if (!(await page.locator('.deckmenu').isVisible({ timeout: 1000 }).catch(() => false))) {
      const b = (await firstDeck.boundingBox())!;
      await firstDeck.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: b.x + 20, clientY: b.y + 20, isPrimary: true, bubbles: true });
      await page.waitForTimeout(650);
    }
    const menu = page.locator('.deckmenu');
    await expect(menu).toBeVisible();

    // The deck colour is a compact rainbow square (Guillermo, Nov 26)
    await expect(menu.locator('.swatches, .custom-color-label')).toHaveCount(0);
    const wheel = menu.locator('.cwheel');
    await expect(wheel).toBeVisible();
    const w = (await wheel.boundingBox())!;
    expect(w.width).toBeLessThanOrEqual(48);
    expect(w.height).toBeLessThanOrEqual(48);
    const before = await menu.locator('.cwheel-val').innerText();
    await wheel.focus();
    await page.keyboard.press('ArrowRight');
    await expect(menu.locator('.cwheel-val')).not.toHaveText(before);
    await expect(menu.locator('.cwheel-val')).toHaveText(/^#[0-9A-F]{6}$/);
    await expect(menu.locator('.cwheel-now')).toHaveCSS('background-color', /rgb\(/);

    // Add tag action is available
    await expect(menu.getByRole('menuitem', { name: '+ ADD TAG' })).toBeVisible();
  });

  test('Decks overview: DECKS | STATS tabs like Collection; the page opens on the decks, the tabs sit in line with + NEW DECK / IMPORT', async ({ page }, info) => {
    await go(page, 'decks');
    const tab = (name: string) => page.locator('.dlist .ctab', { hasText: name });
    // opens on DECKS, tiles out of the way (they start hidden, every time, like Collection's)
    await expect(tab('DECKS')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.dstats')).toHaveCount(0);
    await expect(page.locator('.dcard').first()).toBeVisible();
    // on wide screens the tabs and actions share one row; every control keeps >= 44px tap height
    const mid = async (sel: string) => { const b = (await page.locator(sel).first().boundingBox())!; return b.y + b.height / 2; };
    if (info.project.name !== 'phone') {
      expect(Math.abs((await mid('.dlist .ctab.on')) - (await mid('.dlist .decksactions .slip-btn.import')))).toBeLessThanOrEqual(4);
    }
    for (const sel of ['.dlist .ctab.on', '.dlist .decksactions .slip-btn.deck', '.dlist .decksactions .slip-btn.import'])
      expect((await page.locator(sel).first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // the same parts as Collection: same tab stamp, same ink and red labels
    const look = (sel: string) => page.locator(sel).first().evaluate((e) => { const c = getComputedStyle(e); return `${c.fontFamily}|${c.backgroundColor}`; });
    const decks = { tab: await look('.dlist .ctab.on'), imp: await look('.dlist .slip-btn.import') };
    // STATS shows the tiles and hides the decks; DECKS brings them back
    await tab('STATS').click();
    await expect(page.locator('.dstats .stat').first()).toBeVisible();
    await expect(page.locator('.dcard')).toHaveCount(0);
    await tab('DECKS').click();
    await expect(page.locator('.dcard').first()).toBeVisible();
    await page.reload();
    await expect(tab('DECKS')).toHaveAttribute('aria-selected', 'true');
    await go(page, 'collection');
    expect(await look('.coll .ctab.on')).toBe(decks.tab);
    expect(await look('.coll .slip-btn.import')).toBe(decks.imp);
  });

  test('Forge cube on phones: CARDS · ANALYSIS · TO BUY tabs and face switching', async ({ page }, info) => {
    if (info.project.name !== 'phone') return; // cube tabs are phone-only
    await addSignet(page); // Arcane Signet must be owned so it appears in .picks
    await page.locator('.ccard').first().click();
    // enter forge mode via a swap
    await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
    await page.getByRole('dialog', { name: 'Swap Sol Ring' }).locator('.picks button', { hasText: 'Arcane Signet' }).click();

    // cube tablist should be present
    const cube = page.locator('.fcube[role="tablist"]');
    await expect(cube).toBeVisible();
    await expect(cube.getByRole('tab')).toHaveText(['CARDS', 'ANALYSIS', 'TO BUY']);
    await expect(cube.getByRole('tab', { name: 'CARDS' })).toHaveAttribute('aria-selected', 'true');

    // switch to ANALYSIS: fmeters should scroll into view
    await cube.getByRole('tab', { name: 'ANALYSIS' }).click();
    await page.waitForTimeout(400);
    await expect(page.locator('.fmeters')).toBeInViewport();

    // switch to TO BUY: fbuylist should appear
    await cube.getByRole('tab', { name: 'TO BUY' }).click();
    await page.waitForTimeout(400);
    await expect(page.locator('.fbuylist')).toBeInViewport();
  });

  test('Dynamic Island: only the light opens sync, lip does not toggle menus, and undocked floating has venom goo styling', async ({ page }) => {
    await go(page, 'discover');

    const island = page.locator('.pillnav');
    await expect(island).toBeVisible();

    // Tapping the sdot light opens the Dynamic Island sync drawer
    const light = page.locator('.syncpill .sdot');
    await light.click();
    const drawer = page.locator('.island-drawer');
    await expect(drawer).toBeVisible();

    // Close by clicking the scrim, up in the corner: the drawer itself covers the middle of the screen
    await page.locator('.island-scrim').click({ position: { x: 8, y: 8 } });
    await expect(drawer).toHaveCount(0);

    // Island lip is decorative and does not open drawer. (It takes no taps of its own since the island's 44px tap areas,
    // phase 4: a tap on the line lands on the section button under it, so tap its spot and check sync stays closed.)
    const lip = (await page.locator('.island-lip').boundingBox())!;
    await page.mouse.click(lip.x + lip.width / 2, lip.y + lip.height / 2);
    await expect(drawer).toHaveCount(0);
  });

  test('Sleek punk zine cohesion: Discover tabs flush single-row and Saved Deck top clearance + single-row strip', async ({ page }, info) => {
    await go(page, 'discover');

    const tabs = page.locator('.disc-tabs .ctab');
    await expect(tabs).toHaveCount(3);
    await expect(tabs).toHaveText(['COMMANDERS', 'GUIDED BUILDER', 'TAG BUILDER']);

    const tabMetrics = await tabs.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { top: Math.round(r.top), h: Math.round(r.height), bg: cs.backgroundColor, transform: cs.transform };
      })
    );
    expect(new Set(tabMetrics.map((t) => t.top)).size).toBe(1);
    expect(tabMetrics[0].bg).toBe('rgb(230, 0, 18)');
    expect(tabMetrics[0].transform).toBe('none');
    if (info.project.name === 'phone') {
      for (const m of tabMetrics) expect(m.h).toBeGreaterThanOrEqual(44);
    }

    const tabsBox = (await page.locator('.disc-tabs').boundingBox())!;
    const barBox = (await page.locator('.dfind > .dtools.tbar').boundingBox())!;
    expect(Math.abs(barBox.y - (tabsBox.y + tabsBox.height))).toBeLessThanOrEqual(2);

    // Saved Deck: dock island on top + COMPACT HEADER -> SHOW HEADER, verify .dstrip clears island and stays inline
    await page.evaluate(() => localStorage.setItem('ch:island_dock', 'top'));
    await go(page, 'decks');
    await page.locator('.dcard').first().click();
    await expect(page.locator('.forgemain > .dstrip')).toBeVisible();

    // Nov 27: on phones the deck's tools (BALANCE … COMPACT HEADER) live in the bar's ⋮, as its DECK row
    const phone = info.project.name === 'phone';
    const openTools = async () => {
      if (!phone) return;
      await page.locator('.lists > .tbar .tbmore > summary').click();
      await expect(page.locator('.deck-tools-row')).toBeVisible();
    };
    await openTools();
    await page.getByRole('button', { name: 'COMPACT HEADER' }).click();
    await openTools();
    await expect(page.getByRole('button', { name: 'SHOW HEADER' })).toBeVisible();
    if (phone) {
      for (const b of await page.locator('.deck-tools-row .u-btn').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(page.locator('.forgemain > .dstrip > .dacts')).toHaveCount(0);
      await page.keyboard.press('Escape');
      return;
    }

    const navBox = (await page.locator('.pillnav.dock-top').boundingBox())!;
    const stripBox = (await page.locator('.forgemain > .dstrip').boundingBox())!;
    expect(stripBox.y).toBeGreaterThanOrEqual(navBox.y + navBox.height - 2);

    const actButtons = page.locator('.forgemain > .dstrip > .dacts > .u-btn');
    const actMetrics = await actButtons.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), h: Math.round(r.height) };
      })
    );
    expect(new Set(actMetrics.map((b) => b.top)).size).toBe(1);
    if (info.project.name === 'phone') {
      for (const b of actMetrics) expect(b.h).toBeGreaterThanOrEqual(44);
    }
  });
});
