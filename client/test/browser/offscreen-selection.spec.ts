import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { parseBuilding } from '@refloor/scene';
import { importHouse, openTools, startHouse, visitRoom } from '@browser-test/journeys';
import { journeyTab } from '@browser-test/playwright-tab';

test('an item selected behind the camera keeps its editor and close control visible', async ({
  page,
  hasTouch,
}, testInfo) => {
  const path = fileURLToPath(new URL('../fixtures/generated-open-plan.json', import.meta.url)),
    house = parseBuilding(JSON.parse(await readFile(path, 'utf8'))),
    floor = house.floors[0]!,
    kitchen = floor.rooms.find((room) => room.uses?.includes('kitchen'))!,
    tab = journeyTab(page, hasTouch);
  await page.goto('/');
  await startHouse(tab);
  await importHouse(tab, path);
  await visitRoom(tab, floor.name, kitchen.name);
  await openTools(tab);
  await tab.playwright.getByRole('button', { name: 'Furniture', exact: true }).click();
  await tab.playwright
    .getByRole('combobox', { name: 'Choose room', exact: true })
    .selectOption(kitchen.id);
  await tab.playwright.getByRole('button', { name: /^Stainless refrigerator/ }).click();
  const input = page.getByRole('textbox', { name: 'Message Stainless refrigerator', exact: true });
  await expect(page.locator('.selection-chat-wrap')).toHaveAttribute('data-offscreen', '');
  await expect(input).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('offscreen-selection.png') });
  await tab.playwright.getByRole('button', { name: 'Close chat', exact: true }).click();
  await expect(input).toBeHidden();
  await expect(page.getByRole('button', { name: 'Walk forward', exact: true })).toBeVisible();
});
