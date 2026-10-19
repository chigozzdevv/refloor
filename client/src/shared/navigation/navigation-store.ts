import { create } from 'zustand';
import type { NavigationPoint, Point3 } from '@refloor/engine';
import type { Destination } from '@/shared/navigation/destinations';

export type PortalPin = { destination: Destination; x: number; y: number; angle: number };
type TourContext = {
  location: string;
  player: NavigationPoint;
  heading: number;
  edgePortals: PortalPin[];
};

export type TravelRequest = {
  id: string;
  target: NavigationPoint;
  lookAt?: Point3;
  label: string;
};
type NavigationState = {
  request: TravelRequest | null;
  location: string;
  player: NavigationPoint | null;
  heading: number;
  edgePortals: PortalPin[];
  mapOpen: boolean;
  setMapOpen: (open: boolean) => void;
  setContext: (context: TourContext) => void;
  overview: number;
  resetOverview: () => void;
  go: (target: NavigationPoint, lookAt?: Point3, label?: string) => void;
  stop: () => void;
};

export const useNavigation = create<NavigationState>((set) => ({
  request: null,
  location: '',
  player: null,
  heading: 0,
  edgePortals: [],
  mapOpen: false,
  setMapOpen: (mapOpen) => set({ mapOpen }),
  setContext: (context) =>
    set((state) =>
      state.location === context.location &&
      state.player?.floorId === context.player.floorId &&
      state.player?.position.x === context.player.position.x &&
      state.player?.position.y === context.player.position.y &&
      state.player?.position.z === context.player.position.z &&
      state.heading === context.heading &&
      state.edgePortals.length === context.edgePortals.length &&
      state.edgePortals.every(
        (pin, index) =>
          pin.destination === context.edgePortals[index]?.destination &&
          pin.x === context.edgePortals[index]?.x &&
          pin.y === context.edgePortals[index]?.y &&
          pin.angle === context.edgePortals[index]?.angle,
      )
        ? state
        : context,
    ),
  overview: 0,
  resetOverview: () => set((state) => ({ overview: state.overview + 1, request: null })),
  go: (target, lookAt, label = 'Moving') =>
    set({
      request: {
        id: crypto.randomUUID(),
        target,
        label,
        ...(lookAt ? { lookAt } : {}),
      },
    }),
  stop: () => set({ request: null }),
}));
