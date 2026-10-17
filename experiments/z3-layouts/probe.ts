import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { init, killThreads } from 'z3-solver';
import { validateFloor, validateItems, validateStairs } from '@refloor/z3-layouts/validate';
import type { Floor, Item, Stairs, Rect } from '@refloor/z3-layouts/validate';

const began = performance.now();
const api = await init();
const startupMs = performance.now() - began;
const results: {
  name: string;
  expected: string;
  actual: string;
  solveMs: number;
  passed: boolean;
}[] = [];
const examples: Record<string, unknown> = {};
let sequence = 0;

type Spec = { id: string; minW: number; minD: number; exactW?: number };
type Rows = [Spec[], Spec[]];
const room = (id: string, minW: number, minD: number): Spec => ({ id, minW, minD });

function context() {
  const c = new api.Context(`probe_${sequence++}`);
  const solver = new c.Solver();
  solver.set('timeout', 5000);
  return { c, solver };
}

// The supported topology is explicit: two flexible rows with a corridor spine.
// Widths, row depths, hall width, and openings are solved, not fixed room meshes.
function floorExpressions(
  c: any,
  solver: any,
  width: number,
  depth: number,
  rows: Rows,
  prefix: string,
) {
  const cut = c.Int.const(`${prefix}_cut`),
    hall = c.Int.const(`${prefix}_hall`);
  solver.add(cut.ge(20), hall.ge(12), hall.le(16), cut.add(hall).le(depth - 20));
  const symbolic: any[] = [];
  for (const [side, specs] of rows.entries()) {
    let x = c.Int.val(0);
    for (const spec of specs) {
      const w = c.Int.const(`${prefix}_${spec.id}_w`);
      const z = side === 0 ? c.Int.val(0) : cut.add(hall);
      const d = side === 0 ? cut : c.Int.val(depth).sub(cut).sub(hall);
      solver.add(w.ge(spec.minW), d.ge(spec.minD));
      if (spec.exactW !== undefined) solver.add(w.eq(spec.exactW));
      symbolic.push({ ...spec, x, z, w, d, side });
      x = x.add(w);
    }
    solver.add(x.eq(width));
  }
  return { width, depth, cut, hall, symbolic };
}

function decodeFloor(model: any, expression: any, stairFloor?: number): Floor {
  const value = (e: any) => Number(model.eval(e, true).toString());
  const cut = value(expression.cut),
    hall = value(expression.hall);
  return {
    width: expression.width,
    depth: expression.depth,
    hall: { x: 0, z: cut, w: expression.width, d: hall },
    rooms: expression.symbolic.map((r: any) => {
      const x = value(r.x),
        z = value(r.z),
        w = value(r.w),
        d = value(r.d);
      return {
        id: r.id,
        x,
        z,
        w,
        d,
        minW: r.minW,
        minD: r.minD,
        door: {
          x:
            r.id.includes('stair') && stairFloor !== undefined
              ? x + (stairFloor === 0 ? 6 : 18)
              : x + w / 2,
          z: r.side === 0 ? cut : cut + hall,
          width: 9,
        },
      };
    }),
  };
}

async function check(
  name: string,
  solver: any,
  expected: 'sat' | 'unsat',
  validate?: (model: any) => unknown,
) {
  const started = performance.now();
  const actual = await solver.check();
  const elapsed = performance.now() - started;
  const result = {
    name,
    expected,
    actual,
    solveMs: Math.round(elapsed * 100) / 100,
    passed: false,
  };
  results.push(result);
  assert.equal(
    actual,
    expected,
    `${name}: ${actual === 'unknown' ? solver.reasonUnknown() : actual}`,
  );
  let output: any;
  if (actual === 'sat' && validate) output = validate(solver.model());
  result.passed = true;
  process.stdout.write(`PASS ${name}: ${actual} (${result.solveMs} ms)\n`);
  solver.release();
  return output;
}

