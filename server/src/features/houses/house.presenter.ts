import type { SceneRevision } from '@refloor/scene';
import type { Project, ProjectSummary, ProjectWrite } from '@refloor/scene/contracts';
import type { HouseRecord } from '@refloor/server/features/houses/house.model';

export function houseSummary(record: HouseRecord): ProjectSummary {
  return {
    id: record._id,
    name: record.building.name,
    version: record.version,
    revision: record.building.revision,
    storeys: record.building.floors.length,
    objectCount: record.building.objects.length,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    canUndo: record.past.length > 0,
    canRedo: record.future.length > 0,
  };
}

export function houseDocument(record: HouseRecord): Project {
  return { ...houseSummary(record), building: record.building };
}

export function houseReceipt(
  record: HouseRecord,
  acceptedVersion: number,
  replayed: boolean,
  revision: SceneRevision | null,
): ProjectWrite {
  return { project: houseDocument(record), acceptedVersion, replayed, revision };
}
