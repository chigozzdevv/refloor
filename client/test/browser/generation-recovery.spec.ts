import { expect, test } from '@playwright/test';

const prompt = 'A two-bedroom bungalow with a bright living room and oak floors.';

test('starts with an editable description that can be generated without typing', async ({
  page,
}) => {
  const submitted = page.waitForRequest(
    (request) => request.url().endsWith('/api/generations') && request.method() === 'POST',
  );
  await page.route('**/api/generations', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'GENERATION_UNAVAILABLE', message: 'Not configured' } },
    }),
  );
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Describe your house' }),
    generate = page.getByRole('button', { name: 'Generate house' });
  await expect(input).toHaveValue(/^Create a modern two-storey home/);
  await expect(input).toBeEditable();
  await expect(generate).toBeEnabled();
  const initial = await input.inputValue();
  expect(initial).toContain('brick exterior walls');
  expect(initial).toContain('open-plan living and dining');
  await generate.click();
  expect((await submitted).postDataJSON().prompt).toBe(initial);
  await expect(page.getByRole('alert')).toContainText('House generation is unavailable.');
  await expect(input).toHaveValue(initial);
});

test('releases an expired generation and retains its description', async ({ page }) => {
  const pending = { requestId: crypto.randomUUID(), jobId: crypto.randomUUID(), prompt };
  await page.addInitScript((value) => {
    localStorage.setItem('refloor.generation.v1', JSON.stringify(value));
  }, pending);
  await page.route('**/api/generations/*', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'GENERATION_NOT_FOUND', message: 'Expired' } }),
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('This generation is no longer available.');
  await expect(page.getByRole('textbox', { name: 'Describe your house' })).toHaveValue(prompt);
  await expect(page.getByRole('textbox', { name: 'Describe your house' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Generate house' })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('refloor.generation.v1'))).toBeNull();
});

test('keeps a pending job when cancelling starters and clears it after choosing one', async ({
  page,
}) => {
  const pending = { requestId: crypto.randomUUID(), jobId: crypto.randomUUID(), prompt };
  await page.addInitScript((value) => {
    localStorage.setItem('refloor.generation.v1', JSON.stringify(value));
  }, pending);
  await page.route('**/api/generations/*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Connection lost' } }),
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Retry connection' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose a starting house' }).click();
  await expect(page.getByRole('dialog', { name: 'Create a new space' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('refloor.generation.v1'))).not.toBeNull();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry connection' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('refloor.generation.v1'))).not.toBeNull();
  await page.getByRole('button', { name: 'Choose a starting house' }).click();
  await page.getByRole('button', { name: /The Garden House/ }).click();
  await expect(page.getByRole('dialog', { name: 'Create a new space' })).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('refloor.generation.v1'))).toBeNull();
});

test('allows another path when generation is not configured', async ({ page }) => {
  const pending = { requestId: crypto.randomUUID(), jobId: null, prompt };
  await page.addInitScript((value) => {
    localStorage.setItem('refloor.generation.v1', JSON.stringify(value));
  }, pending);
  await page.route('**/api/generations', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'GENERATION_UNAVAILABLE', message: 'Add OPENAI_API_KEY on the server.' },
      }),
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('House generation is unavailable.');
  await expect(page.getByRole('alert')).not.toContainText('OPENAI_API_KEY');
  await expect(page.getByRole('textbox', { name: 'Describe your house' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Choose a starting house' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('refloor.generation.v1'))).toBeNull();
});
