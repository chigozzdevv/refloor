import type { Building, Floor, Wall, Room } from '@refloor/scene';
import { finishes, finish } from '@refloor/catalogue/materials';
import type { HouseRequirements } from '@refloor/server/shared/planning/requirements';
import type { HouseLayout } from '@refloor/server/shared/planning/solver';
import { solveLayout } from '@refloor/server/shared/planning/solver';
import { validateRequirements } from '@refloor/server/shared/planning/requirements';
import { furnishLayout } from '@refloor/server/shared/planning/placement';
import { validateBuildingAssets } from '@refloor/catalogue/validation';
import { validateFurnishedHouse } from '@refloor/server/shared/planning/decor';
import { furnishExterior } from '@refloor/catalogue/houses/exterior';
import { roomWindows } from '@refloor/server/shared/planning/windows';
import { validateFixtureOpenings } from '@refloor/server/shared/planning/fixture-clearance';

export async function generateLayout(
  id: string,
  input: unknown,
  progress?: (stage: 'layout' | 'validating') => void,
) {
  const requirements = validateRequirements(input);
  progress?.('layout');
  const layout = await solveLayout(requirements);
  const building = assembleHouse(id, requirements, layout);
  furnishLayout(building, requirements, layout);
  furnishExterior(building);
  progress?.('validating');
  validateBuildingAssets(building);
  const validated = validateFurnishedHouse(building);
  validateFixtureOpenings(validated);
  return validated;
}

