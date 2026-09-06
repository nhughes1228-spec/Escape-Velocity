import { expect, test } from '@playwright/test';

test('launches, awards Credits, buys a physical upgrade, reloads, and replays without reward', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New game', exact: true })).toBeVisible();
  await expect(page.getByText('No flights logged yet.')).toBeVisible();

  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await expect(page.locator('.status-chip').getByText('Ignition sequence', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ignition underway' })).toBeVisible();
  const ignitionProgress = page.getByRole('progressbar', { name: 'Ignition progress' });
  await expect(ignitionProgress).toBeVisible();
  await expect(ignitionProgress).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('button', { name: 'Ignition sequence', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'output/playwright/phase-1-ignition.png', fullPage: true });
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
    window.__EV_TEST_CLOCK__!.nowMs += 4000;
    window.dispatchEvent(new Event('escape-velocity:test-tick'));
  });
  await expect(page.locator('.status-chip').getByText('Flight complete', { exact: true })).toBeVisible();
  const firstAltitude = await page.locator('.flight-readout > div').nth(0).locator('strong').textContent();
  expect(firstAltitude).toMatch(/^(157|158|159|160|161|162|163) m$/);
  await expect(page.locator('.result-primary').locator('strong')).toHaveText(firstAltitude!);
  await expect(page.getByLabel('19 Credits')).toBeVisible();
  await expect(page.getByText('+19 Credits', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Launch again' })).toBeEnabled();

  const airframe = page.locator('.upgrade-card').filter({ hasText: 'Airframe' });
  await expect(airframe.getByRole('button', { name: /Buy Airframe for 12 Credits/ })).toBeEnabled();
  const completedFlightBeforePurchase = await page.locator('canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
  await airframe.getByRole('button', { name: /Buy Airframe for 12 Credits/ }).click();
  await expect(page.getByLabel('7 Credits')).toBeVisible();
  await expect(airframe).toContainText('Lv. 1/8');
  await expect(airframe).toContainText('The new configuration flies on your next launch.');
  const completedFlightAfterPurchase = await page.locator('canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
  expect(completedFlightAfterPurchase).toBe(completedFlightBeforePurchase);

  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Start a new game?' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Credits, upgrades, personal best and flight log');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('7 Credits')).toBeVisible();

  await page.getByRole('button', { name: 'Launch again' }).click();
  await expect(page.locator('.status-chip').getByText('Ignition sequence', { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('escape-velocity:test-tick')));
  await page.evaluate(() => {
    window.__EV_TEST_CLOCK__!.nowMs += 12000;
    window.dispatchEvent(new Event('escape-velocity:test-tick'));
  });
  await expect(page.locator('.status-chip').getByText('Flight complete', { exact: true })).toBeVisible();
  const secondAltitude = await page.locator('.flight-readout > div').nth(0).locator('strong').textContent();
  expect(Number.parseInt(secondAltitude!, 10)).toBeGreaterThan(180);
  await expect(page.locator('.result-primary').locator('strong')).toHaveText(secondAltitude!);
  await expect(page.getByText('No flights logged yet.')).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel('7 Credits')).toBeVisible();
  await expect(page.locator('.upgrade-card').filter({ hasText: 'Airframe' })).toContainText('Lv. 1/8');
  await page.getByRole('button', { name: 'Replay last flight — no reward' }).click();
  await expect(page.locator('.status-chip').getByText('Replay · no reward', { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('escape-velocity:test-tick')));
  await page.evaluate(() => {
    window.__EV_TEST_CLOCK__!.nowMs += 12000;
    window.dispatchEvent(new Event('escape-velocity:test-tick'));
  });
  await expect(page.getByText('Replay complete · no reward. Your saved result and progression are unchanged.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('7 Credits')).toBeVisible();
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
  await tick(4000);
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

test('confirms a visible new-game reset before clearing progress', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__EV_TEST_CLOCK__', { configurable: false, value: { nowMs: 0 } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('escape-velocity:test-tick')));
  await page.evaluate(() => {
    window.__EV_TEST_CLOCK__!.nowMs += 12000;
    window.dispatchEvent(new Event('escape-velocity:test-tick'));
  });
  await expect(page.locator('.status-message')).toContainText('Apogee reached');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Start a new game?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Reset progress', exact: true }).click();
  await expect(page.getByLabel('0 Credits')).toBeVisible();
  await expect(page.getByText('No flights logged yet.')).toBeVisible();
});

test('reloads an interrupted launch without a reward and exposes recovery settings', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__EV_TEST_CLOCK__', { configurable: false, value: { nowMs: 0 } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Launch', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Ignition progress' })).toBeVisible();
  await page.reload();

  await expect(page.getByRole('button', { name: 'Launch', exact: true })).toBeEnabled();
  await expect(page.getByLabel('0 Credits')).toBeVisible();
  await expect(page.getByText('No flights logged yet.')).toBeVisible();

  await page.getByRole('button', { name: /Saved locally/ }).click();
  await expect(page.getByRole('button', { name: 'Export save' })).toBeVisible();
  await expect(page.getByLabel('Import save')).toBeVisible();
  await page.getByRole('combobox', { name: 'Motion' }).selectOption('reduced');
  await expect(page.getByRole('combobox', { name: 'Motion' })).toHaveValue('reduced');
});
