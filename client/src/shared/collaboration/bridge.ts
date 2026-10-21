import type { Building, SceneCommand } from '@refloor/scene';
import type { NavigationPoint } from '@refloor/engine';
import type { EditDetails } from '@/shared/editor/history';
export type SharedBridge = {
  assertEdit: (commands: SceneCommand[], details?: EditDetails) => void;
  enqueue: (
    before: Building,
    commands: SceneCommand[],
    id: string,
    at: string,
    player: NavigationPoint | undefined,
    details?: EditDetails,
  ) => void;
  wait: (id: string) => Promise<void>;
  flush: () => Promise<boolean>;
  rollback: (id?: string, restore?: boolean) => void;
  canSwing: (id: string, open: boolean) => boolean;
};
export const collaborationBridge: { current: SharedBridge | null; preparing: boolean } = {
  current: null,
  preparing: false,
};
