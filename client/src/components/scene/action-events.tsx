import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { contains } from '@refloor/engine/math';
import { useProject } from '@/shared/scene/scene-store';
import { physicsSession } from '@/shared/navigation/physics-session';
import { dispatchSceneEvent } from '@/shared/behaviours/events';
import { useExperience } from '@/shared/scene/experience-store';
import { viewSession } from '@/shared/scene/view';

export function ActionEvents() {
  const last = useRef('');
  const restored = useRef(viewSession.applied);
  useFrame(() => {
    if (useExperience.getState().stage !== 'ready') return;
    const state = useProject.getState(),
      player = physicsSession.current?.player;
    if (state.mode !== 'walk') {
      last.current = '';
      return;
    }
    if (!player) return;
    const room = state.compiled.building.floors
      .find((floor) => floor.id === player.floorId)
      ?.rooms.find((value) => contains(value.footprint, player.position));
    const key = `${state.projectEpoch}:${room?.id ?? 'outside'}`;
    if (restored.current !== viewSession.applied) {
      restored.current = viewSession.applied;
      last.current = key;
      return;
    }
    if (key === last.current) return;
    last.current = key;
    if (room) dispatchSceneEvent({ kind: 'room-enter', roomId: room.id });
  }, -0.8);
  return null;
}
