import { afterEach, describe, expect, it } from 'vitest';
import { chatDraftKey, useChatDrafts } from '@/shared/editor/chat-drafts';

afterEach(() => useChatDrafts.setState({ drafts: {} }));

describe('unfinished chat messages', () => {
  it('keeps each house, item and wall side independent', () => {
    const target = { kind: 'wall', id: 'wall' } as const;
    const keys = [
      chatDraftKey('one', target),
      chatDraftKey('two', target),
      chatDraftKey('one', { ...target, side: 'exterior' }),
      chatDraftKey('one', { kind: 'object', id: 'wall' }),
    ];
    keys.forEach((key, index) => useChatDrafts.getState().set(key, `Draft ${index}`));
    expect(keys.map((key) => useChatDrafts.getState().drafts[key])).toEqual([
      'Draft 0',
      'Draft 1',
      'Draft 2',
      'Draft 3',
    ]);
    useChatDrafts.getState().set(keys[0]!, '');
    expect(useChatDrafts.getState().drafts[keys[0]!]).toBeUndefined();
    expect(useChatDrafts.getState().drafts[keys[1]!]).toBe('Draft 1');
  });
});
