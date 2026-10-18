import { assetFromCatalogue, createFurniture } from '@refloor/catalogue';
import { applyCommands } from '@refloor/scene';
import type { SceneCommand, SceneObject } from '@refloor/scene';
import { checkClearance, compileBuilding, validatePlacement } from '@refloor/engine';
import type { CompiledBuilding, NavigationPoint } from '@refloor/engine';

export type PlacementHint = { x: number; z: number; rotation: number };

export function replacementCommand(objectId: string, assetId: string): SceneCommand {
  return { type: 'replace-object', objectId, asset: assetFromCatalogue(assetId) };
}

export function findFurniturePlacement(
  compiled: CompiledBuilding,
  assetId: string,
  roomId: string,
  player?: NavigationPoint,
  preferred: PlacementHint[] = [],
): SceneObject {
  const floor = compiled.building.floors.find((value) =>
      value.rooms.some((room) => room.id === roomId),
    ),
    room = floor?.rooms.find((value) => value.id === roomId);
  if (!floor || !room) throw new Error('Choose a room for this object.');
  const entry = assetFromCatalogue(assetId),
    footprint = room.footprint,
    candidates: PlacementHint[] = [];
  const marginX = entry.dimensions.width / 2 + 0.15,
    marginZ = entry.dimensions.depth / 2 + 0.15;
  for (let x = footprint.x + marginX; x <= footprint.x + footprint.width - marginX; x += 0.55)
    for (let z = footprint.z + marginZ; z <= footprint.z + footprint.depth - marginZ; z += 0.55)
      candidates.push({ x, z, rotation: 0 });
  const cx = footprint.x + footprint.width / 2,
    cz = footprint.z + footprint.depth / 2;
  candidates.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
  let clearCandidates = 0;
  for (const { x, z, rotation } of [...preferred, ...candidates].slice(0, 140)) {
    const object = createFurniture(assetId, {
      id: crypto.randomUUID(),
      floorId: floor.id,
      roomId,
      position: {
        x,
        z,
        y: entry.kind === 'light' ? floor.height - entry.dimensions.height - 0.02 : 0,
      },
      rotation,
    });
    const edit = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      expectedRevision: compiled.building.revision,
      commands: [{ type: 'add-object' as const, object }],
    };
    try {
      const candidate = applyCommands(compiled.building, edit);
      if (checkClearance(compileBuilding(candidate.building, compiled.options)).length) continue;
      validatePlacement(compiled.building, edit, compiled.options, player);
      return object;
    } catch {
      if (++clearCandidates >= 8) break;
    }
  }
  throw new Error(
    'This room needs more clear floor space for that item. Move or remove something first.',
  );
}
