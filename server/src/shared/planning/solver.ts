import { init } from 'z3-solver';
import type { Arith } from 'z3-solver';
import type { Footprint } from '@refloor/scene';
import type {
  HouseRequirements,
  RoomRequirement,
} from '@refloor/server/shared/planning/requirements';
import { minimumDepth } from '@refloor/server/shared/planning/constraints';

export type PlannedRoom = {
  index: number;
  requirement: RoomRequirement;
  side: number;
  footprint: Footprint;
};
export type HouseLayout = {
  width: number;
  depth: number;
  hallX: number;
  hallWidth: number;
  rooms: PlannedRoom[];
};

export async function solveLayout(requirements: HouseRequirements): Promise<HouseLayout> {
  const { Context } = await init();
  const { Int, If, Or, Optimize } = new Context('house');
  const solver = new Optimize();
  solver.set('timeout', 5000);
  const depth = Int.const('house_depth');
  solver.add(depth.ge(90), depth.le(240));
  if (requirements.depth !== null) solver.add(depth.eq(Math.round(requirements.depth * 10)));
  const width = requirements.width ?? 14;
  const hallWidth = requirements.storeys === 2 ? 5.4 : 1.8;
  const hallX = (width - hallWidth) / 2;
  const variables = requirements.rooms.map((requirement, index) => {
    const side = Int.const(`side_${index}`),
      start = Int.const(`start_${index}`),
      size = Int.const(`depth_${index}`);
    solver.add(
      side.ge(0),
      side.le(1),
      start.ge(0),
      size.ge(minimumDepth(requirement)),
      start.add(size).le(depth),
    );
    if (requirement.side !== null) solver.add(side.eq(requirement.side === 'left' ? 0 : 1));
    return { requirement, index, side, start, size };
  });
  for (let floor = 0; floor < requirements.storeys; floor++) {
    const rooms = variables.filter((room) => room.requirement.floor === floor);
    for (const side of [0, 1])
      solver.add(
        rooms
          .reduce<Arith<'house'>>(
            (sum, room) => sum.add(If(room.side.eq(side), room.size, 0)),
            Int.val(0),
          )
          .eq(depth),
      );
    for (const [i, room] of rooms.entries())
      for (const other of rooms.slice(0, i)) {
        solver.add(
          Or(
            room.side.neq(other.side),
            room.start.add(room.size).le(other.start),
            other.start.add(other.size).le(room.start),
          ),
        );
        const rank = { front: 0, middle: 1, rear: 2 };
        if (rank[room.requirement.position] > rank[other.requirement.position])
          solver.add(Or(room.side.neq(other.side), room.start.ge(other.start.add(other.size))));
        if (rank[room.requirement.position] < rank[other.requirement.position])
          solver.add(Or(room.side.neq(other.side), other.start.ge(room.start.add(room.size))));
      }
  }
  solver.minimize(depth);
  solver.minimize(
    variables.reduce<Arith<'house'>>(
      (sum, room) =>
        sum.add(
          room.size
            .sub(minimumDepth(room.requirement))
            .mul(room.requirement.size === 'spacious' ? 1 : 2),
        ),
      Int.val(0),
    ),
  );
  const result = await solver.check();
  if (result !== 'sat') {
    solver.release();
    throw new Error(
      result === 'unsat'
        ? 'The requested rooms do not fit these dimensions and side assignments. Increase the depth or relax a side preference.'
        : 'Layout solving exceeded its time limit. Try fewer rooms or simpler side preferences.',
    );
  }
  const model = solver.model();
  const value = (expression: typeof depth) => Number(model.eval(expression).toString());
  const layout: HouseLayout = {
    width,
    depth: value(depth) / 10,
    hallX,
    hallWidth,
    rooms: variables.map((room) => ({
      index: room.index,
      requirement: room.requirement,
      side: value(room.side),
      footprint: {
        x: value(room.side) === 0 ? 0 : hallX + hallWidth,
        z: value(room.start) / 10,
        width: hallX,
        depth: value(room.size) / 10,
      },
    })),
  };
  solver.release();
  return layout;
}
