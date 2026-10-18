import type { Building } from '@refloor/scene';
import { validateBuildingAssets } from '@refloor/catalogue';
import { validateBuilding } from '@refloor/engine';
import type { CompiledBuilding } from '@refloor/engine';
import { entryPose } from '@/runtime/physics/entry';

export const maxProjectBytes = 2 * 1024 * 1024;

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
  validateBuildingAssets(compiled.building);
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
