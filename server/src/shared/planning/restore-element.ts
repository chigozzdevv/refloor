import { getObjectAsset } from '@refloor/scene';
import type { SceneCommand } from '@refloor/scene';
import { commandTouches, snapshotFor } from '@refloor/scene/edit-memory';
import type { ElementSnapshot } from '@refloor/scene/edit-memory';
import type { LanguageEditRequest } from '@refloor/scene/chat';

function beforeCommand(
  current: ElementSnapshot | null,
  inverse: SceneCommand,
): ElementSnapshot | null {
  if (inverse.type === 'add-object')
    return { kind: 'object', id: inverse.object.id, value: structuredClone(inverse.object) };
  const before = structuredClone(current);
  if (!before) return null;
  if (before.kind === 'object') {
    const value = before.value;
    switch (inverse.type) {
      case 'remove-object':
        return null;
      case 'move-object':
        Object.assign(value, {
          roomId: inverse.roomId,
          position: inverse.position,
          rotation: inverse.rotation,
        });
        break;
      case 'rotate-object':
        value.rotation = inverse.rotation;
        break;
      case 'resize-object':
        value.dimensions = inverse.dimensions;
        break;
      case 'replace-object':
        Object.assign(value, inverse.asset);
        break;
      case 'set-object-material':
        value.materials[inverse.slot] = inverse.material;
        break;
      case 'set-light': {
        const light = value.behaviours.find((item) => item.kind === 'light');
        if (light) Object.assign(light.state, inverse.state);
        break;
      }
      case 'set-television': {
        const television = value.behaviours.find((item) => item.kind === 'television');
        if (television) Object.assign(television.state, inverse.state);
        break;
      }
    }
  } else if (before.kind === 'wall' && inverse.type === 'set-wall-material') {
    before.value.material = inverse.material;
    if (inverse.exteriorMaterial === null) delete before.value.exteriorMaterial;
    else if (inverse.exteriorMaterial !== undefined)
      before.value.exteriorMaterial = inverse.exteriorMaterial;
  } else if (before.kind === 'wall' && inverse.type === 'set-wall-exterior-material') {
    if (inverse.material === null) delete before.value.exteriorMaterial;
    else before.value.exteriorMaterial = inverse.material;
  } else if (before.kind === 'roof' && inverse.type === 'set-roof-material')
    before.value.material = inverse.material;
  else if (before.kind === 'floor' && inverse.type === 'set-room-floor-material')
    before.value.floorMaterial = inverse.material;
  else if (before.kind === 'door' && inverse.type === 'set-door')
    before.value.state.open = inverse.open;
  return before;
}

function propertyOf(
  snapshot: ElementSnapshot | null,
  property: string,
  surface: string | null,
): unknown {
  if (!snapshot) return null;
  if (property === 'all') return snapshot.value;
  if (snapshot.kind === 'object') {
    const value = snapshot.value,
      light = value.behaviours.find((item) => item.kind === 'light')?.state,
      television = value.behaviours.find((item) => item.kind === 'television')?.state;
    switch (property) {
      case 'position':
        return { position: value.position, roomId: value.roomId };
      case 'rotation':
        return value.rotation;
      case 'size':
        return value.dimensions;
      case 'appearance':
        return surface ? value.materials[surface] : value.materials;
      case 'color':
        return value.materials[surface ?? 'body']?.color;
      case 'power':
        return light?.powered ?? television?.powered;
      case 'volume':
        return television?.volume;
      case 'brightness':
        return light?.intensity;
      case 'light-color':
        return light?.color;
      case 'source':
        return television?.source;
    }
  } else if (snapshot.kind === 'door')
    return property === 'open' ? snapshot.value.state.open : undefined;
  else {
    const material =
      snapshot.kind === 'wall'
        ? surface === 'exterior'
          ? (snapshot.value.exteriorMaterial ?? snapshot.value.material)
          : snapshot.value.material
        : snapshot.kind === 'roof'
          ? snapshot.value.material
          : snapshot.value.floorMaterial;
    if (property === 'appearance') return material;
    if (property === 'color') return material.color;
  }
  return undefined;
}

