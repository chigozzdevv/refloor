export const apiOrigin = (import.meta.env.VITE_REFLOOR_API_URL ?? '').replace(/\/$/, '');

if (apiOrigin) {
  const url = new URL(apiOrigin);
  if (url.origin !== apiOrigin || !['http:', 'https:'].includes(url.protocol))
    throw new Error('VITE_REFLOOR_API_URL must be an HTTP(S) origin.');
  if (import.meta.env.PROD && url.protocol !== 'https:')
    throw new Error('The production API must use HTTPS.');
}

const storageKey = `refloor:api-session:${apiOrigin}`;
let currentToken: string | null = null;

export function apiSessionToken(): string | null {
  if (!apiOrigin) return null;
  try {
    currentToken = localStorage.getItem(storageKey) ?? currentToken;
  } catch {
    // The current visit still works when browser storage is unavailable.
  }
  return currentToken && /^[a-f0-9]{64}$/.test(currentToken) ? currentToken : null;
}

export function rememberApiSession(token: string) {
  currentToken = token;
  try {
    localStorage.setItem(storageKey, token);
  } catch {
    // Keep the session in memory for this visit.
  }
}