function bungalowRows(beds: number, reversed: boolean): Rows {
  let a: Spec[], b: Spec[];
  if (beds === 1) {
    a = [room('living_dining', 42, 28), room('kitchen', 26, 26)];
    b = [room('bedroom_1', 32, 30), room('bathroom', 20, 22), room('workspace', 24, 24)];
  } else if (beds === 2) {
    a = [room('living_dining', 42, 28), room('kitchen', 26, 26), room('workspace', 24, 24)];
    b = [room('bedroom_1', 32, 30), room('bedroom_2', 32, 30), room('bathroom', 20, 22)];
  } else {
    a = [
      room('living_dining', 42, 28),
      room('kitchen', 26, 26),
      room('workspace', 24, 24),
      room('bathroom', 20, 22),
    ];
    b = [room('bedroom_1', 32, 30), room('bedroom_2', 32, 30), room('bedroom_3', 32, 30)];
  }
  return reversed ? [b.toReversed(), a.toReversed()] : [a, b];
}

async function bungalow(
  name: string,
  beds: number,
  width: number,
  depth: number,
  reversed: boolean,
  expected: 'sat' | 'unsat' = 'sat',
) {
  const { c, solver } = context();
  const expression = floorExpressions(
    c,
    solver,
    width,
    depth,
    bungalowRows(beds, reversed),
    'ground',
  );
  return check(name, solver, expected, (model) => {
    const floor = decodeFloor(model, expression);
    validateFloor(floor);
    return floor;
  });
}

const dimensions = [
  { id: 'sofa', w: 9, d: 21, side: 'left' as const },
  { id: 'tv', w: 4, d: 16, side: 'right' as const },
  { id: 'table', w: 6, d: 11, side: 'left' as const },
  { id: 'shelf', w: 4, d: 8, side: 'right' as const },
];
const fixture: Item[] = [
  { ...dimensions[0], x: 2, z: 10 },
  { ...dimensions[1], x: 53, z: 12 },
  { ...dimensions[2], x: 15, z: 33 },
  { ...dimensions[3], x: 48, z: 34 },
];
type Edit = { id: string; x?: number; z?: number; w?: number; d?: number };

async function furniture(
  name: string,
  expected: 'sat' | 'unsat',
  options: {
    width?: number;
    depth?: number;
    previous?: Item[];
    edit?: Edit;
    lockAll?: boolean;
  } = {},
) {
  const { c, solver } = context(),
    width = options.width ?? 60,
    depth = options.depth ?? 50;
  const leftEdge = width / 2 - 5,
    rightEdge = width / 2 + 5;
  const items = dimensions.map((item) => {
    const change = options.edit?.id === item.id ? options.edit : undefined;
    const w = change?.w ?? item.w,
      d = change?.d ?? item.d;
    const x = c.Int.const(`${item.id}_x`),
      z = c.Int.const(`${item.id}_z`);
    solver.add(x.ge(1), z.ge(5), x.add(w).le(width - 1), z.add(d).le(depth - 5));
    solver.add(item.side === 'left' ? x.add(w).le(leftEdge) : x.ge(rightEdge));
    const previous = options.previous?.find((p) => p.id === item.id);
    if (previous && (options.lockAll || item.id !== options.edit?.id))
      solver.add(x.eq(previous.x), z.eq(previous.z));
    if (change?.x !== undefined) solver.add(x.eq(change.x));
    if (change?.z !== undefined) solver.add(z.eq(change.z));
    return { ...item, w, d, x, z };
  });
  const noOverlap = (a: any, b: any) =>
    c.Or(a.x.add(a.w).le(b.x), b.x.add(b.w).le(a.x), a.z.add(a.d).le(b.z), b.z.add(b.d).le(a.z));
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) solver.add(noOverlap(items[i], items[j]));
  // Reserve a horizontal approach to each item, connected to the central route.
  for (const item of items) {
    // Double coordinates to represent half-unit centres without Int/Real casts.
    const zone = {
      x: item.side === 'left' ? item.x.add(item.w).mul(2) : c.Int.val(leftEdge * 2),
      z: item.z.mul(2).add(item.d).sub(10),
      w:
        item.side === 'left'
          ? c.Int.val(rightEdge).sub(item.x).sub(item.w).mul(2)
          : item.x.sub(leftEdge).mul(2),
      d: 20,
    };
    for (const other of items)
      if (other.id !== item.id)
        solver.add(
          noOverlap(zone, { x: other.x.mul(2), z: other.z.mul(2), w: other.w * 2, d: other.d * 2 }),
        );
  }
  const sofa = items[0],
    tv = items[1];
  const dz = sofa.z.mul(2).add(sofa.d).sub(tv.z.mul(2).add(tv.d));
  solver.add(dz.ge(-4), dz.le(4));
  return check(name, solver, expected, (model) => {
    const output: Item[] = items.map((i) => ({
      ...i,
      x: Number(model.eval(i.x).toString()),
      z: Number(model.eval(i.z).toString()),
    }));
    validateItems(width, depth, output);
    if (options.previous)
      for (const old of options.previous)
        if (old.id !== options.edit?.id)
          assert.deepEqual(
            output.find((i) => i.id === old.id),
            old,
          );
    return output;
  });
}

