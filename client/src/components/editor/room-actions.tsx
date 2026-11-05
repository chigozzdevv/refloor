import { Plus } from 'lucide-react';
import { useProject } from '@/shared/scene/scene-store';
import { useCollaboration } from '@/shared/collaboration/store';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { currentRoom } from '@/shared/navigation/current-room';

export function RoomActions({ add }: { add: () => void }) {
  const { compiled, selection, interacting } = useProject();
  const { player, request, mapOpen } = useNavigation();
  const readonly = useCollaboration(
    (state) =>
      state.status !== 'idle' && (state.status !== 'live' || state.state?.self.role === 'viewer'),
  );
  const room = currentRoom(compiled, player);
  if (!room || request || mapOpen || selection || interacting) return null;
  return (
    <div className="room-context" aria-label="Current room">
      <span>{room.name}</span>
      {!readonly && (
        <button aria-label={`Add furniture to ${room.name}`} onClick={add}>
          <Plus size={15} />
          Add
        </button>
      )}
    </div>
  );
}
