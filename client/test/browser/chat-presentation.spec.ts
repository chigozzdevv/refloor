import { expect, test } from '@playwright/test';
import { openHouse, startHouse } from '@browser-test/journeys';
import { journeyTab } from '@browser-test/playwright-tab';

test('completed replies fade and remain available in conversation history', async ({
  page,
  hasTouch,
}) => {
  const tab = journeyTab(page, hasTouch);
  await page.goto('/');
  await startHouse(tab);
  await openHouse(tab);
  await page.getByRole('button', { name: 'Walk', exact: true }).click();
  await openHouse(tab);
  await page.getByRole('button', { name: 'Furniture', exact: true }).click();
  await page.getByRole('button', { name: /^Opal pendant/ }).click();
  const chat = page.getByRole('region', { name: 'Opal pendant chat', exact: true });
  await chat.getByRole('textbox').fill('Turn off');
  await chat.getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(chat.locator('[data-status="applied"]')).toBeVisible();
  await page.mouse.move(4, 100);
  await expect(chat.locator('.chat-conversation')).toHaveAttribute('data-faded', 'true', {
    timeout: 12_000,
  });
  if (!hasTouch) {
    const movement = await page.locator('.selection-chat-wrap').evaluate(
      (card) =>
        new Promise<number>((resolve) => {
          const bottoms: number[] = [],
            start = performance.now();
          const sample = () => {
            bottoms.push(card.getBoundingClientRect().bottom);
            if (performance.now() - start < 700) requestAnimationFrame(sample);
            else resolve(Math.max(...bottoms) - Math.min(...bottoms));
          };
          sample();
        }),
    );
    expect(movement).toBeLessThan(2);
  }
  await chat.getByRole('button', { name: 'Recent conversation', exact: true }).click();
  await expect(chat.getByRole('log')).toHaveAttribute('data-faded', 'false');
  await expect(chat.getByText('Turn off', { exact: true })).toBeVisible();
  await expect(chat.locator('[data-status="applied"]')).toBeVisible();
});

test('idle rendering wakes for walking and touch does not gain a decorative hand', async ({
  page,
  hasTouch,
}) => {
  const tab = journeyTab(page, hasTouch);
  await page.goto('/');
  await startHouse(tab);
  await openHouse(tab);
  await page.getByRole('button', { name: 'Walk', exact: true }).click();
  const metrics = () =>
    page
      .locator('canvas')
      .getAttribute('data-render-metrics')
      .then((value) => JSON.parse(value ?? '{}'));
  await expect.poll(async () => (await metrics()).idle).toBe(true);
  if (hasTouch) {
    await expect(page.locator('.interaction-hand')).toBeHidden();
    expect(
      await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .some((entry) => entry.name.endsWith('/hand-right.glb')),
      ),
    ).toBe(false);
  } else {
    await expect(page.locator('.interaction-hand')).toBeVisible();
    await page.mouse.move(150, 200);
    const before = await page.locator('.interaction-hand').boundingBox();
    await page.mouse.move(1000, 250);
    await expect
      .poll(async () => (await page.locator('.interaction-hand').boundingBox())!.x)
      .toBeGreaterThan(before!.x + 20);
    await page.mouse.down();
    await expect(page.locator('.interaction-hand')).toHaveAttribute('data-pressed', 'true');
    await page.mouse.up();
    await expect(page.locator('.interaction-hand')).not.toHaveAttribute('data-pressed', 'true');
    await page.keyboard.down('w');
    await expect.poll(async () => (await metrics()).idle).toBe(false);
    await page.keyboard.up('w');
    await expect.poll(async () => (await metrics()).idle).toBe(true);
  }
});

test('the house remains usable if the optional hand model cannot load', async ({
  page,
  hasTouch,
}) => {
  await page.route('**/models/interaction/hand-right.glb', (route) => route.abort());
  await page.goto('/');
  await startHouse(journeyTab(page, hasTouch));
  await expect(page.getByRole('button', { name: 'House controls', exact: true })).toBeVisible();
  await openHouse(journeyTab(page, hasTouch));
  await expect(page.getByRole('textbox', { name: 'Message House', exact: true })).toBeVisible();
});
