import { create } from 'zustand';
import type { ChatTarget } from '@refloor/scene/chat';

export function chatDraftKey(buildingId: string, target: ChatTarget) {
  return JSON.stringify([buildingId, target.kind, target.id, target.side ?? null]);
}

export const useChatDrafts = create<{
  drafts: Record<string, string>;
  set: (key: string, text: string) => void;
}>((set) => ({
  drafts: {},
  set: (key, text) =>
    set((state) => {
      const drafts = { ...state.drafts };
      if (text) drafts[key] = text;
      else delete drafts[key];
      return { drafts };
    }),
}));
