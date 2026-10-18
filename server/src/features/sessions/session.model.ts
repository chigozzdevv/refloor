export type SessionRecord = { _id: string; createdAt: Date; expiresAt: Date };
export const sessionCookie = 'refloor_session';
export const sessionLifetime = 30 * 24 * 60 * 60;
