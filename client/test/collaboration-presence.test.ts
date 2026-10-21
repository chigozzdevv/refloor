import { describe, expect, it } from 'vitest';
import type { SharedPresence } from '@refloor/scene/collaboration';
import {
  activePresence,
  presenceCardPosition,
  presenceGroups,
} from '@/shared/collaboration/presence';

const peer = (id: string, phase: SharedPresence['phase'] = 'idle'): SharedPresence => ({
  clientId: id,
  member: { id, name: id, color: '#8ec5ff', role: 'editor' },
  selection: { kind: 'object', id: 'tv' },
  draft: phase === 'idle' ? '' : 'Turn on',
  phase,
  player: null,
  floorId: 'ground',
});
describe('collaborator activity', () => {
  it('groups people selecting one item into one marker and deduplicates their tabs', () => {
    const group = presenceGroups([
      peer('Ada'),
      peer('Bola'),
      { ...peer('Ada', 'applying'), clientId: 'second-tab' },
    ]);
    expect(group).toHaveLength(1);
    expect(group[0]!.peers.map((value) => value.member.id)).toEqual(['Ada', 'Bola']);
    expect(group[0]!.peers[0]!.phase).toBe('applying');
  });
  it('keeps whole-house typing and applying activity available even without a spatial marker', () => {
    const whole = { ...peer('Ada', 'typing'), selection: { kind: 'house' as const, id: 'house' } };
    expect(presenceGroups([whole])).toEqual([]);
    expect(
      activePresence([whole, peer('Bola', 'applying'), peer('Idle')]).map(
        (value) => value.member.name,
      ),
    ).toEqual(['Bola', 'Ada']);
  });
  it('keeps card bounds inside narrow and desktop viewports at every edge', () => {
    for (const viewport of [
      { width: 319, height: 608 },
      { width: 1280, height: 720 },
    ]) {
      const card = { width: 202, height: 210 };
      for (const anchor of [
        { x: 0, y: 0 },
        { x: viewport.width, y: viewport.height },
        { x: viewport.width / 2, y: viewport.height / 2 },
      ]) {
        const position = presenceCardPosition(anchor, viewport, card);
        expect(position.x).toBeGreaterThanOrEqual(12);
        expect(position.x + card.width).toBeLessThanOrEqual(viewport.width - 12);
        expect(position.y).toBeGreaterThanOrEqual(80);
        expect(position.y + card.height).toBeLessThanOrEqual(viewport.height - 16);
      }
    }
  });
});
