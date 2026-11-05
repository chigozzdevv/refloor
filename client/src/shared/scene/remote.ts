import { z } from 'zod';
import { idSchema } from '@refloor/scene/primitives';
import type { ProjectSummary } from '@refloor/scene/contracts';

const linkKey = 'refloor.saved-project.v1';
export const remoteLinkSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().optional(),
  collectionVersion: z.number().int().nonnegative().optional(),
  deleted: z.boolean().optional(),
  shared: z.boolean().optional(),
  buildingId: idSchema,
  version: z.number().int().nonnegative(),
  savedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  savedMemoryFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  updatedAt: z.iso.datetime(),
});
export type RemoteLink = z.infer<typeof remoteLinkSchema>;

type CollectionMetadata = Pick<RemoteLink, 'id' | 'name' | 'collectionVersion' | 'deleted'>;

export function latestCollectionMetadata(
  incoming: Pick<ProjectSummary, 'id' | 'name' | 'collectionVersion' | 'deleted'>,
  ...known: (CollectionMetadata | null | undefined)[]
) {
  let latest: CollectionMetadata = incoming;
  for (const candidate of known)
    if (
      candidate?.id === incoming.id &&
      (candidate.collectionVersion ?? 0) > (latest.collectionVersion ?? 0)
    )
      latest = candidate;
  return {
    name: latest.name ?? incoming.name,
    collectionVersion: latest.collectionVersion ?? 0,
    deleted: latest.deleted,
  };
}

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
