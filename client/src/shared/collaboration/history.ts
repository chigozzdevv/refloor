import type { SharedActivity } from '@refloor/scene/collaboration';
export function mergeActivity(previous: SharedActivity[], incoming: SharedActivity[]) {
  const events = new Map([...previous, ...incoming].map((event) => [event.id, event]));
  for (const event of [...incoming].sort((a, b) => a.version - b.version)) {
    if (!event.originalId) continue;
    const original = events.get(event.originalId);
    if (original && (original.lastHistoryAction?.version ?? -1) <= event.version)
      events.set(original.id, {
        ...original,
        revertedBy: event.kind === 'rollback' ? event.id : null,
        lastHistoryAction: {
          id: event.id,
          version: event.version,
          kind: event.kind === 'restore' ? 'restore' : 'rollback',
          author: event.author,
          at: event.at,
        },
      });
  }
  return [...events.values()].sort((a, b) => a.version - b.version);
}
