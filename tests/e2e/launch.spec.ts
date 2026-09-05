import { expect, test } from '@playwright/test';

test('launches, shows burnout/coast, settles a record, and replays', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, '__EV_TEST_CLOCK__', {
      configurable: false,
      value: { nowMs: 0 },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Escape Velocity' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Launch', exact: true })).toBeEnabled();
  await expect(page.getByText('No flights logged yet.')).toBeVisible();

  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await expect(page.locator('.status-chip').getByText('Ignition sequence', { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('escape-velocity:test-tick')));
  await page.evaluate(() => {
    window.__EV_TEST_CLOCK__!.nowMs += 1500;
    window.dispatchEvent(new Event('escape-velocity:test-tick'));
  });
  await expect(page.locator('.status-chip').getByText('Powered ascent', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.__EV_TEST_CLOCK__!.nowMs += 5000;
    window.dispatchEvent(new Event('escape-velocity:test-tick'));
  });
  await expect(page.locator('.status-chip').getByText('Coasting', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.__EV_TEST_CLOCK__!.nowMs += 3742;
    window.dispatchEvent(new Event('escape-velocity:test-tick'));
  });
  await expect(page.locator('.status-chip').getByText('Flight complete', { exact: true })).toBeVisible();
  await expect(page.locator('.flight-readout > div').nth(0).getByText('160 m', { exact: true })).toBeVisible();
  await expect(page.locator('.result-primary').getByText('160 m', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Launch again' })).toBeEnabled();

  await page.getByRole('button', { name: 'Launch again' }).click();
  await expect(page.locator('.status-chip').getByText('Ignition sequence', { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('escape-velocity:test-tick')));
  await page.evaluate(() => {
    window.__EV_TEST_CLOCK__!.nowMs += 10242;
    window.dispatchEvent(new Event('escape-velocity:test-tick'));
  });
  await expect(page.locator('.status-chip').getByText('Flight complete', { exact: true })).toBeVisible();
  await expect(page.locator('.flight-readout > div').nth(0).getByText('160 m', { exact: true })).toBeVisible();
  await expect(page.locator('.result-primary').getByText('160 m', { exact: true })).toBeVisible();
  await expect(page.getByText('No flights logged yet.')).toHaveCount(0);
  await page.screenshot({ path: 'output/playwright/phase-1-result.png', fullPage: true });
  expect(consoleErrors).toEqual([]);
});

test('pauses presentation time while hidden and resumes without a catch-up jump', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__EV_TEST_CLOCK__', { configurable: false, value: { nowMs: 0 } });
    Object.defineProperty(window, '__EV_TEST_VISIBILITY__', { configurable: true, writable: true, value: 'visible' });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (window as Window & { __EV_TEST_VISIBILITY__?: string }).__EV_TEST_VISIBILITY__ ?? 'visible',
    });
  });
  await page.goto('/');
  const tick = async (milliseconds: number) => page.evaluate((advanceBy) => {
    window.__EV_TEST_CLOCK__!.nowMs += advanceBy;
    window.dispatchEvent(new Event('escape-velocity:test-tick'));
  }, milliseconds);
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('escape-velocity:test-tick')));
  await tick(1500);
  await expect(page.locator('.status-chip').getByText('Powered ascent', { exact: true })).toBeVisible();

  await page.evaluate(() => {
    (window as Window & { __EV_TEST_VISIBILITY__?: string }).__EV_TEST_VISIBILITY__ = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await tick(5000);
  await expect(page.locator('.status-chip').getByText('Powered ascent', { exact: true })).toBeVisible();

  await page.evaluate(() => {
    (window as Window & { __EV_TEST_VISIBILITY__?: string }).__EV_TEST_VISIBILITY__ = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await tick(0);
  await tick(5000);
  await expect(page.locator('.status-chip').getByText('Coasting', { exact: true })).toBeVisible();
  await tick(3742);
  await expect(page.locator('.status-chip').getByText('Flight complete', { exact: true })).toBeVisible();
});

test('keeps essential controls usable at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Launch', exact: true });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  expect(await button.boundingBox()).not.toBeNull();
  await expect(page.getByText('Reduce motion')).toBeVisible();
});
