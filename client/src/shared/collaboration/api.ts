import { z } from 'zod';
import { projectListSchema } from '@refloor/scene/contracts';
import {
  sharedStateSchema,
  sharedReceiptSchema,
  invitationSchema,
  sharedActivityPageSchema,
} from '@refloor/scene/collaboration';
import type { SharedEdit } from '@refloor/scene/collaboration';
import { authenticated, request } from '@/shared/refloor/client';
const base = (id: string) => `/collaboration/projects/${id}`;
export const collaborationApi = {
  list: () => authenticated(() => request('/collaboration/projects', projectListSchema)),
  state: (id: string) => authenticated(() => request(base(id), sharedStateSchema)),
  enable: (id: string, name: string, expectedVersion: number) =>
    authenticated(() =>
      request(`${base(id)}/enable`, sharedStateSchema, 'POST', { name, expectedVersion }),
    ),
  invites: (id: string) =>
    authenticated(() =>
      request(
        `${base(id)}/invites`,
        z.object({ items: z.array(invitationSchema.omit({ token: true })) }),
      ),
    ),
  invite: (id: string, role: 'editor' | 'viewer') =>
    authenticated(() => request(`${base(id)}/invites`, invitationSchema, 'POST', { role })),
  revoke: (id: string, inviteId: string) =>
    authenticated(() =>
      request(
        `${base(id)}/invites/${inviteId}/revoke`,
        z.object({ ready: z.literal(true) }),
        'POST',
        {},
      ),
    ),
  join: (token: string, name: string) =>
    authenticated(() => request('/collaboration/join', sharedStateSchema, 'POST', { token, name })),
  edit: (id: string, input: SharedEdit) =>
    authenticated(() => request(`${base(id)}/edits`, sharedReceiptSchema, 'POST', input)),
  rollback: (id: string, eventId: string, requestId: string, restore: boolean) =>
    authenticated(() =>
      request(`${base(id)}/activity/${eventId}`, sharedReceiptSchema, 'POST', {
        id: requestId,
        at: new Date().toISOString(),
        restore,
      }),
    ),
  manage: (id: string, memberId: string, role: 'editor' | 'viewer' | 'removed') =>
    authenticated(() =>
      request(`${base(id)}/members`, sharedStateSchema, 'POST', { memberId, role }),
    ),
  history: (id: string, before: number) =>
    authenticated(() => request(`${base(id)}/activity?before=${before}`, sharedActivityPageSchema)),
};
