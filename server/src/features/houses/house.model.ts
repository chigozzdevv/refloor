import type { Building } from '@refloor/scene';

export type HouseRecord = {
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