async function twoStorey(
  name: string,
  options: {
    width?: number;
    depth?: number;
    opening?: boolean;
    offset?: number;
    shrink?: number;
    headroom?: number;
    misalign?: boolean;
  } = {},
  expected: 'sat' | 'unsat' = 'sat',
) {
  const { c, solver } = context(),
    width = options.width ?? 100,
    depth = options.depth ?? 90;
  const stairsSpec: Spec = { id: 'stairs', minW: 24, minD: 40, exactW: 24 };
  const ground = floorExpressions(
    c,
    solver,
    width,
    depth,
    [
      [room('bathroom', 20, 22), stairsSpec, room('guest_bedroom', 32, 30)],
      [room('living_dining', 42, 28), room('kitchen', 26, 26), room('workspace', 24, 24)],
    ],
    'ground',
  );
  const upper = floorExpressions(
    c,
    solver,
    width,
    depth,
    [
      [room('bathroom', 20, 22), stairsSpec, room('bedroom_1', 32, 30)],
      [room('bedroom_2', 32, 30), room('bedroom_3', 32, 30), room('workspace', 24, 24)],
    ],
    'upper',
  );
  const a = ground.symbolic.find((r) => r.id === 'stairs'),
    b = upper.symbolic.find((r) => r.id === 'stairs');
  solver.add(ground.cut.eq(upper.cut), ground.hall.eq(upper.hall));
  solver.add(a.x.eq(b.x), a.z.eq(b.z), a.w.eq(b.w), a.d.eq(b.d));
  if (options.misalign) solver.add(a.x.add(5).eq(b.x));
  const opening = options.opening ?? true,
    offset = options.offset ?? 0,
    shrink = options.shrink ?? 0;
  const ox = a.x.add(offset),
    oz = a.z,
    ow = a.w.sub(shrink),
    od = a.d;
  solver.add(c.Bool.val(opening));
  solver.add(ox.le(a.x), oz.le(a.z), ox.add(ow).ge(a.x.add(a.w)), oz.add(od).ge(a.z.add(a.d)));
  solver.add(c.Real.val(options.headroom ?? 28).ge(21));
  return check(name, solver, expected, (model) => {
    const floors = [decodeFloor(model, ground, 0), decodeFloor(model, upper, 1)];
    floors.forEach(validateFloor);
    const s = floors[0].rooms.find((r) => r.id === 'stairs')!;
    const stairs: Stairs = {
      footprint: { x: s.x, z: s.z, w: s.w, d: s.d },
      opening: { x: s.x + offset, z: s.z, w: s.w - shrink, d: s.d },
      floorRise: 30,
      ceilingBelow: options.headroom ?? 28,
      risers: 18,
      tread: 2.8,
      flightWidth: 10,
      landing: 11,
    };
    validateStairs(stairs, floors);
    return { floors, stairs };
  });
}

