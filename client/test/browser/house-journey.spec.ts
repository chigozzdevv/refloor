import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { parseBuilding } from '@refloor/scene';
import { exportHouse, runHouseJourney, startHouse, undoRedo } from '@browser-test/journeys';
import { journeyTab } from '@browser-test/playwright-tab';

test('the first prompt does not start the 3D renderer', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  await expect(page.locator('.prompt-poster')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(requests.filter((url) => /\/assets\/(world-|physics-world-|rapier_)/.test(url))).toEqual(
    [],
  );
});

for (const fixture of ['generated-l-shaped', 'generated-open-plan', 'generated-two-storey']) {
  test(`${fixture}: rooms, stairs, chat, undo and recovery`, async ({
    page,
    hasTouch,
  }, testInfo) => {
    const path = fileURLToPath(new URL(`./fixtures/${fixture}.json`, import.meta.url)),
      house = parseBuilding(JSON.parse(await readFile(path, 'utf8'))),
      tab = journeyTab(page, hasTouch),
      errors: string[] = [],
      steps: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const refrigerator = house.objects.find((object) => object.label === 'Stainless refrigerator');
    expect(
      refrigerator,
      'Every fixture needs a real refrigerator for the editing journey',
    ).toBeDefined();
    const readOpen = async () => {
      const exported = JSON.parse(await readFile(await exportHouse(tab), 'utf8'));
      expect(exported).toMatchObject({ format: 'refloor-project', version: 1 });
      const saved = parseBuilding(exported.building),
        object = saved.objects.find((object) => object.id === refrigerator!.id),
        behaviour = object?.behaviours.find((behaviour) => behaviour.kind === 'openable');
      expect(behaviour, 'The same refrigerator must survive export and reload').toBeDefined();
      return behaviour!.state.open;
    };
    await page.goto('/');
    await startHouse(tab);
    await runHouseJourney(
      tab,
      path,
      house,
      (step) => steps.push(step),
      async () => {
        expect(await readOpen()).toBe(false);
        await undoRedo(tab, 'Undo');
        expect(await readOpen()).toBe(true);
        await undoRedo(tab, 'Redo');
        expect(await readOpen()).toBe(false);
        await page.reload();
        await expect(page.getByRole('navigation', { name: 'Room navigation' })).toBeVisible();
        expect(await readOpen()).toBe(false);
        steps.push('Verified exported device state after undo, redo and reload');
      },
    );
    await page.screenshot({ path: testInfo.outputPath('returned-outside.png') });
    await testInfo.attach('journey', { body: steps.join('\n'), contentType: 'text/plain' });
    expect(errors).toEqual([]);
  });
}
