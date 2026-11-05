import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import type { LanguageEditRequest } from '@refloor/scene/chat';
import { openHouse, startHouse } from '@browser-test/journeys';
import { journeyTab } from '@browser-test/playwright-tab';

test('the TV downloads nothing while off and keeps playback working after lazy loading', async ({
  page,
  hasTouch,
}, testInfo) => {
  await page.addInitScript(() => {
    const videos: HTMLVideoElement[] = [],
      create = document.createElement.bind(document);
    document.createElement = ((...args: Parameters<typeof create>) => {
      const node = create(...args);
      if (node instanceof HTMLVideoElement) videos.push(node);
      return node;
    }) as typeof document.createElement;
    Object.assign(window, { refloorTestVideos: videos });
  });
  const requests: string[] = [],
    errors: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/media/tv-demo.mp4')) requests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const videos = () =>
    page.evaluate(() =>
      (window as unknown as { refloorTestVideos: HTMLVideoElement[] }).refloorTestVideos.map(
        (video) => ({
          source: video.getAttribute('src'),
          preload: video.preload,
          paused: video.paused,
          time: video.currentTime,
          muted: video.muted,
        }),
      ),
    );
  const tab = journeyTab(page, hasTouch);
  await page.goto('/');
  await startHouse(tab);
  await openHouse(tab);
  await page.getByRole('button', { name: 'Walk', exact: true }).click();
  await openHouse(tab);
  await page.getByRole('button', { name: 'Furniture', exact: true }).click();
  await page.getByRole('button', { name: /^Frame television/ }).click();
  const chat = page.getByRole('region', { name: 'Frame television chat', exact: true });
  await expect(chat).toBeVisible();
  expect(requests).toHaveLength(0);
  expect(await videos()).toEqual([
    { source: null, preload: 'none', paused: true, time: 0, muted: true },
  ]);
  const send = async (message: string) => {
    await chat.getByRole('textbox').fill(message);
    await chat.getByRole('button', { name: 'Send request', exact: true }).click();
    await expect(chat.getByRole('textbox')).toBeEnabled();
    await expect(chat.locator('[data-status="applied"]').last()).toBeVisible();
  };
  await send('Turn on');
  await expect.poll(async () => (await videos())[0]?.time ?? 0).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('playing-tv.png') });
  expect(requests.length).toBeGreaterThan(0);
  expect(await videos()).toHaveLength(1);
  await send('Turn off');
  await expect.poll(async () => (await videos())[0]?.paused).toBe(true);
  await send('Turn on');
  await expect.poll(async () => (await videos())[0]?.paused).toBe(false);
  await send('Unmute');
  await expect.poll(async () => (await videos())[0]?.muted).toBe(false);
  await send('Mute');
  const source = 'https://video.example.com/refloor-test.mp4';
  await page.route(source, (route) =>
    route.fulfill({
      path: fileURLToPath(new URL('../../public/media/tv-demo.mp4', import.meta.url)),
      contentType: 'video/mp4',
      headers: { 'Access-Control-Allow-Origin': '*' },
    }),
  );
  await page.route('**/api/edits/interpret', async (route) => {
    const input = route.request().postDataJSON() as LanguageEditRequest;
    await route.fulfill({
      json: {
        requestId: input.requestId,
        baseRevision: input.building.revision,
        message: 'Changed the video.',
        commands: [{ type: 'set-television', objectId: input.target.id, state: { source } }],
        usage: {
          model: 'browser-fixture',
          responseId: 'source-switch',
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          durationMs: 0,
        },
      },
    });
  });
  await send('Play another clip');
  await expect.poll(async () => (await videos())[0]?.source).toBe(source);
  await expect.poll(async () => (await videos())[0]?.time ?? 0).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('changed-video.png') });
  expect(await videos()).toHaveLength(1);
  expect(errors).toEqual([]);
});
