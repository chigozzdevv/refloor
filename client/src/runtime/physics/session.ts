import type { CharacterWorld } from '@/runtime/physics/CharacterWorld';

export const physicsSession: { current: CharacterWorld | null } = { current: null };
