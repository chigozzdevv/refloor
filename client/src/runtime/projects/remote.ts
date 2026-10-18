import { z } from 'zod';
import { idSchema } from '@refloor/scene/primitives';

const linkKey = 'refloor.saved-project.v1';
export const remoteLinkSchema = z.strictObject({
  id: z.uuid(),
  buildingId: idSchema,
  version: z.number().int().nonnegative(),
  savedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  updatedAt: z.iso.datetime(),
});
export type RemoteLink = z.infer<typeof remoteLinkSchema>;

export function restoreRemoteLink(buildingId: string): RemoteLink | null {
  try {
    const link = remoteLinkSchema.parse(JSON.parse(localStorage.getItem(linkKey) ?? 'null'));
    return link.buildingId === buildingId ? link : null;
  } catch {
    return null;
  }
}

export function persistRemoteLink(link: RemoteLink | null) {
  try {
    if (link) localStorage.setItem(linkKey, JSON.stringify(link));
    else localStorage.removeItem(linkKey);
  } catch {
    /* The current session keeps its link when browser storage is unavailable. */
  }
}
