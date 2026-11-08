import { test, expect } from '@playwright/test';

test('Dynamic island sync console screenshot with active code', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(500);

  // Set an active sync code in localStorage
  await page.evaluate(() => {
    localStorage.setItem('ch:sync:code', '6fs8-qsx5-94ns-h9jm-b8fq');
  });
  await page.reload();
  await page.waitForTimeout(500);

  // Click on the sync indicator in the island
  const syncBtn = page.locator('.syncpill button');
  await expect(syncBtn).toBeVisible();
  await syncBtn.click();
  await page.waitForTimeout(400);

  const drawer = page.locator('.island-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('.id-sync-head .id-sync-tag')).toHaveText('CLOUD SYNC');

  // Verify no emojis are present in drawer
  const drawerText = await drawer.innerText();
  expect(drawerText).not.toContain('⚡');
  expect(drawerText).not.toContain('🔄');
  expect(drawerText).not.toContain('↶');

  // Verify buttons
  await expect(drawer.locator('.id-code-mono')).toContainText('6fs8');
  await expect(drawer.locator('.id-code-copy-btn')).toHaveText('COPY LINK');
  await expect(drawer.locator('.id-btn-act', { hasText: 'CHANGE CODE' })).toBeVisible();
  await expect(drawer.locator('.id-btn-act.danger', { hasText: 'TURN OFF SYNC ON THIS DEVICE' })).toBeVisible();

  await page.screenshot({ path: 'test-results/island-sync-active.png' });
});
