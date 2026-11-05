import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { compileBuilding } from '@refloor/engine';
import { ActionEvents } from '@/components/scene/action-events';
import { dispatchSceneEvent } from '@/shared/behaviours/events';
import { physicsSession } from '@/shared/navigation/physics-session';
import type { CharacterWorld } from '@/shared/navigation/physics-world';
import { useProject } from '@/shared/scene/scene-store';
import { useExperience } from '@/shared/scene/experience-store';
import { viewSession } from '@/shared/scene/view';

const frame = vi.hoisted(() => ({ tick: () => {} }));
vi.mock('@react-three/fiber', () => ({
  useFrame: (callback: () => void) => {
    frame.tick = callback;
  },
}));
vi.mock('@/shared/behaviours/events', () => ({ dispatchSceneEvent: vi.fn(() => true) }));

const project = useProject.getState();
const experience = useExperience.getState();
const applied = viewSession.applied;
const compiled = compileBuilding(
  createHouse({ id: 'room-entry-house', name: 'Room entry house', storeys: 1 }),
);
const floor = compiled.building.floors[0]!;
function world(roomIndex = 0) {
  const room = floor.rooms[roomIndex]!;
  return {
    player: {
      floorId: floor.id,
      position: {
        x: room.footprint.x + room.footprint.width / 2,
        y: floor.elevation,
        z: room.footprint.z + room.footprint.depth / 2,
      },
    },
  } as CharacterWorld;
}

beforeEach(() => {
  vi.clearAllMocks();
  useProject.setState({ compiled, mode: 'walk', projectEpoch: project.projectEpoch + 1 });
  useExperience.setState({ stage: 'ready' });
  physicsSession.current = world();
  renderToStaticMarkup(createElement(ActionEvents));
});
afterEach(() => {
  physicsSession.current = null;
  viewSession.applied = applied;
  useProject.setState(project, true);
  useExperience.setState(experience, true);
});

it('does not retrigger room entry while an edit replaces the physics world', () => {
  frame.tick();
  expect(dispatchSceneEvent).toHaveBeenCalledTimes(1);
  physicsSession.current = null;
  frame.tick();
  frame.tick();
  physicsSession.current = world();
  frame.tick();
  expect(dispatchSceneEvent).toHaveBeenCalledTimes(1);
});

it('fires again when the player moves to another room and returns', () => {
  frame.tick();
  physicsSession.current = world(1);
  frame.tick();
  physicsSession.current = world();
  frame.tick();
  expect(vi.mocked(dispatchSceneEvent).mock.calls.map(([event]) => event)).toEqual([
    { kind: 'room-enter', roomId: floor.rooms[0]!.id },
    { kind: 'room-enter', roomId: floor.rooms[1]!.id },
    { kind: 'room-enter', roomId: floor.rooms[0]!.id },
  ]);
});

it('treats the same room in a replacement project as a new entry', () => {
  frame.tick();
  physicsSession.current = null;
  useProject.setState({ projectEpoch: project.projectEpoch + 2 });
  frame.tick();
  physicsSession.current = world();
  frame.tick();
  expect(dispatchSceneEvent).toHaveBeenCalledTimes(2);
});

it('does not fire room entry merely because a saved view was restored', () => {
  viewSession.applied++;
  frame.tick();
  frame.tick();
  expect(dispatchSceneEvent).not.toHaveBeenCalled();
  physicsSession.current = world(1);
  frame.tick();
  expect(dispatchSceneEvent).toHaveBeenCalledExactlyOnceWith({
    kind: 'room-enter',
    roomId: floor.rooms[1]!.id,
  });
});
