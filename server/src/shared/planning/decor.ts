import { compileBuilding, validateBuilding } from '@refloor/engine';
import { EngineError } from '@refloor/engine/errors';
import type { Building } from '@refloor/scene';
import { findCataloguePlacement } from '@refloor/catalogue/placement';

export function validateFurnishedHouse(building: Building): Building {
  try {
    return validateBuilding(building).building;
  } catch (error) {
    if (!(error instanceof EngineError)) throw error;
    const plants = building.objects.filter(
      (object) => object.assetId === 'catalogue/plant' && object.id.endsWith('/plant'),
    );
    if (
      !error.issues.every(
        (issue) =>
          issue.code === 'UNREACHABLE_OBJECT' &&
          plants.some((plant) => plant.id === issue.entityId),
      )
    )
      throw error;
    const blocked = plants.filter((plant) =>
      error.issues.some((issue) => issue.entityId === plant.id),
    );
    let current: Building = {
      ...building,
      objects: building.objects.filter((object) => !blocked.includes(object)),
    };
    validateBuilding(current);
    for (const plant of blocked) {
      const floor = current.floors.find((value) => value.id === plant.floorId)!,
        room = floor.rooms.find((value) => value.id === plant.roomId)!,
        fp = room.footprint,
        front = fp.z + 0.55,
        rear = fp.z + fp.depth - 0.55,
        xs =
          plant.position.x < fp.x + fp.width / 2
            ? [fp.x + 1.1, fp.x + 0.55, fp.x + fp.width - 1.1, fp.x + fp.width - 0.55]
            : [fp.x + fp.width - 1.1, fp.x + fp.width - 0.55, fp.x + 1.1, fp.x + 0.55],
        candidate = { ...current, objects: [...current.objects, plant] };
      try {
        const placed = findCataloguePlacement(compileBuilding(candidate), plant.assetId, room.id, {
          object: plant,
          search: false,
          preferred: [front, rear].flatMap((z) =>
            xs.map((x) => ({ position: { x, y: 0, z }, rotation: plant.rotation })),
          ),
        });
        current = { ...current, objects: [...current.objects, placed] };
      } catch {
        // Decoration is optional; every requested room and functional fixture is retained.
      }
    }
    return validateBuilding(current).building;
  }
}
