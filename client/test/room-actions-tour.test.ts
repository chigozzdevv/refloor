import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { MathUtils } from 'three';
import { applyCommands } from '@refloor/scene';
import type { Building, SceneCommand } from '@refloor/scene';
import { compileBuilding } from '@refloor/engine';
import { contains } from '@refloor/engine/math';
import { CharacterWorld } from '@/shared/navigation/physics-world';
import { destinations, smoothRoute } from '@/shared/navigation/destinations';
import { createJourney, stepJourney } from '@/shared/navigation/journey';
import type { Journey } from '@/shared/navigation/journey';
import { doorRoute } from '@/shared/navigation/door-route';
import { TourDoors } from '@/shared/navigation/tour-doors';

it('finishes a generated room route when a room-entry action changes lighting mid-walk', () => {
  const building = JSON.parse(
    readFileSync(new URL('fixtures/generated-bungalow.json', import.meta.url), 'utf8'),
  ) as Building;
  building.rules = [
    {
      id: 'workspace-arrival',
      label: 'Workspace arrival',
      enabled: true,
      trigger: { kind: 'room-enter', roomId: 'ground/room-5' },
      conditions: [],
      actions: [
        {
          type: 'set-light',
          objectId: 'ground/room-5/pendant',
          state: { color: '#80bfff', intensity: 1.5 },
        },
      ],
    },
  ];
  let compiled = compileBuilding(building);
  const stops = destinations(compiled),
    bedroom = stops.find((value) => value.kind === 'door' && value.caption === 'Bedroom One')!;
  const target = stops.find(
    (value) => value.kind === 'room' && value.caption === 'Workspace',
  )!.target;
  const doors = new TourDoors(),
    fractions = new Map(compiled.doors.map((door) => [door.id, Number(door.open)]));
  let world = new CharacterWorld(compiled, bedroom.target.position);
  const routeState: {
    current: { compiled: typeof compiled; journey: Journey; doors: SceneCommand[] } | null;
  } = { current: null };
  const trace: string[] = [];
  const change = (commands: SceneCommand[]) => {
    const before = compiled,
      from = world.player;
    const result = applyCommands(compiled.building, {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      expectedRevision: compiled.building.revision,
      commands,
    });
    doors.record(before, from, commands);
    const feet = world.feet;
    world.dispose();
    compiled = compileBuilding(result.building);
    world = new CharacterWorld(compiled, feet);
    trace.push(
      commands
        .map((command) =>
          command.type === 'set-door' ? `${command.doorId}:${command.open}` : command.type,
        )
        .join(','),
    );
  };
  change([{ type: 'set-door', doorId: bedroom.doorId!, open: true }]);
  fractions.set(bedroom.doorId!, 1);
  world.setDoorFraction(bedroom.doorId!, 1);
  let roomId = 'ground/room-2',
    arrived = false;
  try {
    for (let frame = 0; frame < 2400; frame++) {
      for (const door of compiled.doors) {
        const fraction = MathUtils.damp(fractions.get(door.id)!, Number(door.open), 9, 1 / 60);
        if (!world.doorBlocked(door.id, fraction)) fractions.set(door.id, fraction);
        world.setDoorFraction(door.id, fractions.get(door.id)!);
      }
      const room = compiled.building.floors[0]!.rooms.find((value) =>
        contains(value.footprint, world.feet),
      );
      if (room?.id !== roomId) {
        roomId = room?.id ?? '';
        if (roomId === 'ground/room-5') {
          change([{ type: 'emit-event', event: { kind: 'room-enter', roomId } }]);
          continue;
        }
      }
      const closures = doors.closures(world, true);
      if (closures.length) {
        change(closures);
        continue;
      }
      if (routeState.current?.compiled !== compiled) {
        const plan = doorRoute(compiled, world.player, target);
        expect(plan, JSON.stringify({ feet: world.feet, trace })).not.toBeNull();
        if (plan!.commands.length && !plan!.staging) {
          change(plan!.commands);
          continue;
        }
        routeState.current = {
          compiled,
          journey: createJourney(smoothRoute(compiled, plan!.path.points)),
          doors: plan!.staging ? plan!.commands : [],
        };
      }
      const status = stepJourney(world, routeState.current!.journey, 1 / 60);
      if (status === 'arrived') {
        if (routeState.current!.doors.length) {
          change(routeState.current!.doors);
          routeState.current = null;
        } else {
          arrived = true;
          break;
        }
      }
      expect(
        status,
        JSON.stringify({
          feet: world.feet,
          next: routeState.current?.journey.points[routeState.current!.journey.index],
          trace,
        }),
      ).not.toBe('blocked');
    }
    expect(
      arrived,
      JSON.stringify({
        feet: world.feet,
        next: routeState.current?.journey.points[routeState.current!.journey.index],
        trace,
      }),
    ).toBe(true);
    expect(
      compiled.building.objects.find((object) => object.id === 'ground/room-5/pendant')!
        .behaviours[0]!.state,
    ).toMatchObject({ color: '#80bfff', intensity: 1.5 });
  } finally {
    world.dispose();
  }
}, 30000);

it('stops a physically blocked journey rather than counting contact jitter as progress', () => {
  const building = JSON.parse(
    readFileSync(new URL('fixtures/generated-bungalow.json', import.meta.url), 'utf8'),
  ) as Building;
  const world = new CharacterWorld(compileBuilding(building), { x: 6.8, y: 0, z: 7 });
  try {
    const journey = createJourney([{ x: 5.5, y: 0, z: 7 }]);
    let status = 'moving';
    for (let frame = 0; frame < 600 && status === 'moving'; frame++)
      status = stepJourney(world, journey, 1 / 60);
    expect(status).toBe('blocked');
    expect(world.feet.x).toBeGreaterThan(6.1);
  } finally {
    world.dispose();
  }
});
