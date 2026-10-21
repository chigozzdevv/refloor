import { create } from 'zustand';
import type { SharedState, SharedPresence } from '@refloor/scene/collaboration';
import type { EditTarget } from '@refloor/scene/edit-memory';
export const useCollaboration = create<{
  state: SharedState | null;
  status: 'idle' | 'connecting' | 'live' | 'offline' | 'denied';
  peers: SharedPresence[];
  pending: number;
  error: string | null;
  draft: { target: EditTarget; text: string } | null;
}>(() => ({ state: null, status: 'idle', peers: [], pending: 0, error: null, draft: null }));
export const collaborationClientId = crypto.randomUUID();
