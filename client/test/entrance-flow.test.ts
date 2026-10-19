import { beforeAll, describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding, isPlayerPositionValid, validatePlacement } from '@refloor/engine';
import { entryPose } from '@/shared/navigation/entry';
import { destinations } from '@/shared/navigation/destinations';
import { traverseDoor } from '@/shared/behaviours/door';
import { CharacterWorld, initializePhysics } from '@/shared/navigation/physics-world';
import { physicsSession } from '@/shared/navigation/physics-session';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { useProject } from '@/shared/scene/scene-store';
import { exteriorLayout, housePreviewCamera } from '@/shared/scene/exterior';
import { PerspectiveCamera, Vector3 } from 'three';

beforeAll(initializePhysics);
describe('entrance and doorway flow', () => {
  it('fits the actual house and entrance paving into wide and narrow preview cards', () => {
    for (const storeys of [1, 2] as const)
      for (const dimensions of [
        { width: 11.5, depth: 14 },
        { width: 16, depth: 9.5 },
      ]) {
        const compiled = compileBuilding(
            createHouse({ id: 'preview', name: 'Preview', storeys, ...dimensions }),
          ),
          site = exteriorLayout(compiled);
        for (const aspect of [1, 1.7, 2.7]) {
          const view = housePreviewCamera(compiled, aspect),
            camera = new PerspectiveCamera(45, aspect, 0.1, 200);
          camera.position.copy(view.position);
          camera.lookAt(view.target);
          camera.updateMatrixWorld();
          for (const x of [-1, 1])
            for (const y of [-0.2, site.height])
              for (const z of [-1, 1]) {
                const point = new Vector3(
                  site.centre.x + x * (site.width / 2 + 0.8),
                  y,
                  site.centre.z + z * (site.depth / 2 + 0.8),
                ).project(camera);
                expect(Math.abs(point.x)).toBeLessThan(0.95);
                expect(Math.abs(point.y)).toBeLessThan(0.95);
                expect(point.z).toBeGreaterThan(-1);
                expect(point.z).toBeLessThan(1);
              }
        }
      }
  });
  it('centers the entrance camera on the actual doorway', () => {
    const compiled = compileBuilding(
      createHouse({ id: 'entrance-view', name: 'Entrance view', storeys: 2 }),
    );
    const entry = entryPose(compiled),
      door = compiled.doors.find((value) => value.id === entry.doorId)!;
    expect(entry.target.x).toBe(door.centre.x);
    expect(entry.target.z).toBe(door.centre.z);
    expect(entry.target.y).toBeCloseTo(door.hinge.y + door.height / 2);
  });
  it('uses a clicked interior door as a route through the doorway instead of selecting it', () => {
    const compiled = compileBuilding(
      createHouse({ id: 'door-click', name: 'Door click', storeys: 2 }),
    );
    const stop = destinations(compiled).find(
      (value) => value.kind === 'door' && value.floorId === 'first',
    )!;
    const previous = useProject.getState(),
      world = new CharacterWorld(compiled, stop.approach!.position);
    const previousWorld = physicsSession.current;
    physicsSession.current = world;
    useProject.setState({
      compiled,
      mode: 'walk',
      floorId: 'first',
      selection: { kind: 'door', id: stop.doorId! },
    });
    try {
      traverseDoor(stop.doorId!);
      expect(useProject.getState().selection).toBeNull();
      expect(useNavigation.getState().request?.target).toEqual(stop.target);
    } finally {
      useNavigation.getState().stop();
      useProject.setState(previous, true);
      physicsSession.current = previousWorld;
      world.dispose();
    }
  });
  it('keeps physical paving and validation aligned for edits from the compound', () => {
    const compiled = compileBuilding(
      createHouse({ id: 'compound-edit', name: 'Compound edit', storeys: 1 }),
    );
    const entry = entryPose(compiled),
      outside = { x: entry.outside.x, y: -0.095, z: entry.outside.z };
    const world = new CharacterWorld(compiled, outside);
    try {
      for (let i = 0; i < 90; i++) world.step({ x: 0, z: 0 }, 1 / 60);
      expect(world.feet.y).toBeCloseTo(-0.095, 1);
      expect(isPlayerPositionValid(compiled, world.player)).toBe(true);
      const light = compiled.building.objects.find((object) => object.placement === 'exterior')!;
      expect(() =>
        validatePlacement(
          compiled.building,
          {
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            expectedRevision: 0,
            commands: [{ type: 'set-light', objectId: light.id, state: { powered: true } }],
          },
          {},
          world.player,
        ),
      ).not.toThrow();
    } finally {
      world.dispose();
    }
  });
});
