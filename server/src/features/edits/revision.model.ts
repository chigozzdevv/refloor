import type { Building, SceneRevision } from '@refloor/scene';
import type { EditMemory } from '@refloor/scene/edit-memory';

export type RevisionRecord = {
  _id: string;
  projectId: string;
  requestId: string;
  fingerprint: string;
  kind: 'snapshot' | 'edit' | 'undo' | 'redo';
  acceptedVersion: number;
  revision: SceneRevision | null;
  createdAt: Date;
};
export type HouseChange = {
  building: Building;
  memory?: EditMemory;
  revision: SceneRevision | null;
  past: string[];
  future: string[];
};
export type RevisionHistory = { find: (revisionId: string) => Promise<RevisionRecord | null> };
export const revisionKey = (houseId: string, requestId: string) => `${houseId}:${requestId}`;
