import { useProject } from '@/shared/scene/scene-store';
import { entryPose } from '@/shared/navigation/entry';
import { destinations } from '@/shared/navigation/destinations';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { physicsSession } from '@/shared/navigation/physics-session';
import { contains, rotate } from '@refloor/engine/math';

export function traverseDoor(id: string) {
  const state = useProject.getState();
  if (state.mode === 'entry') {
    state.enterHome();
    return;
  }
  const player = physicsSession.current?.player;
  if (!player) {
    state.notify('The walking controls are still loading.');
    return;
  }
  const floor = state.compiled.building.floors.find((value) => value.id === player.floorId);
  const room = floor?.rooms.find((value) => contains(value.footprint, player.position));
  const door = state.compiled.doors.find((value) => value.id === id);
  const candidates = destinations(state.compiled).filter(
    (value) => value.kind === 'door' && value.doorId === id,
  );
  const destination =
    candidates.find((value) => value.roomId === room?.id) ??
    candidates.find((value) => {
      if (!door || !value.approach) return false;
      const normal = rotate({ x: 0, z: 1 }, door.rotation);
      const side = (point: { x: number; z: number }) =>
        (point.x - door.centre.x) * normal.x + (point.z - door.centre.z) * normal.z;
      return side(value.approach.position) * side(player.position) >= 0;
    });
  if (destination) {
    state.select(null);
    useNavigation.getState().go(destination.target, destination.lookAt, destination.label);
  } else if (id === entryPose(state.compiled).doorId)
    activateDoor(id, !state.compiled.doors.find((door) => door.id === id)?.open);
  else state.notify('Move to this doorway before entering.');
}

export function activateDoor(id: string, open: boolean) {
  const state = useProject.getState();
  if (!state.setDoor(id, open)) return;
  if (open && state.mode === 'entry' && id === entryPose(state.compiled).doorId)
    state.setMode('walk');
}
