import { expect, test, type Page } from '@playwright/test';
import { mockWorld, seed, settled } from './mock';

/**
 * Dynamic Island, phase 4 step 1: the island only stays put where its own edge has room. A top-docked island used to
 * come back at the END of a page and land on content (Collection's + DECK and IMPORT on desktop).
 */
const open = async (page: Page, dock: string, tab: string) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(([d, t]) => (localStorage.setItem('ch:island_dock', d), localStorage.setItem('ch:tab', t)), [dock, tab]);
  await page.reload();
  await page.waitForSelector('.pillnav', { state: 'attached' });
};
/** Make the page long enough to scroll well past the island's rest zones, whatever the sample data gives. */
const stretch = (page: Page) => page.evaluate(() => void ((document.querySelector('.stage') as HTMLElement).style.minHeight = `${innerHeight * 3}px`));
const toEnd = (page: Page) => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
/** Tappable things under the island's visible body right now. */
const covered = (page: Page) =>
  page.evaluate(() => {
    const nav = document.querySelector('.pillnav')!;
    const c = nav.querySelector('.island-content')!.getBoundingClientRect();
    const hit = new Set<string>();
    for (let x = c.left + 3; x < c.right; x += 12)
      for (let y = Math.max(0, c.top) + 3; y < Math.min(innerHeight, c.bottom); y += 8)
        for (const e of document.elementsFromPoint(x, y))
          if (!nav.contains(e) && e.matches('button, a, input, select, summary')) hit.add(`${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).split(' ')[0]} "${(e.textContent ?? '').trim().slice(0, 14)}"`);
    return [...hit];
  });

for (const dock of ['top', 'left', 'right'] as const)
  test(`Island docked ${dock}: shows at the start of a page, stays away at the end, comes back on the way up`, async ({ page }) => {
    await open(page, dock, 'collection');
    await page.waitForSelector('.timg');
    await stretch(page);
    const nav = page.locator(`.pillnav.dock-${dock}`);
    await expect(nav).toBeVisible();
    await expect(page.locator('.pillnav.away')).toHaveCount(0); // start of the page: shown
    await page.mouse.wheel(0, 400);
    await expect(page.locator('.pillnav.away')).toHaveCount(1); // going down: away
    await toEnd(page);
    await page.waitForTimeout(400);
    await expect(page.locator('.pillnav.away')).toHaveCount(1); // the end of the page no longer brings it back over content
    await page.mouse.wheel(0, -200);
    await expect(page.locator('.pillnav.away')).toHaveCount(0); // going up: back
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('.pillnav.away')).toHaveCount(0);
  });

/** Every button in the title band can still be tapped where it is: nothing invisible sits in front of it. */
const bandReachable = (page: Page) =>
  page.evaluate(() => {
    const blocked: string[] = [];
    for (const b of document.querySelectorAll('.titlewrap button, .bmbtn')) {
      const r = b.getBoundingClientRect();
      if (r.width < 4 || r.top < 0 || r.bottom > innerHeight) continue;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || (!b.contains(hit) && !hit.contains(b))) blocked.push(`${(b.textContent ?? '').trim().slice(0, 14)} ← ${hit ? `${hit.tagName.toLowerCase()}.${String((hit as HTMLElement).className).split(' ')[0]}` : 'nothing'}`);
    }
    return blocked;
  });

test('Island docked top: at the end of Collection it is not sitting on + DECK or IMPORT', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'phones dock at the bottom by default; the top dock on phones is covered by the test above');
  await open(page, 'top', 'collection');
  await page.waitForSelector('.timg');
  await settled(page); // measure the island, not a page still laying out
  // A log of every scroll and every time the island comes or goes, shown if the check fails: it has failed now and
  // then on CI only, and the log says which move brought the island back.
  await page.evaluate(() => {
    const t0 = performance.now();
    const log: string[] = ((window as unknown as { islandLog: string[] }).islandLog = []);
    const at = () => `${Math.round(performance.now() - t0)}ms y=${Math.round(scrollY * 10) / 10} h=${document.documentElement.scrollHeight}`;
    addEventListener('scroll', () => log.push(`scroll ${at()}`), { passive: true });
    new MutationObserver(() => log.push(`${document.querySelector('.pillnav.away') ? 'away' : 'shown'} ${at()} focus=${document.activeElement?.className ?? ''}`)).observe(document.querySelector('.pillnav')!, { attributes: true, attributeFilter: ['class'] });
  });
  await toEnd(page);
  if (!(await page.evaluate(() => scrollY >= 80))) return; // the page does not scroll past the island's rest zone
  const log = () => page.evaluate(() => (window as unknown as { islandLog: string[] }).islandLog.join('\n'));
  // Judge the island only once the browser has told the page about the scroll. On a busy CI machine the scroll event
  // can arrive well after the view moved: the failures seen there (Nov 22) had an EMPTY log, so the island was
  // measured before the app had even heard of the scroll. A scroll that never arrives still fails, here.
  await expect.poll(async () => (await log()).includes('scroll'), { message: 'the page never received the scroll', timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(500);
  // Either the island has gone away (it slides off its edge and stops taking taps), or it is showing with nothing
  // tappable under it. Both ways the band's buttons answer to a tap where they are.
  if (!(await page.locator('.pillnav.away').count())) expect(await covered(page), `island log:\n${await log()}`).toEqual([]);
  expect(await bandReachable(page)).toEqual([]);
});

test('Island docked top: the page getting shorter at its end does not bring it back over the content', async ({ page }) => {
  // A late picture, font or list change can shorten the page while you are at its end; the browser then pulls the view
  // up, which used to read as you scrolling up (seen on slow CI machines, covering + DECK and IMPORT).
  await open(page, 'top', 'collection');
  await page.waitForSelector('.timg');
  await settled(page);
  await page.evaluate(() => void ((document.querySelector('.stage') as HTMLElement).style.minHeight = `${innerHeight * 2}px`));
  await toEnd(page);
  await expect(page.locator('.pillnav.away')).toHaveCount(1);
  await page.evaluate(() => void ((document.querySelector('.stage') as HTMLElement).style.minHeight = `${innerHeight * 2 - 150}px`));
  await page.waitForTimeout(400);
  await expect(page.locator('.pillnav.away')).toHaveCount(1);
  await page.mouse.wheel(0, -200); // a real move up still brings it back
  await expect(page.locator('.pillnav.away')).toHaveCount(0);
});

test('Island docked bottom: shows at the top and the end of a page, away while going down, and the end has room for it', async ({ page }) => {
  await open(page, 'bottom', 'collection');
  await page.waitForSelector('.timg');
  await stretch(page);
  await expect(page.locator('.pillnav.dock-bottom')).toBeVisible();
  await expect(page.locator('.pillnav.away')).toHaveCount(0); // a freshly opened page shows its nav
  await page.mouse.wheel(0, 300);
  await expect(page.locator('.pillnav.away')).toHaveCount(1);
  await toEnd(page);
  await expect(page.locator('.pillnav.away')).toHaveCount(0); // the end of the page: back, on the room the page leaves
  await page.waitForTimeout(500);
  expect(await covered(page)).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.pillnav.away')).toHaveCount(0);
});
