const explanations: Record<string, string> = {
  OBJECT_COLLISION: 'That item would overlap another object. Try a little more space.',
  STRUCTURE_COLLISION: 'That item would pass through a wall, window or staircase.',
  DOOR_SWING: 'Leave enough space for the door to open.',
  DOOR_COLLISION: 'These doors would overlap.',
  STAIR_RESERVATION: 'Keep the staircase and its landing clear.',
  STAIR_ACCESS: 'Keep a clear approach to the staircase.',
  STAIR_HEADROOM: 'That item would obstruct the staircase.',
  PLAYER_BLOCKED: 'Move clear of this spot before changing the arrangement.',
  UNREACHABLE_ROOM: 'That arrangement would block access to a room.',
  UNREACHABLE_OBJECT: 'Leave a walking route to every item.',
  UNSUPPORTED_OBJECT: 'Place that item on a supported part of the floor.',
};

export function editingError(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)) {
    const issue: unknown = error.issues[0];
    if (issue && typeof issue === 'object') {
      if ('code' in issue && typeof issue.code === 'string' && explanations[issue.code])
        return explanations[issue.code]!;
      if ('message' in issue && typeof issue.message === 'string') {
        if (issue.message.includes('outside its room'))
          return 'Keep the whole item inside one room. Try a smaller move or rotate it.';
        return issue.message;
      }
    }
  }
  return error instanceof Error ? error.message : 'This change could not be applied.';
}
