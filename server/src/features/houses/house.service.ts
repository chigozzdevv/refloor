import { randomUUID } from 'node:crypto';
import { validateBuilding } from '@refloor/engine';
import type {
  Project,
  ProjectWrite,
  ProjectCreate,
  ProjectSave,
  ProjectList,
} from '@refloor/scene/contracts';
import type { HouseRecord } from '@refloor/server/features/houses/house.model';
import type { HouseRepository } from '@refloor/server/features/houses/house.repo';
import { houseCursorSchema } from '@refloor/server/features/houses/house.schema';
import type { HouseCursor } from '@refloor/server/features/houses/house.schema';
import {
  houseDocument,
  houseReceipt,
  houseSummary,
} from '@refloor/server/features/houses/house.presenter';
import { validateAssets, validateMemory } from '@refloor/server/features/houses/house.validation';
import type { RevisionRepository } from '@refloor/server/features/edits/revision.repo';
import { ApiError } from '@refloor/server/shared/http/errors';
import { fingerprint } from '@refloor/server/shared/database/fingerprint';

export class HouseService {
  constructor(
    private readonly houses: HouseRepository,
    private readonly revisions: RevisionRepository,
  ) {}

  async get(ownerId: string, id: string): Promise<Project> {
    const record = await this.houses.find(ownerId, id);
    if (!record)
      throw new ApiError(
        404,
        'PROJECT_NOT_FOUND',
        'This project is not available in this browser session.',
      );
    return houseDocument(record);
  }

  async list(ownerId: string, limit: number, cursor?: string): Promise<ProjectList> {
    let after: HouseCursor | null = null;
    if (cursor) {
      try {
        after = houseCursorSchema.parse(
          JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
        );
      } catch {
        throw new ApiError(400, 'INVALID_CURSOR', 'The project list cursor is invalid.');
      }
    }
    const records = await this.houses.list(ownerId, limit, after),
      page = records.slice(0, limit),
      last = page.at(-1);
    return {
      items: page.map(houseSummary),
      nextCursor:
        records.length > limit && last
          ? Buffer.from(
              JSON.stringify({ at: last.updatedAt.toISOString(), id: last._id }),
            ).toString('base64url')
          : null,
    };
  }

  async create(ownerId: string, input: ProjectCreate): Promise<ProjectWrite> {
    const digest = fingerprint(input);
    const replay = async () => {
      const existing = await this.houses.findCreation(ownerId, input.requestId);
      if (!existing) return null;
      if (existing.creationFingerprint !== digest)
        throw new ApiError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'This request ID has already been used to create a different project.',
        );
      return houseReceipt(existing, 0, true, null);
    };
    const previous = await replay();
    if (previous) return previous;
    validateAssets(input.building);
    const compiled = validateBuilding(input.building),
      now = new Date();
    const record: HouseRecord = {
      _id: randomUUID(),
      ownerId,
      creationId: input.requestId,
      creationFingerprint: digest,
      building: compiled.building,
      memory: validateMemory(compiled.building, input.memory),
      version: 0,
      createdAt: now,
      updatedAt: now,
      past: [],
      future: [],
    };
    if (!(await this.houses.insert(record))) {
      const repeated = await replay();
      if (!repeated) throw new Error('The created project could not be read.');
      return repeated;
    }
    return houseReceipt(record, 0, false, null);
  }

  save(ownerId: string, id: string, input: ProjectSave): Promise<ProjectWrite> {
    return this.revisions.commit(
      ownerId,
      id,
      input.requestId,
      'snapshot',
      input,
      async (record) => {
        if (record.version !== input.expectedVersion)
          throw new ApiError(
            409,
            'VERSION_CONFLICT',
            'This project has changed. Open the latest version or save your work as a new project.',
          );
        if (record.building.id !== input.building.id)
          throw new ApiError(
            422,
            'SCENE_MISMATCH',
            'Save an imported or different building as a new project.',
          );
        validateAssets(input.building);
        const compiled = validateBuilding({
          ...input.building,
          revision: Math.max(input.building.revision, record.building.revision + 1),
        });
        return {
          building: compiled.building,
          memory: validateMemory(compiled.building, input.memory ?? record.memory),
          revision: null,
          past: [],
          future: [],
        };
      },
    );
  }
}
