import { z } from 'zod';
import { wallExteriorSide } from '@refloor/scene/wall-exterior';
import { sceneEventSchema, ruleConditionSchema } from '@refloor/scene/rules';
import { poweredBehaviourKindSchema, isPoweredBehaviour } from '@refloor/scene/behaviour';
import {
  assetFromCatalogue,
  catalogue,
  finishes,
  lightTuning,
  validateCommandTuning,
  placementProfile,
  getCatalogueEntry,
} from '@refloor/catalogue';
import { applyCommands } from '@refloor/scene';
import type { Building, Material, SceneCommand, SceneAction } from '@refloor/scene';
import type { ChatTarget, LanguageEditRequest } from '@refloor/scene/chat';
import { scopedEditMemory } from '@refloor/scene/edit-memory';
import {
  householdCapabilities,
  householdCommands,
  targetCapabilitySchema,
} from '@refloor/server/shared/planning/household-edit';
import { restoreElement } from '@refloor/server/shared/planning/restore-element';
import {
  objectMaterial,
  objectMaterialCommand,
} from '@refloor/server/shared/planning/object-material';
import {
  spatialCommands,
  spatialPlacementSchema,
} from '@refloor/server/shared/planning/spatial-edit';

import {
  siteSurfaceId,
  siteSurfaceLabels,
  siteSurfaceMaterial,
  siteSurfaceSlot,
  siteSurfaceSlotSchema,
} from '@refloor/scene/site-material';
import {
  movementDelta,
  openingCommand,
  openingEditSchema,
  partitionCapability,
  partitionMoveCommand,
} from '@refloor/server/shared/planning/structural-edit';

const languagePowerSchema = ruleConditionSchema.options[1].extend({
  behaviour: poweredBehaviourKindSchema.nullable().default(null),
});
const languageConditionSchema = z.discriminatedUnion('kind', [
  ruleConditionSchema.options[0],
  languagePowerSchema,
  ruleConditionSchema.options[2],
]);
const languageEventSchema = z.discriminatedUnion('kind', [
  ...languageConditionSchema.options,
  sceneEventSchema.options[3],
  sceneEventSchema.options[4],
]);
const vector = z.strictObject({ x: z.number(), y: z.number(), z: z.number() });
export const languageActionSchema = z.strictObject({
  action: z.enum([
    'add',
    'place',
    'opening',
    'move',
    'rotate',
    'resize',
    'color',
    'finish',
    'replace',
    'remove',
    'power',
    'mute',
    'volume',
    'intensity',
    'light-color',
    'reset-light',
    'cooker-heat',
    'cooker-burner',
    'water-flow',
    'water-temperature',
    'restore',
    'open',
    'source',
  ]),
  targetId: z.string(),
  targetCapability: targetCapabilitySchema.nullable().default(null),
  surface: z.enum(['body', 'frame', 'top', 'walls', 'floors', 'exterior', 'roof']).nullable(),
  vector: vector.nullable(),
  relative: z.boolean().nullable(),
  space: z.enum(['world', 'view']).nullable(),
  amount: z.number().nullable(),
  enabled: z.boolean().nullable(),
  value: z.string().nullable(),
  placement: spatialPlacementSchema.nullable().default(null),
  opening: openingEditSchema.nullable().default(null),
});
export const languagePlanSchema = z.strictObject({
  message: z.string().max(240),
  actions: z.array(languageActionSchema).max(20),
  automations: z
    .array(
      z.strictObject({
        operation: z.enum(['save', 'remove', 'enable']),
        id: z.string().nullable(),
        label: z.string().max(120),
        enabled: z.boolean(),
        trigger: languageEventSchema.nullable(),
        conditions: z.array(languageConditionSchema).max(8),
        actions: z.array(languageActionSchema).max(12),
      }),
    )
    .max(12),
});
export type LanguagePlan = z.input<typeof languagePlanSchema>;

export function chatTargetExists(building: Building, target: ChatTarget): boolean {
  if (target.side && target.kind !== 'wall') return false;
  if (target.kind === 'surface') return siteSurfaceSlot(building, target.id) !== null;
  if (target.kind === 'roof') return target.id === building.roof.id;
  return target.kind === 'house'
    ? target.id === building.id
    : target.kind === 'object'
      ? building.objects.some((object) => object.id === target.id)
      : target.kind === 'wall'
        ? building.floors.some((floor) =>
            floor.walls.some(
              (wall) =>
                wall.id === target.id &&
                (target.side !== 'exterior' || wallExteriorSide(floor, wall) !== null),
            ),
          )
        : target.kind === 'door'
          ? building.floors.some((floor) =>
              floor.walls.some((wall) =>
                wall.openings.some(
                  (opening) => opening.id === target.id && opening.kind === 'door',
                ),
              ),
            )
          : building.floors.some((floor) => floor.rooms.some((room) => room.id === target.id));
}

