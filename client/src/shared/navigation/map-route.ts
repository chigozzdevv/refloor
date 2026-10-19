import type { CompiledBuilding, NavigationPoint } from '@refloor/engine';
import { destinations, destinationRoute } from '@/shared/navigation/destinations';

export function mapDestination(compiled: CompiledBuilding, from: NavigationPoint, roomId: string) {
  return destinations(compiled).find(
    (destination) =>
      destination.kind === 'room' &&
      destination.roomId === roomId &&
      destinationRoute(compiled, from, destination.target, 'openable'),
  );
}
