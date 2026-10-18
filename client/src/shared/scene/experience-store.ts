import { create } from 'zustand';

export type ExperienceStage = 'prompt' | 'reveal' | 'approach' | 'ready';
export const useExperience = create<{
  stage: ExperienceStage;
  fastForward: boolean;
  skip: () => void;
  compose: () => void;
  reveal: () => void;
  approach: () => void;
  finish: () => void;
}>((set) => ({
  stage: 'prompt',
  fastForward: false,
  skip: () => set({ fastForward: true }),
  compose: () => set({ stage: 'prompt', fastForward: false }),
  reveal: () => set({ stage: 'reveal', fastForward: false }),
  approach: () => set({ stage: 'approach' }),
  finish: () => set({ stage: 'ready' }),
}));
