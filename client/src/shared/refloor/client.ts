import { apiErrorSchema } from '@refloor/scene/contracts';
import { z } from 'zod';

const sessionReadySchema = z.strictObject({ ready: z.literal(true) });

export class ProjectApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = false,
    public readonly issues: { code: string; message: string; entityId?: string | undefined }[] = [],
  ) {
    super(message);
  }
}

const requestTimeout = () =>
  new ProjectApiError('TIMEOUT', 'The request timed out. Try again.', true);

export async function request<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
  method = 'GET',
  body?: unknown,
  timeout = 20000,
): Promise<T> {
  let response: Response;
  const signal = AbortSignal.timeout(timeout);
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      signal,
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    if (signal.aborted) throw requestTimeout();
    throw new ProjectApiError('UNAVAILABLE', 'Could not connect to Refloor. Try again.', true);
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (signal.aborted) throw requestTimeout();
    throw new ProjectApiError('UNAVAILABLE', 'Refloor is unavailable. Try again.', true);
  }
  if (!response.ok) {
    const result = apiErrorSchema.safeParse(data);
    throw new ProjectApiError(
      result.success ? result.data.error.code : 'REQUEST_FAILED',
      result.success ? result.data.error.message : 'Saved spaces could not complete the request.',
      response.status >= 500 || response.status === 429,
      result.success ? (result.data.error.issues ?? []) : [],
    );
  }
  try {
    return schema.parse(data);
  } catch {
    throw new ProjectApiError(
      'INVALID_RESPONSE',
      'The saved project response could not be read. Your current space has been kept.',
      true,
    );
  }
}

let session: Promise<unknown> | null = null;
let sessionChange: Promise<unknown> | null = null;
let sessionEpoch = 0;
async function ensureSession() {
  session ??= request('/sessions', sessionReadySchema, 'POST').catch((error: unknown) => {
    session = null;
    throw error;
  });
  await session;
}

export async function authenticated<T>(run: () => Promise<T>): Promise<T> {
  while (sessionChange) await sessionChange;
  const epoch = sessionEpoch;
  await ensureSession();
  try {
    return await run();
  } catch (error) {
    if (
      !(error instanceof ProjectApiError) ||
      error.code !== 'SESSION_REQUIRED' ||
      epoch !== sessionEpoch
    )
      throw error;
    session = null;
    await ensureSession();
    return run();
  }
}

export async function replaceSession<T>(run: () => Promise<T>): Promise<T> {
  while (sessionChange) await sessionChange;
  sessionEpoch++;
  const change = (async () => {
    await session?.catch(() => undefined);
    const result = await run();
    session = Promise.resolve();
    return result;
  })();
  sessionChange = change;
  try {
    return await change;
  } finally {
    if (sessionChange === change) sessionChange = null;
  }
}
