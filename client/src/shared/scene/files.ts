import type { Building } from '@refloor/scene';
import { validateBuildingAssets } from '@refloor/catalogue';
import { validateBuilding } from '@refloor/engine';
import type { CompiledBuilding } from '@refloor/engine';
import { entryPose } from '@/shared/navigation/entry';
import { restoreEditMemory } from '@/shared/editor/memory';
import type { EditMemory } from '@refloor/scene/edit-memory';

export const maxProjectBytes = 2 * 1024 * 1024;

export function readProjectFile(text: string) {
  if (new TextEncoder().encode(text).length > maxProjectBytes)
    throw new Error('Project files must be smaller than 2 MB.');
  const input: unknown = JSON.parse(text);
  let building = input;
  let memory: unknown;
  if (input && typeof input === 'object' && 'format' in input) {
    if (
      input.format !== 'refloor-project' ||
      !('version' in input) ||
      input.version !== 1 ||
      !('building' in input)
    )
      throw new Error('This project file version is not supported.');
    building = input.building;
    memory = 'memory' in input ? input.memory : undefined;
  }
  const compiled = validateBuilding(building);
  validateBuildingAssets(compiled.building);
  entryPose(compiled);
  return { compiled, memory: restoreEditMemory(compiled.building, memory) };
}

export function parseProjectFile(text: string): CompiledBuilding {
  return readProjectFile(text).compiled;
}

export function encodeProject(building: Building, memory?: EditMemory): string {
  return JSON.stringify(
    { format: 'refloor-project', version: 1, building, ...(memory ? { memory } : {}) },
    null,
    2,
  );
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
