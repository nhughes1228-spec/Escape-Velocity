import { expect, test } from '@playwright/test';

test('loads the production build from the GitHub Pages repository subpath', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  const failedResponses: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });

  const response = await page.goto('./');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Escape Velocity' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Launch', exact: true })).toBeEnabled();
  const assetUrls = await page.locator('script[src], link[href]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('src') ?? element.getAttribute('href')).filter(Boolean),
  );
  expect(assetUrls.every((url) => url!.startsWith('/Escape-Velocity/'))).toBe(true);
  expect(failedResponses).toEqual([]);
  expect(errors).toEqual([]);
});

test('shows a recovery screen when the application bundle cannot load', async ({ page }) => {
  await page.route('**/Escape-Velocity/assets/*', (route) => route.abort());
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'The flight lab could not start.' })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('button', { name: 'Refresh page' })).toBeVisible();
});
