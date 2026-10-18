import type { Building } from '@refloor/scene';
import type { EditMemory } from '@refloor/scene/edit-memory';

export type HouseRecord = {
  _id: string;
  ownerId: string;
  creationId: string;
  creationFingerprint: string;
  building: Building;
  memory?: EditMemory;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  past: string[];
  future: string[];
};
