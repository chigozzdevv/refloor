import { getObjectAsset } from '@refloor/scene';
import { isPoweredBehaviour } from '@refloor/scene/behaviour';
import type { TargetCapability } from '@refloor/server/shared/planning/household-edit';
import type { SceneCommand, SceneObject } from '@refloor/scene';
import { commandTouches, snapshotFor } from '@refloor/scene/edit-memory';
import type { ElementSnapshot } from '@refloor/scene/edit-memory';
import type { LanguageEditRequest } from '@refloor/scene/chat';
import { defaultSiteMaterial } from '@refloor/scene/site-material';
import { getCatalogueEntry } from '@refloor/catalogue';
import {
  objectMaterial,
  objectMaterialCommand,
} from '@refloor/server/shared/planning/object-material';

function effectiveOriginalObject(object: SceneObject): SceneObject {
  const entry = getCatalogueEntry(object.assetId);
  return {
    ...object,
    behaviours: [
      ...object.behaviours,
      ...entry.behaviours.filter(
        (behaviour) =>
          entry.optionalBehaviours?.includes(behaviour.kind) &&
          !object.behaviours.some((current) => current.kind === behaviour.kind),
      ),
    ],
  };
}

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
      case 'add-object-behaviours':
        value.behaviours.push(...structuredClone(inverse.behaviours));
        break;
      case 'remove-object-behaviours':
        value.behaviours = value.behaviours.filter(
          (behaviour) => !inverse.kinds.includes(behaviour.kind),
        );
        break;
      case 'set-cooker': {
        const cooker = value.behaviours.find((item) => item.kind === 'cooker');
        if (cooker) Object.assign(cooker.state, inverse.state);
        break;
      }
      case 'set-water': {
        const water = value.behaviours.find((item) => item.kind === 'water');
        if (water) Object.assign(water.state, inverse.state);
        break;
      }
      case 'set-openable': {
        const openable = value.behaviours.find((item) => item.kind === 'openable');
        if (openable) Object.assign(openable.state, inverse.state);
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
  } else if (before.kind === 'wall' && inverse.type === 'move-partition') {
    const axis = before.value.start.x === before.value.end.x ? 'x' : 'z';
    before.value.start[axis] = inverse.position;
    before.value.end[axis] = inverse.position;
  } else if ((before.kind === 'wall' || before.kind === 'door') && inverse.type === 'set-opening') {
    const opening =
      before.kind === 'wall'
        ? before.value.openings.find((opening) => opening.id === inverse.openingId)
        : before.value.id === inverse.openingId
          ? before.value
          : null;
    if (opening) {
      opening.offset = inverse.offset;
      opening.width = inverse.width;
      opening.height = inverse.height;
      if (opening.kind === 'window' && inverse.sill !== null) opening.sill = inverse.sill;
    }
  } else if (before.kind === 'roof' && inverse.type === 'set-roof-material')
    before.value.material = inverse.material;
  else if (before.kind === 'surface' && inverse.type === 'set-site-material')
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
  capability: TargetCapability | null,
): unknown {
  if (!snapshot) return null;
  if (property === 'all') return snapshot.value;
  if (snapshot.kind === 'object') {
    const value = snapshot.value,
      light = value.behaviours.find((item) => item.kind === 'light')?.state,
      television = value.behaviours.find((item) => item.kind === 'television')?.state,
      cooker = value.behaviours.find((item) => item.kind === 'cooker')?.state,
      water = value.behaviours.find((item) => item.kind === 'water')?.state,
      openable = value.behaviours.find((item) => item.kind === 'openable')?.state;
    const expectedCapability: Record<string, TargetCapability> = {
      heat: 'cooker',
      burners: 'cooker',
      flow: 'water',
      temperature: 'water',
      open: 'openable',
      volume: 'television',
      source: 'television',
      brightness: 'light',
      'light-color': 'light',
    };
    if (capability && expectedCapability[property] && expectedCapability[property] !== capability)
      throw new Error('The recorded property does not belong to that device capability.');
    switch (property) {
      case 'position':
        return { position: value.position, roomId: value.roomId };
      case 'rotation':
        return value.rotation;
      case 'size':
        return value.dimensions;
      case 'appearance':
        return surface ? objectMaterial(value, surface) : value.materials;
      case 'color':
        return objectMaterial(value, surface ?? 'body')?.color;
      case 'power': {
        const powered = value.behaviours.filter(isPoweredBehaviour),
          device = capability
            ? powered.find((item) => item.kind === capability)
            : powered.length === 1
              ? powered[0]
              : null;
        if (!capability && powered.length > 1)
          throw new Error('Choose which device power to restore: the cooker or the tap.');
        return device && 'powered' in device.state ? device.state.powered : undefined;
      }
      case 'heat':
        return cooker?.heat;
      case 'burners':
        return cooker?.burners;
      case 'flow':
        return water?.flow;
      case 'temperature':
        return water?.temperature;
      case 'open':
        return openable?.open;
      case 'volume':
        return television?.volume;
      case 'brightness':
        return light?.intensity;
      case 'light-color':
        return light?.color;
      case 'source':
        return television?.source;
    }
  } else if (snapshot.kind === 'surface') {
    const material = snapshot.value.material ?? defaultSiteMaterial(snapshot.value.slot);
    if (property === 'appearance') return material;
    if (property === 'color') return material.color;
  } else if (snapshot.kind === 'door') {
    if (property === 'open') return snapshot.value.state.open;
    if (property === 'position') return snapshot.value.offset;
    if (property === 'size') return { width: snapshot.value.width, height: snapshot.value.height };
  } else {
    if (snapshot.kind === 'wall' && property === 'position')
      return { start: snapshot.value.start, end: snapshot.value.end };
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
  surface: 'body' | 'frame' | 'top' | 'walls' | 'floors' | 'exterior' | 'roof' | null,
  capability: TargetCapability | null = null,
): SceneCommand[] {
  const match =
    /^(original|previous)\.(position|rotation|size|appearance|color|power|volume|brightness|light-color|source|open|heat|burners|flow|temperature|all)$/.exec(
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
  let saved: ElementSnapshot | null =
    match[1] === 'original'
      ? original.kind === 'object'
        ? { ...original, value: effectiveOriginalObject(original.value) }
        : original
      : null;
  if (match[1] === 'previous') {
    for (const transition of memory.transitions.toReversed()) {
      const { commands, inverseCommands } = transition.revision;
      if (!commands.some((command) => commandTouches(command, target))) continue;
      let before = current;
      for (const inverse of inverseCommands)
        if (commandTouches(inverse, target)) before = beforeCommand(before, inverse);
      if (
        JSON.stringify(propertyOf(before, property, surface, capability)) !==
        JSON.stringify(propertyOf(current, property, surface, capability))
      ) {
        saved = before;
        break;
      }
    }
  }
  if (!saved) throw new Error('There is no earlier recorded value for that property.');
  if (propertyOf(saved, property, surface, capability) === undefined)
    throw new Error(
      match[1] === 'previous'
        ? 'No earlier recorded value exists for that device property.'
        : 'This element does not support that property.',
    );
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
        surface === 'body' || surface === 'frame' || surface === 'top'
          ? [surface]
          : property === 'color'
            ? ['body']
            : [
                ...new Set([
                  ...Object.keys(object.materials),
                  ...(getCatalogueEntry(object.assetId).optionalMaterials ?? []),
                ]),
              ];
      const currentObject = structuredClone(current.value);
      return slots.map((slot): SceneCommand => {
        const savedMaterial = objectMaterial(object, slot),
          currentMaterial = objectMaterial(currentObject, slot);
        if (!savedMaterial || !currentMaterial)
          throw new Error('That original surface is unavailable on the current item.');
        const material =
            property === 'color'
              ? { ...currentMaterial, color: savedMaterial.color }
              : savedMaterial,
          command = objectMaterialCommand(currentObject, slot, material);
        currentObject.materials[slot] = structuredClone(material);
        return command;
      });
    }
    const light = object.behaviours.find((item) => item.kind === 'light'),
      television = object.behaviours.find((item) => item.kind === 'television'),
      cooker = object.behaviours.find((item) => item.kind === 'cooker'),
      water = object.behaviours.find((item) => item.kind === 'water'),
      openable = object.behaviours.find((item) => item.kind === 'openable');
    if (property === 'open' && openable)
      return [{ type: 'set-openable', objectId: id, state: { open: openable.state.open } }];
    if (cooker) {
      if (property === 'heat')
        return [{ type: 'set-cooker', objectId: id, state: { heat: cooker.state.heat } }];
      if (property === 'burners')
        return [{ type: 'set-cooker', objectId: id, state: { burners: cooker.state.burners } }];
      if (property === 'power' && (!capability || capability === 'cooker'))
        return [{ type: 'set-cooker', objectId: id, state: { powered: cooker.state.powered } }];
    }
    if (water) {
      if (property === 'flow')
        return [{ type: 'set-water', objectId: id, state: { flow: water.state.flow } }];
      if (property === 'temperature')
        return [
          { type: 'set-water', objectId: id, state: { temperature: water.state.temperature } },
        ];
      if (property === 'power' && (!capability || capability === 'water'))
        return [{ type: 'set-water', objectId: id, state: { powered: water.state.powered } }];
    }
    if (light) {
      if (property === 'brightness')
        return [{ type: 'set-light', objectId: id, state: { intensity: light.state.intensity } }];
      if (property === 'light-color')
        return [{ type: 'set-light', objectId: id, state: { color: light.state.color } }];
      if (property === 'power' && (!capability || capability === 'light'))
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
      if (property === 'power' && (!capability || capability === 'television'))
        return [
          { type: 'set-television', objectId: id, state: { powered: television.state.powered } },
        ];
    }
  } else if (saved.kind === 'wall' && property === 'position') {
    const axis =
      saved.value.start.x === saved.value.end.x
        ? 'x'
        : saved.value.start.z === saved.value.end.z
          ? 'z'
          : null;
    if (!axis) throw new Error('Only straight axis-aligned partitions can restore their position.');
    return [{ type: 'move-partition', wallId: id, position: saved.value.start[axis] }];
  } else if (saved.kind === 'door' && ['position', 'size', 'all'].includes(property)) {
    const wall = input.building.floors
        .flatMap((floor) => floor.walls)
        .find((wall) => wall.openings.some((opening) => opening.id === id)),
      opening = wall?.openings.find((opening) => opening.id === id);
    if (!wall || !opening || opening.kind !== 'door') throw new Error('This door is unavailable.');
    const commands: SceneCommand[] = [
      {
        type: 'set-opening',
        wallId: wall.id,
        openingId: id,
        offset: property === 'size' ? opening.offset : saved.value.offset,
        width: property === 'position' ? opening.width : saved.value.width,
        height: property === 'position' ? opening.height : saved.value.height,
        sill: null,
      },
    ];
    if (property === 'all')
      commands.push({ type: 'set-door', doorId: id, open: saved.value.state.open });
    return commands;
  } else if (saved.kind === 'surface') {
    const savedMaterial = saved.value.material ?? defaultSiteMaterial(saved.value.slot),
      currentMaterial =
        current?.kind === 'surface'
          ? (current.value.material ?? defaultSiteMaterial(current.value.slot))
          : null;
    return [
      {
        type: 'set-site-material',
        surfaceId: id,
        material:
          property === 'color' && currentMaterial
            ? { ...currentMaterial, color: savedMaterial.color }
            : saved.value.material,
      },
    ];
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
