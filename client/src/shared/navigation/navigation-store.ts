import { create } from 'zustand';
import type { NavigationPoint, Point3 } from '@refloor/engine';

type NavigationState = {
  request: { id: string; target: NavigationPoint; lookAt?: Point3; label: string } | null;
  location: string;
  nextStop: Point3 | null;
  lookRequest: Point3 | null;
  setContext: (location: string, nextStop: Point3 | null) => void;
  look: () => void;
  finishLook: () => void;
  overview: number;
  resetOverview: () => void;
  go: (target: NavigationPoint, lookAt?: Point3, label?: string) => void;
  stop: () => void;
};

export const useNavigation = create<NavigationState>((set) => ({
  request: null,
  location: '',
  nextStop: null,
  lookRequest: null,
  setContext: (location, nextStop) =>
    set((state) =>
      state.location === location &&
      state.nextStop?.x === nextStop?.x &&
      state.nextStop?.y === nextStop?.y &&
      state.nextStop?.z === nextStop?.z
        ? state
        : { location, nextStop },
    ),
  look: () => set((state) => ({ request: null, lookRequest: state.nextStop })),
  finishLook: () => set({ lookRequest: null }),
  overview: 0,
  resetOverview: () =>
    set((state) => ({ overview: state.overview + 1, request: null, lookRequest: null })),
  go: (target, lookAt, label = 'Moving') =>
    set({
      lookRequest: null,
      request: { id: crypto.randomUUID(), target, label, ...(lookAt ? { lookAt } : {}) },
    }),
  stop: () => set({ request: null, lookRequest: null }),
}));
