import type { Building, Footprint } from '@refloor/scene';
import { fail } from '@refloor/engine/errors';
import {
  contains,
  epsilon,
  polygonsOverlap,
  quarterTurn,
  rectPolygon,
  worldPoint,
} from '@refloor/engine/math';
import { boxPart } from '@refloor/engine/geometry/part';
import type {
  EngineOptions,
  Landing,
  MeshPart,
  Point3,
  StairConnection,
  WalkSurface,
} from '@refloor/engine/types';

type Stair = Building['stairs'][number];

export function buildStaircase(
  building: Building,
  stair: Stair,
  options: EngineOptions,
): { parts: MeshPart[]; surfaces: WalkSurface[]; connection: StairConnection } {
  const lower = building.floors.find((floor) => floor.id === stair.lowerFloorId),
    upper = building.floors.find((floor) => floor.id === stair.upperFloorId);
  if (!lower || !upper) fail('STAIR_FLOOR', stair.id, 'Staircase floors are missing');
  const turn = quarterTurn(stair.heading);
  if (turn === null)
    fail('STAIR_HEADING', stair.id, 'Staircases currently require quarter-turn headings');
  const width = turn % 2 ? stair.footprint.depth : stair.footprint.width,
    depth = turn % 2 ? stair.footprint.width : stair.footprint.depth;
  const rise = upper.elevation - lower.elevation,
    riser = rise / stair.risers;
  const flightCount = stair.kind === 'u-shaped' ? 2 : 1;
  if (
    stair.flightWidth < options.radius * 2 + options.clearance * 2 ||
    stair.landingDepth < options.radius * 2 + options.clearance * 2 ||
    riser > options.stepHeight + epsilon ||
    stair.treadDepth < options.minTreadDepth ||
    width < flightCount * stair.flightWidth - epsilon
  )
    fail(
      'STAIR_DIMENSIONS',
      stair.id,
      'Flight width, landing, tread or riser cannot accommodate the walker',
    );
  const firstRisers = stair.kind === 'u-shaped' ? Math.floor(stair.risers / 2) : stair.risers;
  const secondRisers = stair.risers - firstRisers;
  const run = (Math.max(firstRisers, secondRisers) - 1) * stair.treadDepth;
  const availableRun = depth - (stair.kind === 'u-shaped' ? stair.landingDepth : 0);
  if (availableRun < run - epsilon)
    fail('STAIR_RUN', stair.id, 'Stairwell is too short for the tread run and landing');
  const origin = {
    x: stair.footprint.x + stair.footprint.width / 2,
    y: lower.elevation,
    z: stair.footprint.z + stair.footprint.depth / 2,
  };
  const parts: MeshPart[] = [],
    surfaces: WalkSurface[] = [],
    path: Point3[] = [];
  const front = -depth / 2;
  const left = stair.kind === 'u-shaped' ? -width / 2 + stair.flightWidth / 2 : 0;
  const right = width / 2 - stair.flightWidth / 2;
  const world = (x: number, y: number, z: number) => worldPoint({ x, y, z }, origin, stair.heading);
  const landing = (floorId: string, x: number, y: number, z: number): Landing => {
    const local: Footprint = {
      x: x - stair.flightWidth / 2,
      z: z - stair.landingDepth / 2,
      width: stair.flightWidth,
      depth: stair.landingDepth,
    };
    const corners = [
      world(local.x, y, local.z),
      world(local.x + local.width, y, local.z),
      world(local.x, y, local.z + local.depth),
      world(local.x + local.width, y, local.z + local.depth),
    ];
    const xs = corners.map((p) => p.x),
      zs = corners.map((p) => p.z);
    const footprint = {
      x: Math.min(...xs),
      z: Math.min(...zs),
      width: Math.max(...xs) - Math.min(...xs),
      depth: Math.max(...zs) - Math.min(...zs),
    };
    const floor = floorId === lower.id ? lower : upper;
    if (
      corners.some((p) => !contains(floor.footprint, p)) ||
      floor.voids.some((hole) =>
        polygonsOverlap(rectPolygon(footprint), rectPolygon(hole.footprint)),
      )
    )
      fail(
        'STAIR_LANDING',
        stair.id,
        'Landing requires supported floor space outside the stairwell',
      );
    return { floorId, position: world(x, y, z), footprint, rotation: 0 };
  };
  const start = landing(lower.id, left, 0, front - stair.landingDepth / 2);
  const end =
    stair.kind === 'u-shaped'
      ? landing(upper.id, right, rise, front - stair.landingDepth / 2)
      : landing(upper.id, 0, rise, depth / 2 + stair.landingDepth / 2);
  path.push(start.position);
  const addStep = (
    id: string,
    x: number,
    z: number,
    stepWidth: number,
    stepDepth: number,
    height: number,
    role: 'stair-tread' | 'stair-landing',
  ) => {
    const centre = world(x, height / 2, z);
    parts.push(
      boxPart(
        {
          id,
          entityId: stair.id,
          floorId: lower.id,
          role,
          rotation: stair.heading,
          position: centre,
        },
        { x: stepWidth, y: height, z: stepDepth },
        stair.material,
      ),
    );
    surfaces.push({
      id: `${id}:surface`,
      entityId: stair.id,
      floorId: lower.id,
      footprint: {
        x: centre.x - stepWidth / 2,
        z: centre.z - stepDepth / 2,
        width: stepWidth,
        depth: stepDepth,
      },
      elevation: lower.elevation + height,
      rotation: stair.heading,
    });
  };
  if (stair.kind === 'straight') {
    const offset = depth - (stair.risers - 1) * stair.treadDepth;
    if (offset > epsilon) path.push(world(0, 0, front + offset / 2));
    for (let i = 1; i < stair.risers; i++) {
      const z = front + offset + (i - 0.5) * stair.treadDepth;
      addStep(
        `${stair.id}:step:${i}`,
        0,
        z,
        stair.flightWidth,
        stair.treadDepth,
        i * riser,
        'stair-tread',
      );
      path.push(world(0, i * riser, z));
    }
  } else {
    const lowerRun = (firstRisers - 1) * stair.treadDepth;
    const offset = run - lowerRun;
    if (offset > epsilon) path.push(world(left, 0, front + offset / 2));
    for (let i = 1; i < firstRisers; i++) {
      const z = front + offset + (i - 0.5) * stair.treadDepth;
      addStep(
        `${stair.id}:step:${i}`,
        left,
        z,
        stair.flightWidth,
        stair.treadDepth,
        i * riser,
        'stair-tread',
      );
      path.push(world(left, i * riser, z));
    }
    const landingDepth = depth - run,
      landingZ = front + run + landingDepth / 2;
    addStep(
      `${stair.id}:turn`,
      0,
      landingZ,
      width,
      landingDepth,
      firstRisers * riser,
      'stair-landing',
    );
    path.push(
      world(left, firstRisers * riser, landingZ),
      world(right, firstRisers * riser, landingZ),
    );
    for (let i = 1; i < secondRisers; i++) {
      const z = front + run - (i - 0.5) * stair.treadDepth;
      addStep(
        `${stair.id}:step:${firstRisers + i}`,
        right,
        z,
        stair.flightWidth,
        stair.treadDepth,
        (firstRisers + i) * riser,
        'stair-tread',
      );
      path.push(world(right, (firstRisers + i) * riser, z));
    }
  }
  path.push(end.position);
  return {
    parts,
    surfaces,
    connection: {
      id: stair.id,
      lower: start,
      upper: end,
      path,
      footprint: stair.footprint,
      heading: stair.heading,
      rise,
      riserHeight: riser,
      treadDepth: stair.treadDepth,
    },
  };
}