function required<T>(value: T | null): T {
  if (value === null) throw new Error('Please give a value for this change.');
  return value;
}

export function languageContext(input: LanguageEditRequest) {
  return {
    target: input.target,
    instruction: input.message,
    view: input.view,
    houseId: input.building.id,
    currentRoomId:
      input.target.kind === 'floor'
        ? input.target.id
        : input.target.kind === 'object'
          ? (input.building.objects.find((object) => object.id === input.target.id)?.roomId ?? null)
          : (input.building.floors
              .find((floor) => floor.id === input.player?.floorId)
              ?.rooms.find(
                (room) =>
                  input.player &&
                  input.player.position.x >= room.footprint.x &&
                  input.player.position.x <= room.footprint.x + room.footprint.width &&
                  input.player.position.z >= room.footprint.z &&
                  input.player.position.z <= room.footprint.z + room.footprint.depth,
              )?.id ?? null),
    savedActions: input.building.rules ?? [],
    roof: input.building.roof,
    siteSurfaces: siteSurfaceSlotSchema.options.map((slot) => ({
      id: siteSurfaceId(input.building, slot),
      slot,
      label: siteSurfaceLabels[slot],
      material: siteSurfaceMaterial(input.building, slot),
      actions: slot === 'planting' ? ['color', 'restore'] : ['color', 'finish', 'restore'],
    })),
    supportedEvents: [
      'door opens/closes',
      'device powers on/off (specify behaviour for compound fixtures)',
      'appliance or cabinet opens/closes',
      'enter a room',
      'click an object',
    ],
    context: input.context ? scopedEditMemory(input.context, input.target) : null,
    objects: input.building.objects.map(
      ({
        id,
        assetId,
        label,
        kind,
        dimensions,
        position,
        rotation,
        floorId,
        roomId,
        materials,
        behaviours,
        placement,
      }) => ({
        placement: placement ?? 'interior',
        id,
        tuning: { light: lightTuning({ assetId }) },
        label,
        kind,
        dimensions,
        position,
        rotation,
        floorId,
        roomId,
        materials: { ...getCatalogueEntry(assetId).materials, ...materials },
        behaviours,
        capabilities: householdCapabilities({ behaviours, assetId }),
        restorationDefaults: getCatalogueEntry(assetId).behaviours.filter((behaviour) =>
          getCatalogueEntry(assetId).optionalBehaviours?.includes(behaviour.kind),
        ),
      }),
    ),
    floors: input.building.floors.map((floor) => ({
      id: floor.id,
      elevation: floor.elevation,
      height: floor.height,
      rooms: floor.rooms.map(({ id, name, kind, uses, footprint, floorMaterial }) => ({
        id,
        name,
        kind,
        uses: uses ?? [kind],
        footprint,
        floorMaterial,
      })),
      walls: floor.walls.map((wall) => ({
        id: wall.id,
        start: wall.start,
        end: wall.end,
        material: wall.material,
        exteriorMaterial: wall.exteriorMaterial ?? wall.material,
        exterior: wallExteriorSide(floor, wall) !== null,
        movablePartition: partitionCapability(input.building, wall),
        openings: wall.openings.map((opening) => ({
          id: opening.id,
          kind: opening.kind,
          offset: opening.offset,
          width: opening.width,
          height: opening.height,
          sill: opening.kind === 'window' ? opening.sill : null,
        })),
        doors: wall.openings
          .filter((opening) => opening.kind === 'door')
          .map(({ id, state }) => ({ id, state })),
      })),
    })),
    catalogue: catalogue.map(({ assetId, label, kind, dimensions, behaviours }) => ({
      assetId,
      label,
      kind,
      dimensions,
      placement: placementProfile(assetId),
      behaviours,
      capabilities: householdCapabilities({ behaviours, assetId }),
    })),
    finishes: Object.keys(finishes),
  };
}

