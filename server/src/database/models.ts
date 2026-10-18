import type { Building, SceneRevision } from '@refloor/scene';

export type SessionRecord = { _id: string; createdAt: Date; expiresAt: Date };
export type ProjectRecord = {
  _id: string;
  ownerId: string;
  creationId: string;
  creationFingerprint: string;
  building: Building;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  past: string[];
  future: string[];
};
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
