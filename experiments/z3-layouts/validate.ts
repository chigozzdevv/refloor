// Independent numeric checks. No Z3 expressions or solver APIs are used here.
// All horizontal dimensions are in decimetres (1 unit = 10 cm).
import assert from 'node:assert/strict';

export type Rect = { x: number; z: number; w: number; d: number };
export type Door = { x: number; z: number; width: number };
export type Room = Rect & { id: string; minW: number; minD: number; door: Door };
export type Floor = { width: number; depth: number; hall: Rect; rooms: Room[] };
export type Item = Rect & { id: string; side: 'left' | 'right' };
export type Segment = { x1: number; z1: number; x2: number; z2: number };
export const radius = 3; // 30 cm walker radius; an experimental assumption.
const eps = 1e-7;

export function overlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.z < b.z + b.d - eps && b.z < a.z + a.d - eps
  );
}

function roomWalls(room: Room): Segment[] {
  const segments: Segment[] = [
    { x1: room.x, z1: room.z, x2: room.x, z2: room.z + room.d },
    { x1: room.x + room.w, z1: room.z, x2: room.x + room.w, z2: room.z + room.d },
  ];
  for (const z of [room.z, room.z + room.d]) {
    if (Math.abs(z - room.door.z) < eps) {
      segments.push({ x1: room.x, z1: z, x2: room.door.x - room.door.width / 2, z2: z });
      segments.push({ x1: room.door.x + room.door.width / 2, z1: z, x2: room.x + room.w, z2: z });
    } else segments.push({ x1: room.x, z1: z, x2: room.x + room.w, z2: z });
  }
  return segments;
}

function distanceToSegment(x: number, z: number, s: Segment): number {
  const dx = s.x2 - s.x1,
    dz = s.z2 - s.z1;
  const t = Math.max(
    0,
    Math.min(1, ((x - s.x1) * dx + (z - s.z1) * dz) / (dx * dx + dz * dz || 1)),
  );
  return Math.hypot(x - s.x1 - t * dx, z - s.z1 - t * dz);
}

function distanceToRect(x: number, z: number, r: Rect): number {
  return Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.z - z, 0, z - r.z - r.d));
}

// A conservative 10 cm grid flood fill checks real openings and clearance.
// This is a 2D geometry check, not a browser physics or navmesh test.
export function reachable(
  width: number,
  depth: number,
  walls: Segment[],
  obstacles: Rect[],
  start: { x: number; z: number },
  targets: { x: number; z: number }[],
): { visited: number; targets: number } {
  const stride = width + 1;
  const passable = new Uint8Array(stride * (depth + 1));
  for (let z = 0; z <= depth; z++)
    for (let x = 0; x <= width; x++) {
      if (
        x < radius + 0.5 ||
        z < radius + 0.5 ||
        x > width - radius - 0.5 ||
        z > depth - radius - 0.5
      )
        continue;
      if (walls.some((s) => distanceToSegment(x, z, s) < radius + 0.5 - eps)) continue;
      if (obstacles.some((r) => distanceToRect(x, z, r) < radius - eps)) continue;
      passable[z * stride + x] = 1;
    }
  function closest(p: { x: number; z: number }): number {
    let best = -1,
      distance = Infinity;
    for (let z = Math.floor(p.z) - 1; z <= Math.ceil(p.z) + 1; z++) {
      for (let x = Math.floor(p.x) - 1; x <= Math.ceil(p.x) + 1; x++) {
        if (x < 0 || z < 0 || x > width || z > depth || !passable[z * stride + x]) continue;
        const dist = Math.hypot(x - p.x, z - p.z);
        if (dist < distance) {
          best = z * stride + x;
          distance = dist;
        }
      }
    }
    assert(best >= 0 && distance <= 1.5, `No walkable cell near (${p.x}, ${p.z})`);
    return best;
  }
  const seen = new Uint8Array(passable.length),
    queue: number[] = [closest(start)];
  seen[queue[0]] = 1;
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i],
      x = current % stride,
      z = Math.floor(current / stride);
    for (const [nx, nz] of [
      [x - 1, z],
      [x + 1, z],
      [x, z - 1],
      [x, z + 1],
    ]) {
      const n = nz * stride + nx;
      if (nx < 0 || nz < 0 || nx > width || nz > depth || !passable[n] || seen[n]) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  for (const target of targets)
    assert.equal(seen[closest(target)], 1, `Unreachable target ${JSON.stringify(target)}`);
  return { visited: queue.length, targets: targets.length };
}

