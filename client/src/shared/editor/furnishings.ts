import { assetFromCatalogue } from '@refloor/catalogue';
import type { SceneCommand, SceneObject } from '@refloor/scene';
import { validatePlacement } from '@refloor/engine';
import type { CompiledBuilding, NavigationPoint } from '@refloor/engine';
import { findFurniturePlacement } from '@/shared/editor/placement';

const legacyAsset = (object: SceneObject): string | null => {
  const name = object.id.split('/').at(-1) ?? '';
  if (object.assetId === 'catalogue/cabinet') {
    if (name === 'kitchen-counter') return 'kitchen-counter';
    if (name === 'kitchen-island' || name === 'island') return 'kitchen-island';
    if (name === 'vanity') return 'vanity';
    if (name === 'desk' || name === 'studio-sideboard') return 'desk';
    if (name === 'wardrobe') return 'wardrobe';
  }
  if (name === 'dining-table' && object.assetId === 'catalogue/coffee-table') return 'dining-table';
  if (name.startsWith('dining-chair-') && object.assetId === 'catalogue/chair')
    return 'dining-chair';
  return null;
};

export async function completeFurnishings(
  original: CompiledBuilding,
  player?: NavigationPoint,
  yieldProgress: () => Promise<void> = () => Promise.resolve(),
) {
  let compiled = original,
    skipped = 0;
  const commands: SceneCommand[] = [];
  const accept = (command: SceneCommand) => {
    const result = validatePlacement(
      compiled.building,
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        expectedRevision: compiled.building.revision,
        commands: [command],
      },
      compiled.options,
      player,
    );
    compiled = result.compiled;
    commands.push(command);
  };
  for (const object of original.building.objects) {
    const asset = legacyAsset(object);
    if (!asset) continue;
    await yieldProgress();
    try {
      const replacement = assetFromCatalogue(`catalogue/${asset}`);
      replacement.dimensions.width = object.dimensions.width;
      replacement.dimensions.depth = object.dimensions.depth;
      if (object.materials.body) replacement.materials.body = object.materials.body;
      accept({ type: 'replace-object', objectId: object.id, asset: replacement });
    } catch {
      skipped++;
    }
  }
  for (const floor of original.building.floors) {
    for (const room of floor.rooms) {
      const assets = [
        ...new Set(
          (room.uses ?? [room.kind]).flatMap((use) =>
            use === 'kitchen'
              ? ['kitchen-counter', 'fridge']
              : use === 'bathroom'
                ? ['vanity', 'toilet', 'shower']
                : use === 'workspace'
                  ? ['desk']
                  : use === 'bedroom'
                    ? ['wardrobe']
                    : [],
          ),
        ),
      ];
      const fp = room.footprint;
      for (const asset of assets) {
        const assetId = `catalogue/${asset}`;
        if (
          compiled.building.objects.some(
            (object) => object.roomId === room.id && object.assetId === assetId,
          )
        )
          continue;
        await yieldProgress();
        try {
          const object = findFurniturePlacement(compiled, assetId, room.id, player, [
            { x: fp.x + 0.7, z: fp.z + fp.depth - 0.7, rotation: Math.PI },
            { x: fp.x + fp.width - 0.7, z: fp.z + fp.depth - 0.7, rotation: Math.PI },
            { x: fp.x + fp.width / 2, z: fp.z + fp.depth - 0.55, rotation: Math.PI },
          ]);
          accept({ type: 'add-object', object });
        } catch {
          skipped++;
        }
      }
    }
  }
  return { commands, skipped };
}
