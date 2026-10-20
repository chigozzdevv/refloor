export type SessionRecord = {
  _id: string;
  ownerId?: string;
  createdAt: Date;
  expiresAt: Date;
};
export type RecoveryRecord = { _id: string; keyHash: string; updatedAt: Date };
export const sessionCookie = 'refloor_session';
export const sessionLifetime = 30 * 24 * 60 * 60;
