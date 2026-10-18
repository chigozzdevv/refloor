import { z } from 'zod';
import { assetFromCatalogue, catalogue, finishes } from '@refloor/catalogue';
import type { Building, Material, SceneCommand } from '@refloor/scene';
import type { ChatTarget, LanguageEditRequest } from '@refloor/scene/chat';

const vector = z.strictObject({ x: z.number(), y: z.number(), z: z.number() });
export const languagePlanSchema = z.strictObject({
  message: z.string().max(240),
  actions: z
    .array(
      z.strictObject({
        action: z.enum([
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
          'open',
          'source',
        ]),
        targetId: z.string(),
        surface: z.enum(['body', 'frame', 'walls', 'floors']).nullable(),
        vector: vector.nullable(),
        relative: z.boolean().nullable(),
        space: z.enum(['world', 'view']).nullable(),
        amount: z.number().nullable(),
        enabled: z.boolean().nullable(),
        value: z.string().nullable(),
      }),
    )
    .max(20),
});
export type LanguagePlan = z.infer<typeof languagePlanSchema>;

export function chatTargetExists(building: Building, target: ChatTarget): boolean {
  return target.kind === 'house'
    ? target.id === building.id
    : target.kind === 'object'
      ? building.objects.some((object) => object.id === target.id)
      : target.kind === 'wall'
        ? building.floors.some((floor) => floor.walls.some((wall) => wall.id === target.id))
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
    objects: input.building.objects.map(
      ({
        id,
        label,
        kind,
        dimensions,
        position,
        rotation,
        floorId,
        roomId,
        materials,
        behaviours,
      }) => ({
        id,
        label,
        kind,
        dimensions,
        position,
        rotation,
        floorId,
        roomId,
        materials,
        behaviours,
      }),
    ),
    floors: input.building.floors.map(({ id, elevation, height, rooms, walls }) => ({
      id,
      elevation,
      height,
      rooms: rooms.map(({ id, name, footprint, floorMaterial }) => ({
        id,
        name,
        footprint,
        floorMaterial,
      })),
      walls: walls.map(({ id, start, end, material, openings }) => ({
        id,
        start,
        end,
        material,
        doors: openings
          .filter((opening) => opening.kind === 'door')
          .map(({ id, state }) => ({ id, state })),
      })),
    })),
    catalogue: catalogue.map(({ assetId, label, kind, dimensions }) => ({
      assetId,
      label,
      kind,
      dimensions,
    })),
    finishes: Object.keys(finishes),
  };
}

export function languageCommands(input: LanguageEditRequest, plan: LanguagePlan): SceneCommand[] {
  const { building, target } = input;
  const commands: SceneCommand[] = [];
  for (const action of plan.actions) {
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
        const value = required(action.value);
        if (!Object.hasOwn(finishes, value)) throw new Error('That finish is unavailable.');
        return structuredClone(finishes[value as keyof typeof finishes]);
      }
      const color = z
        .string()
        .regex(/^#[\da-fA-F]{6}$/)
        .parse(required(action.value));
      return { ...base, color };
    };
    if (action.action === 'color' || action.action === 'finish') {
      if (wholeHouse) {
        if (action.surface === 'floors')
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
            });
      } else if (object) {
        const slot = action.surface === 'frame' ? 'frame' : 'body';
        if (!object.materials[slot]) throw new Error('That surface is unavailable on this item.');
        commands.push({
          type: 'set-object-material',
          objectId: object.id,
          slot,
          material: material(object.materials[slot]),
        });
      } else if (wall)
        commands.push({
          type: 'set-wall-material',
          wallId: wall.id,
          material: material(wall.material),
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
      const forwardLength = Math.hypot(input.view.x, input.view.z);
      if (action.space === 'view' && (forwardLength < 0.5 || forwardLength > 1.5))
        throw new Error('The viewing direction changed. Try again.');
      const view = { x: input.view.x / forwardLength, z: input.view.z / forwardLength };
      const delta =
        action.space === 'view'
          ? {
              x: -view.z * vector.x + view.x * vector.z,
              y: vector.y,
              z: view.x * vector.x + view.z * vector.z,
            }
          : vector;
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
      commands.push({
        type: 'move-object',
        objectId: object.id,
        roomId: nextRoom?.id ?? object.roomId,
        position,
        rotation: object.rotation,
      });
    } else if (object && action.action === 'rotate') {
      commands.push({
        type: 'rotate-object',
        objectId: object.id,
        rotation:
          (action.relative === false ? 0 : object.rotation) +
          (required(action.amount) * Math.PI) / 180,
      });
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
        light = object.behaviours.some((item) => item.kind === 'light');
      if (action.action === 'power' && (television || light))
        commands.push(
          television
            ? {
                type: 'set-television',
                objectId: object.id,
                state: { powered: required(action.enabled) },
              }
            : {
                type: 'set-light',
                objectId: object.id,
                state: { powered: required(action.enabled) },
              },
        );
      else if (action.action === 'mute' && television)
        commands.push({
          type: 'set-television',
          objectId: object.id,
          state: { muted: required(action.enabled) },
        });
      else if (action.action === 'volume' && television)
        commands.push({
          type: 'set-television',
          objectId: object.id,
          state: { volume: required(action.amount) },
        });
      else if (action.action === 'source' && television)
        commands.push({
          type: 'set-television',
          objectId: object.id,
          state: { source: required(action.value) },
        });
      else if (action.action === 'intensity' && light)
        commands.push({
          type: 'set-light',
          objectId: object.id,
          state: { intensity: required(action.amount) },
        });
      else if (action.action === 'light-color' && light)
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
      else throw new Error('This item does not support that action.');
    } else throw new Error('This element does not support that action.');
  }
  if (commands.length > 100) throw new Error('Please change fewer items at once.');
  return commands;
}