export function restoreElement(
  input: LanguageEditRequest,
  id: string,
  reference: string,
  surface: 'body' | 'frame' | 'walls' | 'floors' | 'exterior' | 'roof' | null,
): SceneCommand[] {
  const match =
    /^(original|previous)\.(position|rotation|size|appearance|color|power|volume|brightness|light-color|source|open|all)$/.exec(
      reference,
    );
  if (!match) throw new Error('Choose an original or previous property to restore.');
  const memory = input.context;
  if (!memory || memory.sceneId !== input.building.id)
    throw new Error('No recorded context is available for this house.');
  const original = memory.originals.find((item) => item.id === id);
  if (!original) throw new Error('This item has no recorded original state.');
  const property = match[2]!,
    target = {
      kind: original.kind,
      id,
      ...(surface === 'exterior' ? { side: 'exterior' as const } : {}),
    },
    current = snapshotFor(input.building, target);
  let saved: ElementSnapshot | null = match[1] === 'original' ? original : null;
  if (match[1] === 'previous') {
    for (const transition of memory.transitions.toReversed()) {
      const { commands, inverseCommands } = transition.revision;
      if (!commands.some((command) => commandTouches(command, target))) continue;
      let before = current;
      for (const inverse of inverseCommands)
        if (commandTouches(inverse, target)) before = beforeCommand(before, inverse);
      if (
        JSON.stringify(propertyOf(before, property, surface)) !==
        JSON.stringify(propertyOf(current, property, surface))
      ) {
        saved = before;
        break;
      }
    }
  }
  if (!saved) throw new Error('There is no earlier recorded value for that property.');
  if (propertyOf(saved, property, surface) === undefined)
    throw new Error('This element does not support that property.');
  if (saved.kind === 'object') {
    const object = saved.value;
    if (!current) {
      if (property === 'all') return [{ type: 'add-object', object: structuredClone(object) }];
      throw new Error('Restore the removed item before changing one of its properties.');
    }
    if (current.kind !== 'object') throw new Error('This item identity has changed.');
    if (property === 'position' || property === 'all') {
      const movement: SceneCommand = {
        type: 'move-object',
        objectId: id,
        roomId: object.roomId,
        position: object.position,
        rotation: property === 'all' ? object.rotation : current.value.rotation,
      };
      return property === 'all'
        ? [{ type: 'replace-object', objectId: id, asset: getObjectAsset(object) }, movement]
        : [movement];
    }
    if (property === 'rotation')
      return [{ type: 'rotate-object', objectId: id, rotation: object.rotation }];
    if (property === 'size')
      return [{ type: 'resize-object', objectId: id, dimensions: object.dimensions }];
    if (property === 'appearance' || property === 'color') {
      const slots =
        surface === 'body' || surface === 'frame'
          ? [surface]
          : property === 'color'
            ? ['body']
            : Object.keys(object.materials);
      return slots.map((slot): SceneCommand => {
        const savedMaterial = object.materials[slot],
          currentMaterial = current.value.materials[slot];
        if (!savedMaterial || !currentMaterial)
          throw new Error('That original surface is unavailable on the current item.');
        return {
          type: 'set-object-material',
          objectId: id,
          slot,
          material:
            property === 'color'
              ? { ...currentMaterial, color: savedMaterial.color }
              : savedMaterial,
        };
      });
    }
    const light = object.behaviours.find((item) => item.kind === 'light'),
      television = object.behaviours.find((item) => item.kind === 'television');
    if (light) {
      if (property === 'brightness')
        return [{ type: 'set-light', objectId: id, state: { intensity: light.state.intensity } }];
      if (property === 'light-color')
        return [{ type: 'set-light', objectId: id, state: { color: light.state.color } }];
      if (property === 'power')
        return [{ type: 'set-light', objectId: id, state: { powered: light.state.powered } }];
    }
    if (television) {
      if (property === 'volume')
        return [
          { type: 'set-television', objectId: id, state: { volume: television.state.volume } },
        ];
      if (property === 'source')
        return [
          { type: 'set-television', objectId: id, state: { source: television.state.source } },
        ];
      if (property === 'power')
        return [
          { type: 'set-television', objectId: id, state: { powered: television.state.powered } },
        ];
    }
  } else if (saved.kind === 'door' && (property === 'open' || property === 'all'))
    return [{ type: 'set-door', doorId: id, open: saved.value.state.open }];
  else if (saved.kind === 'wall' || saved.kind === 'floor' || saved.kind === 'roof') {
    const savedMaterial =
      saved.kind === 'wall'
        ? surface === 'exterior'
          ? (saved.value.exteriorMaterial ?? saved.value.material)
          : saved.value.material
        : saved.kind === 'roof'
          ? saved.value.material
          : saved.value.floorMaterial;
    const currentMaterial =
      current?.kind === 'wall'
        ? surface === 'exterior'
          ? (current.value.exteriorMaterial ?? current.value.material)
          : current.value.material
        : current?.kind === 'roof'
          ? current.value.material
          : current?.kind === 'floor'
            ? current.value.floorMaterial
            : null;
    const material =
      property === 'color' && currentMaterial
        ? { ...currentMaterial, color: savedMaterial.color }
        : savedMaterial;
    if (saved.kind === 'roof') return [{ type: 'set-roof-material', roofId: id, material }];
    if (saved.kind === 'wall')
      return surface === 'exterior'
        ? [
            {
              type: 'set-wall-exterior-material',
              wallId: id,
              material:
                property === 'color'
                  ? material
                  : (saved.value.exteriorMaterial ??
                    (current?.kind === 'wall' &&
                    JSON.stringify(current.value.material) === JSON.stringify(saved.value.material)
                      ? null
                      : savedMaterial)),
            },
          ]
        : [{ type: 'set-wall-material', wallId: id, material, preserveExterior: true }];
    return [{ type: 'set-room-floor-material', roomId: id, material }];
  }
  throw new Error('This element does not support that property.');
}
