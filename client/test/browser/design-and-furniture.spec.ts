import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { parseBuilding } from '@refloor/scene';
import { exportHouse, importHouse, openHouse, startHouse } from '@browser-test/journeys';
import { journeyTab } from '@browser-test/playwright-tab';

test('furniture previews load and the room chooser can place upstairs without reopening the library', async ({
  page,
  hasTouch,
}, testInfo) => {
  const fixture = fileURLToPath(new URL('./fixtures/generated-two-storey.json', import.meta.url));
  const house = parseBuilding(JSON.parse(await readFile(fixture, 'utf8')));
  const upstairs = house.floors[1]!;
  const room = upstairs.rooms.find((value) => value.kind === 'bedroom') ?? upstairs.rooms[0]!;
  const tab = journeyTab(page, hasTouch);
  await page.goto('/');
  await startHouse(tab);
  await importHouse(tab, fixture);
  await openHouse(tab);
  await page.getByRole('button', { name: 'Furniture', exact: true }).click();
  await page.getByRole('combobox', { name: 'Choose room', exact: true }).selectOption(room.id);
  await page.getByRole('button', { name: 'Add furniture', exact: true }).click();
  const addPlant = page.getByRole('button', { name: 'Add Variegated houseplant', exact: true });
  await addPlant.scrollIntoViewIfNeeded();
  await expect(addPlant.locator('img')).toHaveJSProperty('naturalWidth', 640);
  await expect(
    page.getByRole('button', { name: 'Close furniture library', exact: true }),
  ).toBeInViewport();
  await expect(page.getByRole('combobox', { name: 'Choose room', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('furniture-previews.png') });
  await addPlant.click();
  await expect(page.getByRole('textbox', { name: /^Message Variegated houseplant/ })).toBeVisible();
  await page.getByRole('button', { name: 'Close chat', exact: true }).click();
  const result = JSON.parse(await readFile(await exportHouse(tab), 'utf8'));
  const before = new Set(house.objects.map((object) => object.id));
  const added = parseBuilding(result.building).objects.filter((object) => !before.has(object.id));
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({
    floorId: upstairs.id,
    roomId: room.id,
    assetId: 'catalogue/plant',
  });
});

test('a full edited design preview keeps its return visible and can exit without deleting a saved version', async ({
  page,
  hasTouch,
}) => {
  const tab = journeyTab(page, hasTouch);
  await page.goto('/');
  await startHouse(tab);
  await openHouse(tab);
  await page.getByRole('button', { name: 'Edit history', exact: true }).click();
  for (let index = 0; index < 6; index++) {
    await page.getByRole('textbox', { name: 'Design name', exact: true }).fill(`Version ${index}`);
    await page.getByRole('button', { name: 'Save current design', exact: true }).click();
  }
  await page.getByRole('button', { name: 'View Version 0', exact: true }).click();
  await page.getByRole('button', { name: 'Close history', exact: true }).click();
  await expect(page.getByLabel('Viewing design Version 0', { exact: true })).toBeVisible();
  await openHouse(tab);
  await page.getByRole('button', { name: 'Furniture', exact: true }).click();
  await page.getByRole('button', { name: 'Add furniture', exact: true }).click();
  await page.getByRole('button', { name: 'Add Variegated houseplant', exact: true }).click();
  await page.getByRole('button', { name: 'Close chat', exact: true }).click();
  await page.getByRole('button', { name: 'Return', exact: true }).click();
  await expect(
    page.getByRole('group', { name: 'Discard preview changes', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.getByLabel('Viewing design Version 0', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Return', exact: true }).click();
  await page.getByRole('button', { name: 'Discard & continue', exact: true }).click();
  await expect(page.getByLabel('Viewing design Version 0', { exact: true })).toBeHidden();
  const result = JSON.parse(await readFile(await exportHouse(tab), 'utf8'));
  expect(result.memory.designs.items).toHaveLength(6);
  expect(result.memory.designs.comparison).toBeUndefined();
});
