import { describe, expect, it } from 'vitest';
import type { SharedActivity } from '@refloor/scene/collaboration';
import { mergeActivity } from '@/shared/collaboration/history';
const event = (
  id: string,
  version: number,
  kind: SharedActivity['kind'] = 'edit',
  originalId?: string,
): SharedActivity => ({
  id,
  version,
  kind,
  ...(originalId ? { originalId } : {}),
  at: new Date(0).toISOString(),
  author: { id: 'owner', name: 'Owner', role: 'owner', color: '#8ec5ff' },
  source: 'manual',
  label: 'Change finish',
  revertedBy: null,
  undoable: true,
});
describe('paginated shared history', () => {
  it('marks an older loaded edit as rolled back when it is outside the latest page', () => {
    const result = mergeActivity([event('old', 1)], [event('undo', 150, 'rollback', 'old')]);
    expect(result[0]!.revertedBy).toBe('undo');
  });
  it('shows the latest restore state without dropping another author’s edit', () => {
    const result = mergeActivity(
      [event('old', 1), event('other', 90)],
      [event('undo', 150, 'rollback', 'old'), event('restore', 151, 'restore', 'old')],
    );
    expect(result[0]!.revertedBy).toBeNull();
    expect(result[0]!.lastHistoryAction).toMatchObject({
      id: 'restore',
      kind: 'restore',
      author: { name: 'Owner' },
    });
    expect(result.map((value) => value.id)).toContain('other');
  });
  it('does not replace a paginated edit’s current attribution with an older history event', () => {
    const original = {
      ...event('old', 1),
      lastHistoryAction: {
        id: 'new',
        version: 200,
        kind: 'restore' as const,
        author: event('new', 200).author,
        at: new Date(0).toISOString(),
      },
    };
    const result = mergeActivity([original], [event('undo', 150, 'rollback', 'old')]);
    expect(result[0]!.revertedBy).toBeNull();
    expect(result[0]!.lastHistoryAction?.id).toBe('new');
  });
});
