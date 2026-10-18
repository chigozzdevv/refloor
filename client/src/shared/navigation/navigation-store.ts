import { create } from 'zustand';
import type { NavigationPoint, Point3 } from '@refloor/engine';

type NavigationState = {
  request: { id: string; target: NavigationPoint; lookAt?: Point3 } | null;
  overview: number;
  resetOverview: () => void;
  go: (target: NavigationPoint, lookAt?: Point3) => void;
  stop: () => void;
};

export const useNavigation = create<NavigationState>((set) => ({
  request: null,
  overview: 0,
  resetOverview: () => set((state) => ({ overview: state.overview + 1, request: null })),
  go: (target, lookAt) =>
    set({ request: { id: crypto.randomUUID(), target, ...(lookAt ? { lookAt } : {}) } }),
  stop: () => set({ request: null }),
}));
