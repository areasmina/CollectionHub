import { expect, test } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

/** A search or filter that leaves nothing says so in plain words and offers the way back (never a blank page). */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('Collection: a search with no match shows a note and one button that brings the cards back', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const rows = page.locator('.cgrid2 > li, ul.crows > li');
  await expect(rows.first()).toBeVisible();
  await page.getByLabel('Search cards by name or rules text').fill('zzzz no such card');
  const note = page.locator('.estate');
  await expect(note).toContainText('No cards match');
  await expect(note).toContainText('zzzz no such card');
  await fits(page, ['.estate']);
  await note.getByRole('button', { name: 'CLEAR SEARCH AND FILTERS' }).click();
  await expect(note).toHaveCount(0);
  await expect(rows.first()).toBeVisible();
});

test('Discover: a colour no commander has shows a note and a reset', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'discover'));
  await page.reload();
  await expect(page.locator('.ccard').first()).toBeVisible();
  const bar = page.locator('.dfind .tbar');
  await bar.locator('summary').click();
  await bar.getByRole('button', { name: 'Red' }).click();
  await page.keyboard.press('Escape');
  const note = page.locator('.estate');
  await expect(note).toContainText('No commander matches');
  await fits(page, ['.estate']);
  await note.getByRole('button', { name: 'CLEAR SEARCH AND COLOURS' }).click();
  await expect(note).toHaveCount(0);
  await expect(page.locator('.ccard')).toHaveCount(1);
});

test('Collection: when the set list cannot be loaded, group by set says so and offers TRY AGAIN (never "loading" forever)', async ({ page }) => {
  let down = true;
  await page.route('https://api.scryfall.com/sets', (r) => (down ? r.abort() : r.fallback()));
  await page.evaluate(() => (localStorage.setItem('ch:tab', 'collection'), localStorage.setItem('ch:group', 'on')));
  await page.reload();
  const bar = page.locator('.collbar .tbar');
  await expect(bar).toBeVisible();
  if (!(await page.locator('.setgroups').count())) {
    await bar.locator('summary').click();
    await bar.getByLabel('Group by set').check();
    await page.keyboard.press('Escape');
  }
  const note = page.locator('.setgroups .estate');
  await expect(note).toContainText("Couldn't load the set list");
  await fits(page, ['.setgroups .estate']);
  down = false;
  await note.getByRole('button', { name: 'TRY AGAIN' }).click();
  await expect(note).toHaveCount(0);
  await expect(page.locator('.setgrp').first()).toBeVisible();
});
