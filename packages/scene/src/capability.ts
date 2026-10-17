import type { SceneObject } from '@refloor/scene/object';

export type ObjectCapability =
  'move' | 'rotate' | 'resize' | 'replace' | 'remove' | 'material' | 'television' | 'light';

export function getObjectCapabilities(object: SceneObject): ObjectCapability[] {
  return [
    'move',
    'rotate',
    'resize',
    'replace',
    'remove',
    'material',
    ...object.behaviours.map((behaviour) => behaviour.kind),
  ];
}
