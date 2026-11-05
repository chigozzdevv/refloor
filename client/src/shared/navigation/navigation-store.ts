import { create } from 'zustand';
import type { NavigationPoint, Point3 } from '@refloor/engine';
import type { PortalCue } from '@/shared/navigation/portals';

type TourContext = {
  location: string;
  player: NavigationPoint;
  heading: number;
  portals: PortalCue[];
};

export type TravelRequest = {
  id: string;
  target: NavigationPoint;
  lookAt?: Point3;
  label: string;
  doorId?: string;
};
type NavigationState = {
  request: TravelRequest | null;
  location: string;
  player: NavigationPoint | null;
  heading: number;
  portals: PortalCue[];
  mapOpen: boolean;
  panelOpen: boolean;
  setMapOpen: (open: boolean) => void;
  setContext: (context: TourContext) => void;
  overview: number;
  resetOverview: () => void;
  go: (target: NavigationPoint, lookAt?: Point3, label?: string, doorId?: string) => void;
  stop: () => void;
};

export const useNavigation = create<NavigationState>((set) => ({
  request: null,
  location: '',
  player: null,
  heading: 0,
  portals: [],
  mapOpen: false,
  panelOpen: false,
  setMapOpen: (mapOpen) => set({ mapOpen }),
  setContext: (context) =>
    set((state) =>
      state.location === context.location &&
      state.player?.floorId === context.player.floorId &&
      state.player?.position.x === context.player.position.x &&
      state.player?.position.y === context.player.position.y &&
      state.player?.position.z === context.player.position.z &&
      state.heading === context.heading &&
      state.portals.length === context.portals.length &&
      state.portals.every(
        (pin, index) =>
          pin.destination === context.portals[index]?.destination &&
          pin.label === context.portals[index]?.label,
      )
        ? state
        : context,
    ),
  overview: 0,
  resetOverview: () => set((state) => ({ overview: state.overview + 1, request: null })),
  go: (target, lookAt, label = 'Moving', doorId) =>
    set({
      request: {
        id: crypto.randomUUID(),
        target,
        label,
        ...(doorId ? { doorId } : {}),
        ...(lookAt ? { lookAt } : {}),
      },
    }),
  stop: () => set({ request: null }),
}));
