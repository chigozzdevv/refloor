import type { SharedPresence } from '@refloor/scene/collaboration';

export const presencePhase = (peer: SharedPresence) =>
  peer.phase === 'applying' ? 'applying' : peer.draft ? 'typing' : 'idle';
const priority = (peer: SharedPresence) =>
  ({ idle: 0, typing: 1, applying: 2 })[presencePhase(peer)];

function uniqueMembers(peers: SharedPresence[]) {
  const members = new Map<string, SharedPresence>();
  for (const peer of peers) {
    const previous = members.get(peer.member.id);
    if (!previous || priority(peer) > priority(previous)) members.set(peer.member.id, peer);
  }
  return [...members.values()].sort(
    (a, b) => priority(b) - priority(a) || a.member.name.localeCompare(b.member.name),
  );
}
export function activePresence(peers: SharedPresence[]) {
  return uniqueMembers(peers.filter((peer) => presencePhase(peer) !== 'idle'));
}
export function presenceGroups(peers: SharedPresence[]) {
  const groups = new Map<string, SharedPresence[]>();
  for (const peer of peers) {
    if (!peer.selection || peer.selection.kind === 'house') continue;
    const key = `${peer.selection.kind}:${peer.selection.id}:${peer.selection.side ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), peer]);
  }
  return [...groups].map(([key, members]) => ({ key, peers: uniqueMembers(members) }));
}
export function presenceCardPosition(
  anchor: { x: number; y: number },
  viewport: { width: number; height: number },
  card: { width: number; height: number },
) {
  const side = anchor.x + card.width + 8 > viewport.width - 12 ? 'left' : 'right';
  const x = Math.max(
    12,
    Math.min(
      viewport.width - card.width - 12,
      side === 'left' ? anchor.x - card.width - 8 : anchor.x + 8,
    ),
  );
  const y = Math.max(80, Math.min(viewport.height - card.height - 16, anchor.y));
  return { x, y, side };
}
