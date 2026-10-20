import type { Building, SceneCommand } from '@refloor/scene';
import { lightTuning } from '@refloor/catalogue/tuning';

export function cinemaCommands(building: Building, targetId: string): SceneCommand[] {
  const television = building.objects.find(
      (object) =>
        object.id === targetId &&
        object.behaviours.some((behaviour) => behaviour.kind === 'television'),
    ),
    roomId = television?.roomId ?? targetId,
    room = building.floors.flatMap((floor) => floor.rooms).find((room) => room.id === roomId);
  if (
    !room ||
    !building.objects.some(
      (object) =>
        object.roomId === roomId &&
        object.behaviours.some((behaviour) => behaviour.kind === 'television'),
    )
  )
    throw new Error('Choose a room with a television for cinema lighting.');
  const lights = building.objects.filter(
    (object) =>
      object.roomId === roomId &&
      object.placement !== 'exterior' &&
      object.behaviours.some((behaviour) => behaviour.kind === 'light'),
  );
  if (!lights.length) throw new Error('This room has no controllable lights.');
  return lights.map((object) => ({
    type: 'set-light',
    objectId: object.id,
    state:
      object.position.y >= 2
        ? { powered: false }
        : { powered: true, intensity: lightTuning(object)!.normal * 0.2, color: '#ffd2a2' },
  }));
}
