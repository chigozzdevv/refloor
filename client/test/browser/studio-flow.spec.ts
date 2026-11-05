import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { parseBuilding } from '@refloor/scene';
import {
  exportHouse,
  importHouse,
  openHouse,
  startHouse,
  undoRedo,
  visitRoom,
} from '@browser-test/journeys';
import { journeyTab } from '@browser-test/playwright-tab';

test('house chat keeps unfinished text through outside dismissal and the Homes panel', async ({
  page,
  hasTouch,
}, testInfo) => {
  const tab = journeyTab(page, hasTouch);
  await page.goto('/');
  await startHouse(tab);
  await openHouse(tab);
  await page.screenshot({ path: testInfo.outputPath('house-menu.png') });
  const input = page.getByRole('textbox', { name: 'Message House', exact: true });
  await input.fill('Make the lounge feel warmer');
  await page.locator('canvas').click({ position: { x: 8, y: 100 } });
  await expect(input).toBeHidden();
  await openHouse(tab);
  await expect(input).toHaveValue('Make the lounge feel warmer');
  await page.getByRole('button', { name: 'Homes', exact: true }).click();
  await expect(page.getByLabel('Saved houses', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New house', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export house', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Back to house chat', exact: true }).click();
  await expect(input).toHaveValue('Make the lounge feel warmer');
  await expect(page.getByRole('tab', { name: 'Tools', exact: true })).toHaveCount(0);
});

test('room Add targets the current room and a catalogue addition can be undone', async ({
  page,
  hasTouch,
}, testInfo) => {
  const path = fileURLToPath(new URL('./fixtures/generated-open-plan.json', import.meta.url));
  const house = parseBuilding(JSON.parse(await readFile(path, 'utf8')));
  const floor = house.floors[0]!;
  const kitchen = floor.rooms.find((room) => room.uses?.includes('kitchen'))!;
  const tab = journeyTab(page, hasTouch);
  await page.goto('/');
  await startHouse(tab);
  await importHouse(tab, path);
  await visitRoom(tab, floor.name, kitchen.name);
  const before = parseBuilding(JSON.parse(await readFile(await exportHouse(tab), 'utf8')).building);
  await page.getByRole('button', { name: `Add furniture to ${kitchen.name}`, exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Choose room', exact: true })).toHaveValue(
    kitchen.id,
  );
  await expect(
    page.getByRole('button', { name: 'Drag to move in any direction', exact: true }),
  ).toBeHidden();
  await expect(page.getByText('+ Add to room', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Variegated houseplant', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /^Message Variegated houseplant/ })).toBeVisible();
  await page.getByRole('button', { name: 'Close chat', exact: true }).click();
  const after = parseBuilding(JSON.parse(await readFile(await exportHouse(tab), 'utf8')).building);
  const previousIds = new Set(before.objects.map((object) => object.id));
  const added = after.objects.filter((object) => !previousIds.has(object.id));
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({ roomId: kitchen.id, assetId: 'catalogue/plant' });
  await undoRedo(tab, 'Undo');
  const undone = parseBuilding(JSON.parse(await readFile(await exportHouse(tab), 'utf8')).building);
  expect(undone.objects.some((object) => object.id === added[0]!.id)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('walking-controls.png') });
});

test('view switching is direct and overview exposes the selected floor', async ({
  page,
  hasTouch,
}) => {
  const path = fileURLToPath(new URL('./fixtures/generated-two-storey.json', import.meta.url));
  const house = parseBuilding(JSON.parse(await readFile(path, 'utf8')));
  const tab = journeyTab(page, hasTouch);
  await page.goto('/');
  await startHouse(tab);
  await importHouse(tab, path);
  await openHouse(tab);
  await expect(page.getByRole('button', { name: 'Walk', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'House overview', exact: true }).click();
  await page.getByRole('button', { name: 'Show interior', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Overview floor', exact: true })
    .selectOption(house.floors[1]!.id);
  await expect(
    page.getByRole('img', { name: `${house.floors[1]!.name} plan`, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show exterior', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Overview floor', exact: true })).toBeHidden();
  await openHouse(tab);
  await page.getByRole('button', { name: 'Walk', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Drag to move in any direction', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: /^(Walk forward|Walk left|Walk right|Walk backward|Turn left|Turn right)$/,
    }),
  ).toHaveCount(0);
});

test('map keeps keyboard focus inside and restores it on close', async ({ page }) => {
  const tab = journeyTab(page);
  await page.goto('/');
  await startHouse(tab);
  await openHouse(tab);
  await page.getByRole('button', { name: 'House overview', exact: true }).click();
  const expand = page.getByRole('button', { name: 'Expand house map', exact: true });
  await expand.click();
  const dialog = page.getByRole('dialog', { name: 'House map', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('tab').first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect
    .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
    .toBe(true);
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('tab').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(expand).toBeFocused();
});

test('storage failures expose recovery and keep the current house reachable', async ({
  page,
  hasTouch,
}) => {
  await page.addInitScript(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'refloor.browser-draft.v1')
        throw new DOMException('Storage full', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  });
  const tab = journeyTab(page, hasTouch);
  await page.goto('/');
  await startHouse(tab);
  const recovery = page.getByRole('button', { name: 'Open save recovery', exact: true });
  await expect(recovery).toBeVisible();
  await recovery.click();
  await expect(page.getByLabel('Homes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to house chat', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message House', exact: true })).toBeVisible();
  await recovery.click();
  await expect(page.getByLabel('Homes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New house', exact: true }).click();
  await page.getByRole('button', { name: 'Back to your house', exact: true }).click();
  await expect(recovery).toBeVisible();
});
