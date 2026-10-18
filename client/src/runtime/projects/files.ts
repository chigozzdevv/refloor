import type { Building } from '@refloor/scene';
import { getCatalogueEntry } from '@refloor/catalogue';
import { validateBuilding } from '@refloor/engine';
import type { CompiledBuilding } from '@refloor/engine';
import { entryPose } from '@/runtime/physics/entry';
import { mediaSource } from '@/runtime/media/playback';

export const maxProjectBytes = 2 * 1024 * 1024;
const textures = new Set(['wood-floor', 'fabric', 'plaster']);

export function parseProjectFile(text: string): CompiledBuilding {
  if (new TextEncoder().encode(text).length > maxProjectBytes)
    throw new Error('Project files must be smaller than 2 MB.');
  const input: unknown = JSON.parse(text);
  let building = input;
  if (input && typeof input === 'object' && 'format' in input) {
    if (
      input.format !== 'refloor-project' ||
      !('version' in input) ||
      input.version !== 1 ||
      !('building' in input)
    )
      throw new Error('This project file version is not supported.');
    building = input.building;
  }
  const compiled = validateBuilding(building);
  const materials = [
    ...compiled.building.floors.flatMap((floor) => [
      ...floor.rooms.map((room) => room.floorMaterial),
      ...floor.walls.flatMap((wall) => [
        wall.material,
        ...wall.openings.map((opening) => opening.material),
      ]),
    ]),
    compiled.building.roof.material,
    ...compiled.building.objects.flatMap((object) => Object.values(object.materials)),
    ...compiled.building.stairs.map((stair) => stair.material),
  ];
  for (const material of materials)
    if (material.textureId && !textures.has(material.textureId))
      throw new Error(`This project uses an unavailable texture: ${material.textureId}`);
  for (const object of compiled.building.objects) {
    const entry = getCatalogueEntry(object.assetId);
    if (
      object.kind !== entry.kind ||
      Object.keys(entry.materials).some((slot) => !object.materials[slot]) ||
      object.behaviours
        .map((value) => value.kind)
        .sort()
        .join(',') !==
        entry.behaviours
          .map((value) => value.kind)
          .sort()
          .join(',')
    )
      throw new Error(`This project uses an incompatible object definition: ${object.label}`);
    const tv = object.behaviours.find((value) => value.kind === 'television');
    if (tv && !mediaSource(tv.state.source))
      throw new Error('This project refers to an unavailable video asset.');
  }
  entryPose(compiled);
  return compiled;
}

export function encodeProject(building: Building): string {
  return JSON.stringify({ format: 'refloor-project', version: 1, building }, null, 2);
}

export function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })),
    link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