let failure: unknown;
try {
  // 24 size/topology combinations, all requiring every named room to connect.
  for (const beds of [1, 2, 3])
    for (const variant of [0, 1, 2, 3])
      for (const reversed of [false, true]) {
        const width = [0, 80, 100, 120][beds] + variant * 4;
        const depth = [0, 70, 80, 90][beds] + variant * 2;
        const output = await bungalow(
          `${beds}br_${variant}_${reversed ? 'reversed' : 'forward'}`,
          beds,
          width,
          depth,
          reversed,
        );
        if (variant === 0 && !reversed) examples[`${beds}br`] = output;
      }
  await bungalow('reject_undersized_house', 3, 70, 60, false, 'unsat');
  await bungalow('reject_too_shallow_for_rooms_and_hall', 2, 100, 50, false, 'unsat');
  examples.freeFurniture = await furniture('free_furniture_6x5m', 'sat');
  await furniture('free_furniture_7x5.5m', 'sat', { width: 70, depth: 55 });
  await furniture('reject_furniture_room_too_narrow', 'unsat', { width: 24, depth: 50 });
  examples.fixture = await furniture('validate_existing_furniture', 'sat', {
    previous: fixture,
    lockAll: true,
  });
  examples.moveTV = await furniture('move_tv_preserve_other_items', 'sat', {
    previous: fixture,
    edit: { id: 'tv', x: 51, z: 12 },
  });
  examples.replaceTable = await furniture('larger_table_preserve_sofa_tv_shelf', 'sat', {
    previous: fixture,
    edit: { id: 'table', w: 10, d: 12 },
  });
  await furniture('reject_table_too_large', 'unsat', {
    previous: fixture,
    edit: { id: 'table', w: 200, d: 200 },
  });
  await furniture('reject_sofa_blocking_door_and_route', 'unsat', {
    previous: fixture,
    edit: { id: 'sofa', x: 27, z: 1 },
  });
  await furniture('reject_tv_through_wall', 'unsat', {
    previous: fixture,
    edit: { id: 'tv', x: 59 },
  });
  for (const variant of [0, 1, 2, 3]) {
    const output = await twoStorey(`two_storey_${variant}`, {
      width: 100 + variant * 4,
      depth: 90 + variant * 2,
    });
    if (variant === 0) examples.twoStorey = output;
  }
  await twoStorey('reject_missing_stair_opening', { opening: false }, 'unsat');
  await twoStorey('reject_shifted_stair_opening', { offset: 5 }, 'unsat');
  await twoStorey('reject_narrow_stair_opening', { shrink: 2 }, 'unsat');
  await twoStorey('reject_misaligned_stairwells', { misalign: true }, 'unsat');
  await twoStorey('reject_low_headroom', { headroom: 18 }, 'unsat');

  // Prove the independent checker also rejects corrupted *outputs* without Z3.
  const good = examples['2br'] as Floor;
  const badRoom = structuredClone(good);
  badRoom.rooms[0].door.width = 4;
  assert.throws(() => validateFloor(badRoom));
  const blocked = structuredClone(fixture);
  blocked[0].x = 26;
  blocked[0].z = 2;
  assert.throws(() => validateItems(60, 50, blocked));
  const building = examples.twoStorey as { floors: Floor[]; stairs: Stairs };
  const badOpening = structuredClone(building.stairs);
  badOpening.opening.x += 5;
  assert.throws(() => validateStairs(badOpening, building.floors));
  process.stdout.write(
    'PASS independent output corruption checks: narrow door, blocked route, shifted opening\n',
  );
} catch (error) {
  failure = error;
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
} finally {
  const times = results.map((r) => r.solveMs).sort((a, b) => a - b);
  const report = {
    timestamp: new Date().toISOString(),
    node: process.version,
    package: 'z3-solver@5.3.1',
    startupMs: Math.round(startupMs),
    elapsedMs: Math.round(performance.now() - began),
    completed: !failure,
    passed: results.filter((r) => r.passed).length,
    total: results.length,
    independentCorruptionChecks: failure ? 'incomplete' : 3,
    solveTimingMs: {
      min: times[0],
      median: times[Math.floor(times.length / 2)],
      max: times.at(-1),
    },
    scope:
      'Corridor-spine rectangular layouts, 2D clearance/path checks, four furniture footprints, aligned U-stair reservations and analytic headroom. No browser scene or AI calls.',
    assumptions: {
      unit: '10 cm',
      walkerRadiusCm: 30,
      wallThicknessCm: 10,
      doorwayCm: 90,
      reservedThroughRouteCm: 100,
      headroomCm: 210,
      notBuildingCodeCertification: true,
    },
    limitations: [
      'No arbitrary room topology or aesthetic evaluation',
      'No rendered geometry, Rapier stair traversal, mobile controls, TV playback, MongoDB or BullMQ integration',
      'No AI or Meshy API calls',
      'Experimental dimensions are product assumptions, not a building compliance assessment',
    ],
    results,
    examples,
    failure: failure instanceof Error ? failure.message : failure ? String(failure) : null,
  };
  await writeFile(
    new URL('./results.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  );
  await killThreads(api.em);
  process.stdout.write(
    `\n${failure ? 'STOPPED: ' : ''}${report.passed}/${report.total} solver cases passed. Startup ${report.startupMs} ms. Total ${report.elapsedMs} ms.\n`,
  );
}
if (failure) process.exitCode = 1;
