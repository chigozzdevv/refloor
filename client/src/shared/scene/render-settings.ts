import { create } from 'zustand';
import { renderBudget } from '@/shared/scene/render-budget';

export const useRenderSettings = create(() =>
  renderBudget({
    width: 1440,
    height: 900,
    devicePixelRatio: 1,
    maxSamples: 4,
    maxTextureSize: 4096,
    quality: 'high',
    reduction: 0,
  }),
);
