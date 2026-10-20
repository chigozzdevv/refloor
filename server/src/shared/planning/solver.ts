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
  family: 'central-hall' | 'side-gallery';
  width: number;
  depth: number;
  hallX: number;
  hallWidth: number;
  stairPosition: 'front' | 'rear';
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
  const family = requirements.circulation?.family ?? 'central-hall';
  const hallWidth = requirements.storeys === 2 ? 5.4 : 1.8;
  const largestProgramme = Math.max(...requirements.rooms.map((room) => room.uses.length));
  const publicWide =
    family === 'central-hall' && requirements.circulation?.balance === 'public-wide';
  const typicalRoomWidth = largestProgramme === 3 ? 5.8 : largestProgramme === 2 ? 5.2 : 4.2;
  const wingWidth =
    family === 'side-gallery'
      ? largestProgramme * 4.2
      : publicWide
        ? 4.2 + (largestProgramme > 1 ? 8.4 : 6)
        : typicalRoomWidth * 2;
  const width = requirements.width ?? Math.max(14, Math.round((hallWidth + wingWidth) * 10) / 10);
  const galleryLeft = requirements.circulation?.gallerySide !== 'right';
  const publicSide =
    requirements.rooms.find((room) => room.uses.includes('living'))?.side === 'right' ? 1 : 0;
  const availableWidth = Math.round((width - hallWidth) * 10) / 10;
  const narrowWidth = Math.max(4.2, Math.floor((availableWidth / 3) * 10 + 1e-6) / 10);
  const hallX =
    family === 'central-hall'
      ? publicWide
        ? publicSide === 0
          ? Math.round((availableWidth - narrowWidth) * 10) / 10
          : narrowWidth
        : availableWidth / 2
      : galleryLeft
        ? 0
        : availableWidth;
  const leftWidth = hallX,
    rightWidth = Math.round((availableWidth - hallX) * 1e6) / 1e6;
  const variables = requirements.rooms.map((requirement, index) => {
    const side = Int.const(`side_${index}`),
      start = Int.const(`start_${index}`),
      size = Int.const(`depth_${index}`),
      minimum = If(
        side.eq(0),
        minimumDepth(requirement, leftWidth),
        minimumDepth(requirement, rightWidth),
      );
    solver.add(side.ge(0), side.le(1), start.ge(0), size.ge(minimum), start.add(size).le(depth));
    if (family === 'side-gallery') solver.add(side.eq(galleryLeft ? 1 : 0));
    if (publicWide && requirement.uses.includes('living')) solver.add(side.eq(publicSide));
    if (requirement.side !== null) solver.add(side.eq(requirement.side === 'left' ? 0 : 1));
    return { requirement, index, side, start, size, minimum };
  });
  for (let floor = 0; floor < requirements.storeys; floor++) {
    const rooms = variables.filter((room) => room.requirement.floor === floor);
    for (const side of family === 'central-hall' ? [0, 1] : [galleryLeft ? 1 : 0])
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
        sum.add(room.size.sub(room.minimum).mul(room.requirement.size === 'spacious' ? 1 : 2)),
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
    family,
    width,
    depth: value(depth) / 10,
    hallX,
    hallWidth,
    stairPosition: requirements.circulation?.stairPosition ?? 'front',
    rooms: variables.map((room) => ({
      index: room.index,
      requirement: room.requirement,
      side: value(room.side),
      footprint: {
        x: value(room.side) === 0 ? 0 : hallX + hallWidth,
        z: value(room.start) / 10,
        width: value(room.side) === 0 ? leftWidth : rightWidth,
        depth: value(room.size) / 10,
      },
    })),
  };
  solver.release();
  return layout;
}