export function validateFloor(floor: Floor): void {
  const regions: Rect[] = [floor.hall, ...floor.rooms];
  assert(floor.hall.d >= 12 && floor.hall.d <= 16);
  for (const rect of regions) {
    assert(rect.x >= 0 && rect.z >= 0 && rect.w > 0 && rect.d > 0);
    assert(rect.x + rect.w <= floor.width && rect.z + rect.d <= floor.depth);
  }
  for (let i = 0; i < regions.length; i++)
    for (let j = i + 1; j < regions.length; j++) {
      assert(!overlap(regions[i], regions[j]), 'Rooms overlap');
    }
  assert.equal(
    regions.reduce((area, r) => area + r.w * r.d, 0),
    floor.width * floor.depth,
    'Unassigned floor area',
  );
  for (const r of floor.rooms) {
    assert(r.w >= r.minW && r.d >= r.minD);
    assert(r.door.width >= 9);
    assert(r.door.x - r.door.width / 2 >= r.x + 1);
    assert(r.door.x + r.door.width / 2 <= r.x + r.w - 1);
    assert(r.door.z === floor.hall.z || r.door.z === floor.hall.z + floor.hall.d);
  }
  reachable(
    floor.width,
    floor.depth,
    floor.rooms.flatMap(roomWalls),
    [],
    { x: 5, z: floor.hall.z + floor.hall.d / 2 },
    floor.rooms
      .filter((r) => !r.id.includes('stair'))
      .map((r) => ({ x: r.x + r.w / 2, z: r.z + r.d / 2 })),
  );
}

export function validateItems(width: number, depth: number, items: Item[]): void {
  assert.equal(new Set(items.map((i) => i.id)).size, items.length, 'Duplicate identities');
  for (const a of items) {
    assert(a.x >= 1 && a.z >= 1 && a.x + a.w <= width - 1 && a.z + a.d <= depth - 1);
    for (const b of items) if (a.id !== b.id) assert(!overlap(a, b), 'Furniture collision');
  }
  const room: Room = {
    x: 0,
    z: 0,
    w: width,
    d: depth,
    id: 'living',
    minW: 1,
    minD: 1,
    door: { x: width / 2, z: 0, width: 9 },
  };
  // A second doorway opposite the entry tests a through route.
  const walls = roomWalls(room).filter((s) => !(s.z1 === depth && s.z2 === depth));
  walls.push({ x1: 0, z1: depth, x2: width / 2 - 4.5, z2: depth });
  walls.push({ x1: width / 2 + 4.5, z1: depth, x2: width, z2: depth });
  const anchors = items.map((i) => ({
    x: i.side === 'left' ? i.x + i.w + 4 : i.x - 4,
    z: i.z + i.d / 2,
  }));
  reachable(width, depth, walls, items, { x: width / 2, z: 5 }, [
    { x: width / 2, z: depth - 5 },
    ...anchors,
  ]);
}

export type Stairs = {
  footprint: Rect;
  opening: Rect;
  floorRise: number;
  ceilingBelow: number;
  risers: number;
  tread: number;
  flightWidth: number;
  landing: number;
};

export function validateStairs(stairs: Stairs, floors: Floor[]): void {
  const {
    footprint: s,
    opening: o,
    floorRise,
    ceilingBelow,
    risers,
    tread,
    flightWidth,
    landing,
  } = stairs;
  const lower = floors[0].rooms.find((r) => r.id.includes('stair'))!;
  const upper = floors[1].rooms.find((r) => r.id.includes('stair'))!;
  assert.deepEqual(
    [lower.x, lower.z, lower.w, lower.d],
    [upper.x, upper.z, upper.w, upper.d],
    'Misaligned stairwell',
  );
  assert(
    s.x >= o.x && s.z >= o.z && s.x + s.w <= o.x + o.w && s.z + s.d <= o.z + o.d,
    'Slab blocks staircase',
  );
  assert(flightWidth >= 10 && landing >= 10);
  assert(floorRise / risers <= 1.9 && floorRise / risers >= 1.5);
  assert(tread >= 2.5 && risers % 2 === 0);
  assert((risers / 2) * tread + landing <= s.d);
  assert(2 * flightWidth + 2 <= s.w);
  assert(ceilingBelow >= 21);
  // Sample both flights, the intermediate landing, and the upper arrival.
  // With a full stairwell opening, the next ceiling is on the upper storey.
  for (let n = 0; n <= risers; n++) {
    const second = n > risers / 2;
    const x = s.x + (second ? s.w - flightWidth / 2 - 1 : flightWidth / 2 + 1);
    const z = s.z + s.d - Math.max(0.5, second ? risers - n + 0.5 : n + 0.5) * tread;
    const feet = (n * floorRise) / risers;
    const insideOpening = x >= o.x && x <= o.x + o.w && z >= o.z && z <= o.z + o.d;
    const overhead = insideOpening ? floorRise + ceilingBelow : ceilingBelow;
    assert(overhead - feet >= 21, `Insufficient head clearance at riser ${n}`);
  }
  const entry = { x: lower.door.x, z: floors[0].hall.z + floors[0].hall.d / 2 };
  const exit = { x: upper.door.x, z: floors[1].hall.z + floors[1].hall.d / 2 };
  assert.equal(entry.x, s.x + 6);
  assert.equal(exit.x, s.x + 18);
  assert.equal(entry.z, exit.z);
}
