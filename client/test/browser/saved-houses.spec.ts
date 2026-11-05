import { expect, test } from '@playwright/test';
import { openHouse, startHouse } from '@browser-test/journeys';
import { journeyTab } from '@browser-test/playwright-tab';

test('saved houses can be renamed, deleted, restored and reopened after reload', async ({
  page,
  hasTouch,
}) => {
  const tab = journeyTab(page, hasTouch);
  await page.goto('/');
  await startHouse(tab);
  await openHouse(tab);
  await page.getByRole('button', { name: 'Homes', exact: true }).click();
  await page.getByRole('button', { name: 'Save house', exact: true }).click();
  await expect(page.locator('.saved-space')).toHaveCount(1);
  await expect(page.locator('.saved-house-preview')).toHaveCount(1);
  await page.getByRole('button', { name: 'Options for The Garden House', exact: true }).click();
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByRole('textbox', { name: 'House name', exact: true }).fill('My quiet courtyard');
  await page.getByRole('button', { name: 'Save house name', exact: true }).click();
  await expect(page.locator('.current-home h2')).toHaveText('My quiet courtyard');
  await page.getByRole('button', { name: 'Options for My quiet courtyard', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.saved-space')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.saved-space')).toHaveCount(1);
  await expect(page.locator('.current-home h2')).toHaveText('My quiet courtyard');
  await page.getByRole('button', { name: 'Options for My quiet courtyard', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.saved-space')).toHaveCount(0);
  await page.reload();
  await openHouse(tab);
  await page.getByRole('button', { name: 'Homes', exact: true }).click();
  await expect(page.locator('.saved-space')).toHaveCount(0);
  await page.getByText('Files & recovery', { exact: true }).click();
  await page.getByText('Deleted houses', { exact: true }).click();
  await page.getByRole('button', { name: 'Restore My quiet courtyard', exact: true }).click();
  await expect(page.locator('.saved-space')).toHaveCount(1);
  await expect(page.locator('.saved-space')).toBeDisabled();
  await expect(page.locator('.current-home h2')).toHaveText('My quiet courtyard');
  await page.reload();
  await openHouse(tab);
  await page.getByRole('button', { name: 'Homes', exact: true }).click();
  await expect(page.locator('.current-home h2')).toHaveText('My quiet courtyard');
});