export function languageCommands(
  input: LanguageEditRequest,
  plan: LanguagePlan,
  options: { preserveRelative?: boolean } = {},
): SceneCommand[] {
  let building = input.building;
  const { target } = input;
  const commands: SceneCommand[] = [];
  const additions = plan.actions.flatMap((action) => {
    if (action.action !== 'add') return [];
    const quantity = action.amount ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 4)
      throw new Error('Add between one and four items in each request.');
    return Array.from({ length: quantity }, () => action);
  });
  for (const action of [
    ...plan.actions.filter((action) => action.action !== 'add'),
    ...additions,
  ]) {
    const offset = commands.length;
    if (target.kind !== 'house' && action.targetId !== target.id)
      throw new Error(
        'This chat can only change the selected item. Use house chat for other changes.',
      );
    const object = building.objects.find((item) => item.id === action.targetId);
    const walls = building.floors.flatMap((floor) => floor.walls);
    const wall = walls.find((item) => item.id === action.targetId);
    const rooms = building.floors.flatMap((floor) => floor.rooms);
    const room = rooms.find((item) => item.id === action.targetId);
    const door = walls
      .flatMap((item) => item.openings)
      .find((item) => item.id === action.targetId && item.kind === 'door');
    const wholeHouse = target.kind === 'house' && action.targetId === building.id;
    const material = (base: Material): Material => {
      if (action.action === 'finish') {
        const requested = required(action.value),
          value = action.surface === 'top' && requested === 'marble' ? 'marbleSlab' : requested;
        if (!Object.hasOwn(finishes, value)) throw new Error('That finish is unavailable.');
        return structuredClone(finishes[value as keyof typeof finishes]);
      }
      const color = z
        .string()
        .regex(/^#[\da-fA-F]{6}$/)
        .parse(required(action.value));
      return { ...base, color };
    };
    if (action.action === 'opening') {
      if (options.preserveRelative)
        throw new Error('Adjust openings directly; saved actions can control door state.');
      commands.push(openingCommand(building, action.targetId, input.view, action));
    } else if (wall && action.action === 'move') {
      if (options.preserveRelative)
        throw new Error('Adjust partitions directly; saved actions can change their finish.');
      commands.push(partitionMoveCommand(wall, input.view, action));
    } else if (action.action === 'add' || action.action === 'place') {
      if (options.preserveRelative)
        throw new Error(
          'Arrange or add furniture directly; saved actions can move existing items.',
        );
      commands.push(...spatialCommands(input, building, { ...action, action: action.action }));
    } else if (action.action === 'restore') {
      commands.push(
        ...restoreElement(
          { ...input, building },
          action.targetId,
          required(action.value),
          target.kind === 'wall' && target.side === 'exterior' ? 'exterior' : action.surface,
          action.targetCapability,
        ),
      );
    } else if (action.action === 'color' || action.action === 'finish') {
      const siteSlot = siteSurfaceSlot(building, action.targetId);
      if (siteSlot === 'planting' && action.action === 'finish')
        throw new Error(
          'Border foliage supports colour changes; change the bed or edging finish separately.',
        );
      const exteriorWalls = building.floors.flatMap((floor) =>
        floor.walls.filter((item) => wallExteriorSide(floor, item) !== null),
      );
      if (siteSlot)
        commands.push({
          type: 'set-site-material',
          surfaceId: action.targetId,
          material: material(siteSurfaceMaterial(building, siteSlot)),
        });
      else if (wholeHouse) {
        if (action.surface === 'roof')
          commands.push({
            type: 'set-roof-material',
            roofId: building.roof.id,
            material: material(building.roof.material),
          });
        else if (action.surface === 'exterior')
          for (const item of exteriorWalls)
            commands.push({
              type: 'set-wall-exterior-material',
              wallId: item.id,
              material: material(item.exteriorMaterial ?? item.material),
            });
        else if (action.surface === 'floors')
          for (const item of rooms)
            commands.push({
              type: 'set-room-floor-material',
              roomId: item.id,
              material: material(item.floorMaterial),
            });
        else
          for (const item of walls)
            commands.push({
              type: 'set-wall-material',
              wallId: item.id,
              material: material(item.material),
              preserveExterior: true,
            });
      } else if (object) {
        const slot =
            action.surface === 'frame' || action.surface === 'top' ? action.surface : 'body',
          current = objectMaterial(object, slot);
        if (!current) throw new Error('That surface is unavailable on this item.');
        if (options.preserveRelative && !object.materials[slot])
          throw new Error('Change this countertop once before adding it to a saved action.');
        commands.push(objectMaterialCommand(object, slot, material(current)));
      } else if (wall) {
        const exterior = target.side === 'exterior' || action.surface === 'exterior';
        if (exterior && !exteriorWalls.some((item) => item.id === wall.id))
          throw new Error('This wall has no exterior face.');
        commands.push(
          exterior
            ? {
                type: 'set-wall-exterior-material',
                wallId: wall.id,
                material: material(wall.exteriorMaterial ?? wall.material),
              }
            : {
                type: 'set-wall-material',
                wallId: wall.id,
                material: material(wall.material),
                preserveExterior: true,
              },
        );
      } else if (building.roof.id === action.targetId)
        commands.push({
          type: 'set-roof-material',
          roofId: building.roof.id,
          material: material(building.roof.material),
        });
      else if (room)
        commands.push({
          type: 'set-room-floor-material',
          roomId: room.id,
          material: material(room.floorMaterial),
        });
      else throw new Error('This surface cannot be recoloured.');
    } else if (action.action === 'open' && door) {
      commands.push({ type: 'set-door', doorId: door.id, open: required(action.enabled) });
    } else if (object && action.action === 'move') {
      const vector = required(action.vector);
      const delta = movementDelta(input.view, vector, action.space);
      const position =
        action.relative !== false
          ? {
              x: object.position.x + delta.x,
              y: object.position.y + delta.y,
              z: object.position.z + delta.z,
            }
          : vector;
      const floor = building.floors.find((item) => item.id === object.floorId)!;
      const nextRoom = floor.rooms.find(
        (item) =>
          position.x >= item.footprint.x &&
          position.x <= item.footprint.x + item.footprint.width &&
          position.z >= item.footprint.z &&
          position.z <= item.footprint.z + item.footprint.depth,
      );
      commands.push(
        options.preserveRelative && action.relative !== false
          ? { type: 'translate-object', objectId: object.id, delta }
          : {
              type: 'move-object',
              objectId: object.id,
              roomId: nextRoom?.id ?? object.roomId,
              position,
              rotation: object.rotation,
            },
      );
    } else if (object && action.action === 'rotate') {
      const radians = (required(action.amount) * Math.PI) / 180;
      commands.push(
        options.preserveRelative && action.relative !== false
          ? { type: 'turn-object', objectId: object.id, radians }
          : {
              type: 'rotate-object',
              objectId: object.id,
              rotation: (action.relative === false ? 0 : object.rotation) + radians,
            },
      );
    } else if (object && action.action === 'resize') {
      const value = required(action.vector);
      commands.push({
        type: 'resize-object',
        objectId: object.id,
        dimensions: { width: value.x, height: value.y, depth: value.z },
      });
    } else if (object && action.action === 'replace') {
      commands.push({
        type: 'replace-object',
        objectId: object.id,
        asset: assetFromCatalogue(required(action.value)),
      });
    } else if (object && action.action === 'remove') {
      commands.push({ type: 'remove-object', objectId: object.id });
    } else if (object) {
      const television = object.behaviours.some((item) => item.kind === 'television'),
        light = object.behaviours.some((item) => item.kind === 'light'),
        household = householdCommands(object, action, options.preserveRelative);
      if (household) commands.push(...household);
      else if (action.action === 'mute' && television)
        commands.push({
          type: 'set-television',
          objectId: object.id,
          state: { muted: required(action.enabled) },
        });
      else if (action.action === 'volume' && television) {
        const amount = required(action.amount);
        const current = object.behaviours.find((item) => item.kind === 'television')!.state.volume;
        commands.push(
          options.preserveRelative && action.relative === true
            ? { type: 'adjust-television-volume', objectId: object.id, delta: amount }
            : {
                type: 'set-television',
                objectId: object.id,
                state: {
                  volume:
                    action.relative === true ? Math.max(0, Math.min(1, current + amount)) : amount,
                },
              },
        );
      } else if (action.action === 'source' && television)
        commands.push({
          type: 'set-television',
          objectId: object.id,
          state: { source: required(action.value) },
        });
      else if (action.action === 'intensity' && light) {
        const amount = required(action.amount),
          tuning = lightTuning(object),
          current = object.behaviours.find((item) => item.kind === 'light')!.state.intensity;
        if (!tuning) throw new Error('This light has no brightness limits.');
        commands.push(
          options.preserveRelative && action.relative === true
            ? {
                type: 'adjust-light-intensity',
                objectId: object.id,
                delta: amount,
                limits: { min: tuning.min, max: tuning.max },
              }
            : {
                type: 'set-light',
                objectId: object.id,
                state: {
                  intensity:
                    action.relative === true
                      ? Math.max(tuning.min, Math.min(tuning.max, current + amount))
                      : amount,
                },
              },
        );
      } else if (action.action === 'light-color' && light)
        commands.push({
          type: 'set-light',
          objectId: object.id,
          state: {
            color: z
              .string()
              .regex(/^#[\da-fA-F]{6}$/)
              .parse(required(action.value)),
          },
        });
      else if (action.action === 'reset-light' && light) {
        const tuning = lightTuning(object);
        if (!tuning) throw new Error('This light has no default settings.');
        commands.push({ type: 'set-light', objectId: object.id, state: tuning.defaults });
      } else throw new Error('This item does not support that action.');
    } else throw new Error('This element does not support that action.');
    if (commands.length > offset)
      building = applyCommands(building, {
        id: input.requestId,
        at: new Date().toISOString(),
        expectedRevision: building.revision,
        commands: commands.slice(offset),
      }).building;
  }
  for (const automation of plan.automations) {
    const existing = (building.rules ?? []).find((rule) => rule.id === automation.id);
    if (automation.id && !existing) throw new Error('That saved action no longer exists.');
    if (automation.operation !== 'save' && !existing)
      throw new Error('That saved action no longer exists.');
    const normalizedEvent = (event: z.input<typeof languageEventSchema>) => {
      if (event.kind !== 'power') return event;
      const { behaviour, ...rest } = event;
      if (
        !behaviour &&
        building.objects
          .find((item) => item.id === event.objectId)
          ?.behaviours.filter(isPoweredBehaviour).length !== 1
      )
        throw new Error('Choose the cooker or tap capability for that saved power event.');
      return behaviour ? { ...rest, behaviour } : rest;
    };
    const trigger = automation.trigger
      ? sceneEventSchema.parse(normalizedEvent(automation.trigger))
      : existing?.trigger;
    if (!trigger) throw new Error('Choose what should trigger this action.');
    const selectedTrigger =
      target.kind === 'house' ||
      (target.kind === 'door' && trigger.kind === 'door' && trigger.doorId === target.id) ||
      (target.kind === 'object' && 'objectId' in trigger && trigger.objectId === target.id) ||
      (target.kind === 'floor' && trigger.kind === 'room-enter' && trigger.roomId === target.id);
    if (!selectedTrigger) throw new Error('Use house chat to connect actions on different items.');
    let rules = [...(building.rules ?? [])];
    if (automation.operation === 'remove') rules = rules.filter((rule) => rule.id !== existing!.id);
    else if (automation.operation === 'enable')
      rules = rules.map((rule) =>
        rule.id === existing!.id ? { ...rule, enabled: automation.enabled } : rule,
      );
    else {
      const actionBuilding = structuredClone(building);
      delete actionBuilding.rules;
      const actions = languageCommands(
        { ...input, target: { kind: 'house', id: building.id }, building: actionBuilding },
        {
          message: '',
          actions: automation.actions,
          automations: [],
        },
        { preserveRelative: true },
      );
      if (
        !actions.length ||
        actions.some((action) => action.type === 'set-rules' || action.type === 'emit-event')
      )
        throw new Error('A saved action needs a supported item change.');
      const rule = {
        id: existing?.id ?? crypto.randomUUID(),
        label: automation.label,
        enabled: automation.enabled,
        trigger,
        conditions: automation.conditions.map((condition) =>
          ruleConditionSchema.parse(normalizedEvent(condition)),
        ),
        actions: actions as SceneAction[],
      };
      rules = [...rules.filter((item) => item.id !== rule.id), rule];
    }
    const command: SceneCommand = { type: 'set-rules', rules };
    building = applyCommands(building, {
      id: input.requestId,
      at: new Date().toISOString(),
      expectedRevision: building.revision,
      commands: [command],
    }).building;
    commands.push(command);
  }
  if (commands.length > 100) throw new Error('Please change fewer items at once.');
  validateCommandTuning(input.building, commands);
  return commands;
}
