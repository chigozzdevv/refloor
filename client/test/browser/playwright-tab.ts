import type { Download, FileChooser, Locator, Page } from '@playwright/test';
import type { JourneyTab } from '@browser-test/journeys';

function target(locator: Locator, touch: boolean): ReturnType<JourneyTab['playwright']['locator']> {
  return {
    click: async () => {
      if ((await locator.getAttribute('data-door-handle')) === null)
        return touch ? locator.tap() : locator.click();
      // Projected handles drift by fractions of a pixel while the camera settles.
      await locator.waitFor({ state: 'visible' });
      const bounds = await locator.boundingBox();
      if (!bounds) throw new Error('The visible door handle has no touch target');
      const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      if (touch) await locator.page().touchscreen.tap(point.x, point.y);
      else await locator.page().mouse.click(point.x, point.y);
    },
    fill: (value) => locator.fill(value),
    selectOption: (value) => locator.selectOption(value),
    isVisible: () => locator.isVisible(),
    waitFor: ({ state, timeoutMs }) => locator.waitFor({ state, timeout: timeoutMs ?? 15_000 }),
  };
}

export function journeyTab(page: Page, touch = false): JourneyTab {
  function waitForEvent(event: 'filechooser'): Promise<FileChooser>;
  function waitForEvent(event: 'download'): Promise<Download>;
  function waitForEvent(event: 'filechooser' | 'download') {
    return event === 'filechooser'
      ? page.waitForEvent('filechooser')
      : page.waitForEvent('download');
  }
  return {
    reload: async () => {
      await page.reload();
    },
    playwright: {
      locator: (selector) => target(page.locator(selector), touch),
      getByRole: (role, options) =>
        target(page.getByRole(role as Parameters<Page['getByRole']>[0], options), touch),
      getByText: (text, options) => target(page.getByText(text, options), touch),
      waitForEvent,
      domSnapshot: () => page.locator('body').ariaSnapshot(),
    },
  };
}
