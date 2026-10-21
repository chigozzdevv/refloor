import type { EditMemory } from '@refloor/scene/edit-memory';

export function mergeConversation(
  authoritative: EditMemory,
  local: EditMemory,
  memberId: string,
): EditMemory {
  if (authoritative.sceneId !== local.sceneId) return authoritative;
  const turns = new Map(authoritative.turns.map((turn) => [turn.id, turn]));
  for (const turn of local.turns)
    if (
      !turns.has(turn.id) &&
      turn.status !== 'applied' &&
      (!turn.author || turn.author.id === memberId)
    )
      turns.set(turn.id, turn);
  return {
    ...authoritative,
    turns: [...turns.values()]
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id))
      .slice(-80),
  };
}
