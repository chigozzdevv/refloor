import { parseBuilding } from '@refloor/scene';
import { buildFloor } from '@refloor/engine/geometry/floor';
import { buildWall } from '@refloor/engine/geometry/wall';
import { buildStaircase } from '@refloor/engine/geometry/staircase';
import { buildRoof } from '@refloor/engine/geometry/roof';
import { objectBounds } from '@refloor/engine/collision/bounds';
import { resolveOptions } from '@refloor/engine/options';
import { fail } from '@refloor/engine/errors';
import { epsilon } from '@refloor/engine/math';
import type { CompiledBuilding, EngineOptions } from '@refloor/engine/types';

export function compileBuilding(
  input: unknown,
  settings: Partial<EngineOptions> = {},
): CompiledBuilding {
  const building = parseBuilding(input),
    options = resolveOptions(settings);
  if (building.objects.length > options.maxParts)
    fail('GEOMETRY_LIMIT', building.id, 'Object count exceeds the geometry budget');
  const floors = [...building.floors].sort((a, b) => a.elevation - b.elevation);
  for (let i = 1; i < floors.length; i++) {
    const lower = floors[i - 1],
      upper = floors[i];
    if (!lower || !upper) continue;
    if (
      (['x', 'z', 'width', 'depth'] as const).some(
        (key) => Math.abs(lower.footprint[key] - upper.footprint[key]) > epsilon,
      )
    )
      fail(
        'STOREY_ALIGNMENT',
        upper.id,
        'Storeys currently require matching footprints so the roof and slabs enclose the building',
      );
    if (
      Math.abs(lower.elevation + lower.height - (upper.elevation - upper.slabThickness)) > epsilon
    )
      fail('STOREY_GAP', upper.id, 'The upper slab must meet the lower storey ceiling');
  }
  const compiled: CompiledBuilding = {
    building,
    options,
    parts: [],
    colliders: [],
    surfaces: [],
    stairs: [],
    doors: [],
    instances: [],
  };
  const remaining = () => options.maxParts - compiled.parts.length - building.objects.length;
  for (const floor of building.floors) {
    const slab = buildFloor(floor, remaining());
    compiled.parts.push(...slab.parts);
    compiled.surfaces.push(...slab.surfaces);
    for (const wall of floor.walls) {
      const result = buildWall(floor, wall, remaining());
      compiled.parts.push(...result.parts);
      compiled.doors.push(...result.doors);
    }
  }
  for (const stair of building.stairs) {
    if (stair.risers > remaining())
      fail('GEOMETRY_LIMIT', stair.id, 'Staircase exceeds the geometry budget');
    const result = buildStaircase(building, stair, options);
    compiled.parts.push(...result.parts);
    compiled.surfaces.push(...result.surfaces);
    compiled.stairs.push(result.connection);
  }
  compiled.parts.push(...buildRoof(building));
  if (remaining() < 0)
    fail('GEOMETRY_LIMIT', building.id, 'Compiled geometry exceeds the part budget');
  compiled.colliders.push(...compiled.parts.map((part) => part.collider));
  for (const object of building.objects) {
    const floor = building.floors.find((value) => value.id === object.floorId);
    if (!floor) fail('OBJECT_FLOOR', object.id, 'Object floor is missing');
    const collider = objectBounds(object, floor.elevation);
    compiled.instances.push({ object, collider });
    compiled.colliders.push(collider);
  }
  return compiled;
}
