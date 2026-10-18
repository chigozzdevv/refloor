import { Volume2, VolumeX } from 'lucide-react';
import type { SceneObject } from '@refloor/scene';
import { useProject } from '@/shared/scene/scene-store';
import { mediaPlayers, playMedia } from '@/shared/behaviours/television';

export function EnableSound({ object }: { object: SceneObject }) {
  const edit = useProject((state) => state.edit);
  const tv = object.behaviours.find((value) => value.kind === 'television');
  if (!tv) return null;
  return (
    <button
      className="tool-button"
      disabled={!tv.state.powered}
      onClick={() => {
        const video = mediaPlayers.get(object.id);
        if (video) {
          video.muted = !tv.state.muted;
          playMedia(object.id);
        }
        const accepted = edit([
          { type: 'set-television', objectId: object.id, state: { muted: !tv.state.muted } },
        ]);
        if (!accepted && video) video.muted = tv.state.muted;
      }}
    >
      {tv.state.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}{' '}
      {tv.state.muted ? 'Unmute' : 'Mute'}
    </button>
  );
}
