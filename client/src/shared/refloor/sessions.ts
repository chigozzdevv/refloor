import { z } from 'zod';
import {
  authenticated,
  replaceSession,
  request,
  sessionReadySchema,
} from '@/shared/refloor/client';

const recoveryKeySchema = z.strictObject({ key: z.string().regex(/^rf_[a-f0-9]{64}$/) });

export const sessionApi = {
  createRecoveryKey: () =>
    authenticated(() => request('/sessions/recovery', recoveryKeySchema, 'POST')),
  recover: (key: string) =>
    replaceSession(() => request('/sessions/recover', sessionReadySchema, 'POST', { key })),
};
