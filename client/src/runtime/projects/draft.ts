import { parseProjectFile } from '@/runtime/projects/files';

export const draftKey = 'refloor.browser-draft.v1';
export function restoreDraft() {
  try {
    const raw = localStorage.getItem(draftKey);
    if (!raw) return { compiled: null, recovery: null, error: null };
    try {
      return { compiled: parseProjectFile(raw), recovery: null, error: null };
    } catch {
      return {
        compiled: null,
        recovery: raw,
        error:
          'The saved draft could not open. Download its recovery copy before enabling local saving.',
      };
    }
  } catch {
    return {
      compiled: null,
      recovery: null,
      error: 'Browser storage is unavailable. Export your space to keep your changes.',
    };
  }
}
