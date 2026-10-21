import { describe, expect, it } from 'vitest';
import { createHouse } from '@refloor/catalogue/houses';
import { createEditMemory } from '@refloor/scene/edit-memory';
import type { ChatTurn } from '@refloor/scene/edit-memory';
import { mergeConversation } from '@/shared/collaboration/conversation';

const building = createHouse({ id: 'context-house', name: 'Context house', storeys: 1 });
const turn = (id: string, status: ChatTurn['status'], author = 'owner'): ChatTurn => ({
  id,
  at: new Date(0).toISOString(),
  target: { kind: 'house', id: building.id },
  author: { id: author, name: author },
  message: 'Change it',
  reply: 'Which item?',
  status,
  baseRevision: 0,
  revisionId: status === 'applied' ? id : null,
});

describe('shared conversational context', () => {
  it('retains this person’s clarifications and failures across refreshes without replacing authoritative edits', () => {
    const server = { ...createEditMemory(building), turns: [turn('accepted', 'applied', 'other')] };
    const local = {
      ...createEditMemory(building),
      turns: [
        turn('question', 'clarification'),
        turn('failed', 'rejected'),
        turn('accepted', 'rejected'),
        turn('old', 'applied'),
        turn('foreign', 'clarification', 'other'),
      ],
    };
    const merged = mergeConversation(server, local, 'owner');
    expect(merged.turns.map((item) => item.id).sort()).toEqual(['accepted', 'failed', 'question']);
    expect(merged.turns.find((item) => item.id === 'accepted')?.status).toBe('applied');
    expect(mergeConversation(server, { ...local, sceneId: 'another-house' }, 'owner')).toBe(server);
  });
  it('retains a bounded conversation without duplicates on repeated reconnects', () => {
    const server = createEditMemory(building);
    const local = {
      ...server,
      turns: Array.from({ length: 80 }, (_, index) => ({
        ...turn(String(index), 'clarification'),
        at: new Date(index).toISOString(),
      })),
    };
    server.turns.push({ ...turn('new', 'applied'), at: new Date(100).toISOString() });
    const merged = mergeConversation(server, local, 'owner');
    expect(merged.turns).toHaveLength(80);
    expect(merged.turns.some((item) => item.id === '0')).toBe(false);
    expect(mergeConversation(server, merged, 'owner').turns).toEqual(merged.turns);
  });
});
