import { z } from 'zod';
import { authenticated, replaceSession, request } from '@/shared/refloor/client';

const recoveryKeySchema = z.strictObject({ key: z.string().regex(/^rf_[a-f0-9]{64}$/) });
const readySchema = z.strictObject({ ready: z.literal(true) });

export const sessionApi = {
  createRecoveryKey: () =>
    authenticated(() => request('/sessions/recovery', recoveryKeySchema, 'POST')),
  recover: (key: string) =>
    replaceSession(() => request('/sessions/recover', readySchema, 'POST', { key })),
};
