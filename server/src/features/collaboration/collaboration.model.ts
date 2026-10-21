import type { SharedActivity, SharedMember } from '@refloor/scene/collaboration';
import type { SceneRevision } from '@refloor/scene';
import type { PropertyPatch } from '@refloor/scene/properties';
export type MemberRecord = SharedMember & {
  _id: string;
  projectId: string;
  ownerId: string;
  active: boolean;
};
export type InviteRecord = {
  _id: string;
  projectId: string;
  tokenHash: string;
  role: 'editor' | 'viewer';
  expiresAt: Date;
  revoked: boolean;
  uses?: number;
};
export type ActivityRecord = SharedActivity & {
  _id: string;
  projectId: string;
  ownerId: string;
  requestId: string;
  fingerprint: string;
  revision: SceneRevision;
  patches: PropertyPatch[];
};
export const memberView = ({ id, name, color, role, active }: SharedMember): SharedMember => ({
  id,
  name,
  color,
  role,
  ...(active === undefined ? {} : { active }),
});
export function activityView(record: ActivityRecord): SharedActivity {
  return {
    id: record.id,
    version: record.version,
    at: record.at,
    author: memberView(record.author),
    kind: record.kind,
    source: record.source,
    label: record.label,
    ...(record.target ? { target: record.target } : {}),
    ...(record.message ? { message: record.message } : {}),
    ...(record.reply ? { reply: record.reply } : {}),
    ...(record.originalId ? { originalId: record.originalId } : {}),
    revertedBy: record.revertedBy,
    ...(record.lastHistoryAction !== undefined
      ? { lastHistoryAction: record.lastHistoryAction }
      : {}),
    undoable: record.undoable,
  };
}
