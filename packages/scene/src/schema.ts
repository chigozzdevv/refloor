import { buildingModelSchema } from '@refloor/scene/building';
import type { Footprint } from '@refloor/scene/primitives';
import { wallExteriorSide } from '@refloor/scene/wall-exterior';
import { eventTargetExists } from '@refloor/scene/rules';
import { siteSurfaceSlot } from '@refloor/scene/site-material';

const epsilon = 1e-6;

function contains(outer: Footprint, inner: Footprint): boolean {
  return (
    inner.x >= outer.x - epsilon &&
    inner.z >= outer.z - epsilon &&
    inner.x + inner.width <= outer.x + outer.width + epsilon &&
    inner.z + inner.depth <= outer.z + outer.depth + epsilon
  );
}

function overlaps(a: Footprint, b: Footprint): boolean {
  return (
    a.x < b.x + b.width - epsilon &&
    b.x < a.x + a.width - epsilon &&
    a.z < b.z + b.depth - epsilon &&
    b.z < a.z + a.depth - epsilon
  );
}

export const buildingSchema = buildingModelSchema.superRefine((building, context) => {
  const ids = new Set<string>();
  const report = (message: string, path: (string | number)[]) =>
    context.addIssue({ code: 'custom', message, path });
  const register = (id: string, path: (string | number)[]) => {
    if (ids.has(id)) report(`Duplicate entity ID: ${id}`, path);
    ids.add(id);
  };
  register(building.id, ['id']);
  register(building.roof.id, ['roof', 'id']);
  if ((building.roof.kind === 'flat') !== (building.roof.pitch === 0))
    report('Roof pitch must match the roof kind', ['roof', 'pitch']);

  building.floors.forEach((floor, fi) => {
    const fp = ['floors', fi];
    register(floor.id, [...fp, 'id']);
    floor.rooms.forEach((room, ri) => {
      const rp = [...fp, 'rooms', ri];
      register(room.id, [...rp, 'id']);
      if (room.uses) {
        if (new Set(room.uses).size !== room.uses.length)
          report('Room uses must be unique', [...rp, 'uses']);
        if (room.uses[0] !== room.kind)
          report('The primary room use must match its kind', [...rp, 'uses']);
        if (
          room.uses.length > 1 &&
          room.uses.some((use) => !['living', 'dining', 'kitchen'].includes(use))
        )
          report('Only living, dining and kitchen uses can share an open-plan room', [
            ...rp,
            'uses',
          ]);
      }
      if (!contains(floor.footprint, room.footprint)) report('Room extends outside its floor', rp);
      if (new Set(room.wallIds).size !== room.wallIds.length)
        report('Room wall references must be unique', [...rp, 'wallIds']);
      room.wallIds.forEach((id, wi) => {
        if (!floor.walls.some((wall) => wall.id === id))
          report('Room references a missing wall', [...rp, 'wallIds', wi]);
      });
      floor.rooms.slice(0, ri).forEach((other) => {
        if (overlaps(room.footprint, other.footprint)) report(`Room overlaps ${other.id}`, rp);
      });
    });
    floor.walls.forEach((wall, wi) => {
      const wp = [...fp, 'walls', wi];
      register(wall.id, [...wp, 'id']);
      if (wall.exteriorMaterial && !wallExteriorSide(floor, wall))
        report('Only exterior walls have an exterior finish', [...wp, 'exteriorMaterial']);
      const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
      if (length <= epsilon) report('A wall must have nonzero length', wp);
      if (wall.height > floor.height + epsilon) report('Wall is taller than its floor', wp);
      for (const point of [wall.start, wall.end]) {
        if (!contains(floor.footprint, { ...point, width: 0, depth: 0 }))
          report('Wall endpoint extends outside its floor', wp);
      }
      wall.openings.forEach((opening, oi) => {
        const op = [...wp, 'openings', oi];
        register(opening.id, [...op, 'id']);
        const sill = opening.kind === 'window' ? opening.sill : 0;
        if (
          opening.offset + opening.width > length + epsilon ||
          sill + opening.height > wall.height + epsilon
        )
          report('Opening extends outside its wall', op);
        wall.openings.slice(0, oi).forEach((other) => {
          const otherSill = other.kind === 'window' ? other.sill : 0;
          if (
            opening.offset < other.offset + other.width - epsilon &&
            other.offset < opening.offset + opening.width - epsilon &&
            sill < otherSill + other.height - epsilon &&
            otherSill < sill + opening.height - epsilon
          )
            report(`Opening overlaps ${other.id}`, op);
        });
      });
    });
    floor.voids.forEach((hole, vi) => {
      register(hole.id, [...fp, 'voids', vi, 'id']);
      if (!contains(floor.footprint, hole.footprint))
        report('Floor opening extends outside its floor', [...fp, 'voids', vi]);
      floor.voids.slice(0, vi).forEach((other) => {
        if (overlaps(hole.footprint, other.footprint))
          report('Floor openings overlap', [...fp, 'voids', vi]);
      });
    });
    building.floors.slice(0, fi).forEach((other) => {
      const lower = floor.elevation >= other.elevation ? other : floor;
      const upper = lower === floor ? other : floor;
      if (
        overlaps(lower.footprint, upper.footprint) &&
        upper.elevation - upper.slabThickness < lower.elevation + lower.height - epsilon
      )
        report('Floor volumes overlap', fp);
    });
  });

  building.objects.forEach((object, oi) => {
    const op = ['objects', oi];
    register(object.id, [...op, 'id']);
    const floor = building.floors.find((value) => value.id === object.floorId);
    const room = floor?.rooms.find((value) => value.id === object.roomId);
    if (!floor || !room) {
      report('Object must reference a room on its floor', op);
      return;
    }
    const cosine = Math.abs(Math.cos(object.rotation)),
      sine = Math.abs(Math.sin(object.rotation));
    const width = object.dimensions.width * cosine + object.dimensions.depth * sine;
    const depth = object.dimensions.width * sine + object.dimensions.depth * cosine;
    if (
      object.placement !== 'exterior' &&
      !contains(room.footprint, {
        x: object.position.x - width / 2,
        z: object.position.z - depth / 2,
        width,
        depth,
      })
    )
      report('Rotated object extends outside its room', op);
    if (object.placement === 'exterior') {
      if (!['light', 'decor'].includes(object.kind))
        report('Only exterior light fixtures and decor are supported outside', op);
      if (object.position.y < -0.25)
        report('Exterior fixture extends below the compound paving', op);
      if (
        !contains(
          {
            x: floor.footprint.x - 6,
            z: floor.footprint.z - 6,
            width: floor.footprint.width + 12,
            depth: floor.footprint.depth + 12,
          },
          {
            x: object.position.x - width / 2,
            z: object.position.z - depth / 2,
            width,
            depth,
          },
        )
      )
        report('Exterior fixture extends outside the compound', op);
    }
    if (object.placement !== 'exterior' && object.position.y < 0)
      report('Interior object cannot extend below its floor', [...op, 'position', 'y']);
    if (object.position.y + object.dimensions.height > floor.height + epsilon)
      report('Object extends above its floor ceiling', op);
    const kinds = object.behaviours.map((value) => value.kind);
    if (new Set(kinds).size !== kinds.length)
      report('Object has duplicate behaviours', [...op, 'behaviours']);
    if (object.kind === 'television' && !kinds.includes('television'))
      report('Television requires a screen behaviour', op);
    if (object.kind === 'light' && !kinds.includes('light'))
      report('Light requires a light behaviour', op);
  });

  building.rules?.forEach((rule, index) => {
    const rp = ['rules', index];
    register(rule.id, [...rp, 'id']);
    if (!eventTargetExists(building, rule.trigger))
      report('Action trigger refers to a missing item or capability', [...rp, 'trigger']);
    for (const condition of rule.conditions)
      if (!eventTargetExists(building, condition))
        report('Action condition refers to a missing item or capability', [...rp, 'conditions']);
    const added = rule.actions.flatMap((action) =>
      action.type === 'add-object' ? [action.object.id] : [],
    );
    for (const action of rule.actions) {
      if (action.type === 'set-site-material' && !siteSurfaceSlot(building, action.surfaceId))
        report('Saved action refers to a missing exterior surface', [...rp, 'actions']);
      if (
        action.type === 'set-light' ||
        action.type === 'adjust-light-intensity' ||
        action.type === 'set-television' ||
        action.type === 'adjust-television-volume' ||
        action.type === 'set-cooker' ||
        action.type === 'ignite-cooker' ||
        action.type === 'set-cooker-burner' ||
        action.type === 'adjust-cooker-heat' ||
        action.type === 'set-water' ||
        action.type === 'start-water' ||
        action.type === 'adjust-water-flow' ||
        action.type === 'adjust-water-temperature' ||
        action.type === 'set-openable'
      ) {
        const object = building.objects.find((value) => value.id === action.objectId);
        const capability =
          action.type === 'set-light' || action.type === 'adjust-light-intensity'
            ? 'light'
            : action.type === 'set-television' || action.type === 'adjust-television-volume'
              ? 'television'
              : action.type === 'set-cooker' ||
                  action.type === 'ignite-cooker' ||
                  action.type === 'set-cooker-burner' ||
                  action.type === 'adjust-cooker-heat'
                ? 'cooker'
                : action.type === 'set-openable'
                  ? 'openable'
                  : 'water';
        if (object && !object.behaviours.some((behaviour) => behaviour.kind === capability))
          report('Saved action requires a capability this object does not have', [
            ...rp,
            'actions',
          ]);
      }
      if (
        'objectId' in action &&
        !building.objects.some((object) => object.id === action.objectId) &&
        !added.includes(action.objectId)
      )
        report('Saved action refers to a missing object', [...rp, 'actions']);
      if (
        'doorId' in action &&
        !eventTargetExists(building, { kind: 'door', doorId: action.doorId, open: true })
      )
        report('Saved action refers to a missing door', [...rp, 'actions']);
      if (
        'roomId' in action &&
        !building.floors.some((floor) => floor.rooms.some((room) => room.id === action.roomId))
      )
        report('Saved action refers to a missing room', [...rp, 'actions']);
      if ('roofId' in action && action.roofId !== building.roof.id)
        report('Saved action refers to a missing roof', [...rp, 'actions']);
      if (
        'wallId' in action &&
        !building.floors.some((floor) => floor.walls.some((wall) => wall.id === action.wallId))
      )
        report('Saved action refers to a missing wall', [...rp, 'actions']);
      if (
        action.type === 'set-opening' &&
        !building.floors.some((floor) =>
          floor.walls.some(
            (wall) =>
              wall.id === action.wallId &&
              wall.openings.some((opening) => opening.id === action.openingId),
          ),
        )
      )
        report('Saved action refers to a missing opening', [...rp, 'actions']);
    }
  });

  building.stairs.forEach((stair, si) => {
    const sp = ['stairs', si];
    register(stair.id, [...sp, 'id']);
    const lower = building.floors.find((floor) => floor.id === stair.lowerFloorId);
    const upper = building.floors.find((floor) => floor.id === stair.upperFloorId);
    if (!lower || !upper || lower.elevation >= upper.elevation) {
      report('Staircase must connect an existing lower and upper floor', sp);
      return;
    }
    if (
      building.floors.some(
        (floor) => floor.elevation > lower.elevation && floor.elevation < upper.elevation,
      )
    )
      report('Staircase must connect adjacent storeys', sp);
    if (!contains(lower.footprint, stair.footprint) || !contains(upper.footprint, stair.footprint))
      report('Staircase extends outside a connected floor', sp);
    const hole = upper.voids.find((value) => value.id === stair.openingId);
    if (!hole || !contains(hole.footprint, stair.footprint))
      report('Upper floor requires an opening covering the stairwell', sp);
  });
});

export function parseBuilding(input: unknown) {
  return buildingSchema.parse(input);
}
