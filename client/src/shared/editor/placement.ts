import { assetFromCatalogue, findCataloguePlacement } from '@refloor/catalogue';
import type { SceneCommand, SceneObject } from '@refloor/scene';
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
  return findCataloguePlacement(compiled, assetId, roomId, {
    player,
    preferred: preferred.map(({ x, z, rotation }) => ({ position: { x, y: 0, z }, rotation })),
  });
}
