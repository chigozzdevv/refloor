import { create } from 'zustand';
import { useProject } from '@/shared/scene/scene-store';
import { restoreGeneration } from '@/shared/refloor/progress';
import { requestSceneView, flushSceneView } from '@/shared/scene/view';

export type ExperienceStage = 'prompt' | 'reveal' | 'approach' | 'ready';
export function initialExperience(saved: boolean, generating: boolean): ExperienceStage {
  return generating || !saved ? 'prompt' : 'ready';
}
export const useExperience = create<{
  stage: ExperienceStage;
  fastForward: boolean;
  skip: () => void;
  compose: () => void;
  resume: () => void;
  reveal: () => void;
  approach: () => void;
  finish: () => void;
}>((set) => ({
  stage: initialExperience(useProject.getState().saved, restoreGeneration() !== null),
  fastForward: false,
  skip: () => set({ fastForward: true }),
  compose: () => {
    flushSceneView();
    set({ stage: 'prompt', fastForward: false });
  },
  resume: () => {
    const view = requestSceneView(useProject.getState().compiled);
    if (view)
      useProject.setState({
        mode: view.mode,
        floorId: view.floorId,
        lighting: view.lighting,
        cutaway: view.cutaway,
        selection: null,
        focusRequest: null,
      });
    set({ stage: 'ready', fastForward: false });
  },
  reveal: () => set({ stage: 'reveal', fastForward: false }),
  approach: () => set({ stage: 'approach' }),
  finish: () => set({ stage: 'ready' }),
}));
