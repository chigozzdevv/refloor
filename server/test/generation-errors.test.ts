import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EngineError } from '@refloor/engine';
import {
  GenerationFailure,
  generationFailureFallback,
  generationFailureMessage,
  storedGenerationFailureMessage,
} from '@refloor/server/features/generation/generation.error';
import { generationDocument } from '@refloor/server/features/generation/generation.model';
import type { GenerationRecord } from '@refloor/server/features/generation/generation.model';
import { validateRequirements } from '@refloor/server/shared/planning/requirements';

describe('public generation failures', () => {
  it('keeps actionable failures without exposing their internal cause', () => {
    const failure = new GenerationFailure('The requested rooms do not fit this house.', {
      cause: new Error('/private/server/internal.ts: invalid model response'),
    });
    expect(generationFailureMessage(failure)).toBe('The requested rooms do not fit this house.');
    expect(generationFailureMessage(new Error('secret diagnostic'))).toBe(
      generationFailureFallback,
    );
    expect(generationFailureMessage({ message: 'secret diagnostic' })).toBe(
      generationFailureFallback,
    );
    expect(generationFailureMessage(new GenerationFailure('   '))).toBe(generationFailureFallback);
  });

  it('summarises geometry failures without leaking entity IDs or repeating reasons', () => {
    const failure = new EngineError([
      {
        code: 'OBJECT_COLLISION',
        entityId: 'ground/room-1/internal-id',
        message: 'Furniture overlaps.',
      },
      {
        code: 'OBJECT_COLLISION',
        entityId: 'ground/room-2/internal-id',
        message: 'Furniture overlaps.',
      },
      {
        code: 'UNREACHABLE_ROOM',
        entityId: 'ground/room-3',
        message: 'A room has no walking route.',
      },
    ]);
    expect(generationFailureMessage(failure)).toBe(
      'The generated layout could not be validated. Furniture overlaps. A room has no walking route.',
    );
    expect(generationFailureMessage(new EngineError([]))).toBe(generationFailureFallback);
  });

  it('keeps documented programme limitations as typed public failures', () => {
    let failure: unknown;
    try {
      validateRequirements({
        name: 'Home',
        storeys: 1,
        width: null,
        depth: null,
        rooms: [
          {
            name: 'Room',
            floor: 0,
            uses: ['living'],
            size: 'standard',
            side: null,
            position: 'front',
          },
          {
            name: 'Room',
            floor: 0,
            uses: ['bedroom'],
            size: 'standard',
            side: null,
            position: 'rear',
          },
        ],
        wallColor: '#ffffff',
        upholsteryColor: '#ffffff',
        flooring: 'oak',
        roof: 'flat',
        unsupported: [],
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(GenerationFailure);
    expect(generationFailureMessage(failure)).toBe('Room names must be unique.');
  });

  it('does not expose a raw response-schema error', () => {
    const result = z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('progress') }),
        z.object({ type: z.literal('complete') }),
        z.object({ type: z.literal('failed') }),
      ])
      .safeParse({ type: 'dependency-message' });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('Expected an invalid worker message.');
    expect(generationFailureMessage(result.error)).toBe(generationFailureFallback);
    expect(storedGenerationFailureMessage(result.error.message)).toBe(generationFailureFallback);
    expect(storedGenerationFailureMessage(result.error.message.slice(0, 180))).toBe(
      generationFailureFallback,
    );
  });

  it('sanitises existing failed jobs at the API boundary while preserving useful messages', () => {
    const record: GenerationRecord = {
      _id: crypto.randomUUID(),
      ownerId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      fingerprint: 'generation-failure-regression',
      prompt: 'A two-bedroom bungalow.',
      status: 'failed',
      projectId: null,
      error:
        '[{"code":"invalid_union","errors":[],"path":["type"],"message":"Invalid discriminator"}]',
      usage: null,
      active: false,
      createdAt: new Date(),
      deadline: null,
      expiresAt: new Date(),
    };
    expect(generationDocument(record).error).toBe(generationFailureFallback);
    expect(record.error).toContain('invalid_union');
    const message = 'The requested rooms do not fit these dimensions and side assignments.';
    expect(generationDocument({ ...record, error: message }).error).toBe(message);
    expect(storedGenerationFailureMessage(null)).toBeNull();
    expect(storedGenerationFailureMessage('Use invalid_union as the room name.')).toBe(
      'Use invalid_union as the room name.',
    );
    expect(storedGenerationFailureMessage('[{"name":"Kitchen","code":"blue"}]')).toBe(
      '[{"name":"Kitchen","code":"blue"}]',
    );
  });
});
