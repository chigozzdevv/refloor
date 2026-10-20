import { create } from 'zustand';

export const useCapture = create<{
  pending: boolean;
  capturing: boolean;
  request: () => void;
}>((set, get) => ({
  pending: false,
  capturing: false,
  request: () => {
    if (!get().pending && !get().capturing) set({ pending: true });
  },
}));
