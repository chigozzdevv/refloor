import { useProject } from '@/shared/scene/scene-store';
import { entryPose } from '@/shared/navigation/entry';

export function activateDoor(id: string, open: boolean) {
  const state = useProject.getState();
  if (!state.setDoor(id, open)) return;
  if (open && state.mode === 'entry' && id === entryPose(state.compiled).doorId)
    state.setMode('walk');
}