export function assembleHouse(
  id: string,
  requirements: HouseRequirements,
  layout: HouseLayout,
): Building {
  const { width, depth, hallX, hallWidth } = layout;
  const design = requirements.design;
  const building: Building = {
    id,
    name: requirements.name,
    schemaVersion: 1,
    units: 'metres',
    revision: 0,
    floors: [],
    stairs: [],
    objects: [],
    roof: {
      id: 'roof',
      kind: requirements.roof,
      pitch: requirements.roof === 'gable' ? Math.PI / 8 : 0,
      overhang: 0.24,
      material: structuredClone(
        design
          ? {
              ...finishes[design.roof.finish === 'metal' ? 'metalRoof' : 'asphalt'],
              color: design.roof.color,
            }
          : requirements.roof === 'gable'
            ? finishes.metalRoof
            : finishes.asphalt,
      ),
    },
  };
  for (let level = 0; level < requirements.storeys; level++) {
    const floorId = level === 0 ? 'ground' : 'first';
    const wall = (name: string, x: number, z: number, endX: number, endZ: number): Wall => ({
      id: `${floorId}/${name}`,
      start: { x, z },
      end: { x: endX, z: endZ },
      height: 2.8,
      thickness: 0.16,
      material: finish(requirements.wallColor, 'plaster', 0.9),
      openings: [],
    });
    const west = wall('west', 0, 0, 0, depth),
      east = wall('east', width, 0, width, depth),
      south = wall('south', 0, 0, width, 0),
      north = wall('north', 0, depth, width, depth);
    if (design)
      for (const exterior of [west, east, south, north])
        exterior.exteriorMaterial =
          design.exterior.finish === 'plaster'
            ? finish(design.exterior.color, 'plaster', 0.9)
            : { ...finishes[design.exterior.finish], color: design.exterior.color };
    if (level === 0)
      south.openings.push({
        id: `${floorId}/entrance`,
        kind: 'door',
        offset:
          layout.family === 'living-hub' ? hallX + hallWidth / 2 - 0.55 : hallX + hallWidth - 1.4,
        width: 1.1,
        height: 2.25,
        hinge: 'end',
        swing: 'inward',
        state: { open: false },
        material: structuredClone(finishes[design?.joinery ?? 'oak']),
      });
    const flooring =
      requirements.flooring === 'tile'
        ? finish('#d3cfc7', null, 0.55)
        : structuredClone(finishes[requirements.flooring]);
    const floor: Floor = {
      id: floorId,
      name: level === 0 ? 'Ground floor' : 'First floor',
      elevation: level * 3,
      height: 2.8,
      slabThickness: 0.2,
      footprint: { x: 0, z: 0, width, depth },
      walls: [west, east, south, north],
      voids: [],
      rooms: [],
    };
    const sides: Wall[] = [];
    for (const side of [0, 1]) {
      const boundary = hallX + side * hallWidth;
      const rooms = layout.rooms
        .filter((room) => room.requirement.floor === level && room.side === side)
        .sort((a, b) => a.footprint.z - b.footprint.z);
      if (!rooms.length) continue;
      const partition = wall(`hall-${side}`, boundary, 0, boundary, depth);
      sides.push(partition);
      floor.walls.push(partition);
      for (const planned of rooms) {
        const fp = planned.footprint,
          roomId = `${floorId}/room-${planned.index}`;
        const opening = {
          id: `${roomId}/door`,
          kind: 'door' as const,
          offset: fp.z + 0.35,
          width: 1,
          height: 2.2,
          hinge: 'start' as const,
          swing: side === 0 ? ('inward' as const) : ('outward' as const),
          state: { open: false },
          material: structuredClone(finishes[design?.joinery ?? 'oak']),
        };
        partition.openings.push(opening);
        const outer = side === 0 ? west : east;
        for (const [index, window] of roomWindows(planned.requirement, fp, design).entries())
          outer.openings.push({
            id: `${roomId}/window${index === 0 ? '' : `-${index + 1}`}`,
            kind: 'window',
            ...window,
            material: structuredClone(finishes.glass),
          });
        const walls = [partition, outer];
        if (fp.z === 0) walls.push(south);
        else {
          const divider = wall(`divider-${planned.index}`, fp.x, fp.z, fp.x + fp.width, fp.z);
          floor.walls.push(divider);
          walls.push(divider);
        }
        if (Math.abs(fp.z + fp.depth - depth) < 1e-6) walls.push(north);
        const room: Room = {
          id: roomId,
          name: planned.requirement.name,
          kind: planned.requirement.uses[0] ?? 'other',
          uses: planned.requirement.uses,
          footprint: fp,
          wallIds: walls.map((item) => item.id),
          floorMaterial: structuredClone(flooring),
        };
        floor.rooms.push(room);
      }
    }
    const hub =
      layout.family === 'living-hub' ? layout.rooms.find((room) => room.side === -1) : undefined;
    floor.rooms.push({
      id: hub ? `${floorId}/room-${hub.index}` : `${floorId}/hall`,
      name: hub?.requirement.name ?? (level === 0 ? 'Entrance hall' : 'Landing'),
      kind: hub ? 'living' : 'corridor',
      ...(hub ? { uses: hub.requirement.uses } : {}),
      footprint: { x: hallX, z: 0, width: hallWidth, depth },
      wallIds: [
        south,
        north,
        ...sides,
        ...(hallX === 0 ? [west] : []),
        ...(Math.abs(hallX + hallWidth - width) < 1e-6 ? [east] : []),
      ].map((item) => item.id),
      floorMaterial: structuredClone(flooring),
    });
    north.openings.push({
      id: `${floorId}/hall-window`,
      kind: 'window',
      offset: hallX + 0.2,
      width: hub ? Math.min(2.8, hallWidth - 0.4) : Math.min(1.6, hallWidth - 0.4),
      height: 1.5,
      sill: 0.85,
      material: structuredClone(finishes.glass),
    });
    if (hub) {
      for (const fraction of [0.2, 0.8])
        south.openings.push({
          id: `${floorId}/parlor-window-${fraction}`,
          kind: 'window',
          offset: hallX + hallWidth * fraction - 0.9,
          width: 1.8,
          height: 1.7,
          sill: 0.75,
          material: structuredClone(finishes.glass),
        });
    }
    if (layout.family === 'side-gallery') {
      const outer = hallX === 0 ? west : east;
      for (let z = 1.2; z + 1.6 < depth - 0.6; z += 3.2)
        outer.openings.push({
          id: `${floorId}/gallery-window-${outer.openings.length}`,
          kind: 'window',
          offset: z,
          width: 1.6,
          height: 1.5,
          sill: 0.85,
          material: structuredClone(finishes.glass),
        });
    }
    for (const room of floor.rooms) {
      for (const other of floor.walls) {
        const fp = room.footprint;
        if (
          other.start.z === other.end.z &&
          Math.abs(other.start.z - fp.z - fp.depth) < 1e-6 &&
          other.start.x >= fp.x &&
          other.end.x <= fp.x + fp.width &&
          !room.wallIds.includes(other.id)
        )
          room.wallIds.push(other.id);
      }
    }
    building.floors.push(floor);
  }
  if (requirements.storeys === 2) {
    const rear = layout.stairPosition === 'rear';
    const footprint = {
      x: hallX + (hallWidth - 2.4) / 2,
      z: rear ? depth - 5.6 : 1.6,
      width: 2.4,
      depth: 4,
    };
    building.floors[1]!.voids.push({ id: 'stairwell', kind: 'stairwell', footprint });
    building.stairs.push({
      id: 'staircase',
      kind: 'u-shaped',
      lowerFloorId: 'ground',
      upperFloorId: 'first',
      openingId: 'stairwell',
      footprint,
      heading: rear ? 0 : Math.PI,
      flightWidth: 1,
      landingDepth: 1.1,
      treadDepth: 0.28,
      risers: 18,
      material: structuredClone(finishes[design?.joinery ?? 'oak']),
    });
  }
  return building;
}
