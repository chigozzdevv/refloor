import { eventMatches } from '@refloor/scene';
import type { SceneEvent } from '@refloor/scene';
import { useProject } from '@/shared/scene/scene-store';

export function dispatchSceneEvent(event: SceneEvent) {
  const state = useProject.getState();
  if (
    !state.compiled.building.rules?.some(
      (rule) => rule.enabled && eventMatches(rule.trigger, event),
    )
  )
    return true;
  return state.edit([{ type: 'emit-event', event }], {
    source: 'navigation',
    label: 'Run saved actions',
  });
}
