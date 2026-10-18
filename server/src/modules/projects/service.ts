import { randomUUID } from 'node:crypto';
import { MongoServerError } from 'mongodb';
import type { ClientSession } from 'mongodb';
import { z } from 'zod';
import {
  validateBuilding,
  validatePlacement,
  isPlayerPositionValid,
  EngineError,
} from '@refloor/engine';
import { undoRevision } from '@refloor/scene';
import type { Building, SceneRevision } from '@refloor/scene';
import type {
  Project,
  ProjectSummary,
  ProjectWrite,
  ProjectCreate,
  ProjectSave,
  ProjectEdit,
  ProjectHistory,
  ProjectList,
} from '@refloor/contracts';
import type { Database } from '@refloor/server/database/connection';
import type { ProjectRecord, RevisionRecord } from '@refloor/server/database/models';
import { ApiError } from '@refloor/server/http/errors';
import { fingerprint } from '@refloor/server/shared/fingerprint';
import { validateAssets } from '@refloor/server/modules/projects/validation';

const cursorSchema = z.strictObject({ at: z.iso.datetime(), id: z.uuid() });
type Change = {
  building: Building;
  revision: SceneRevision | null;
  past: string[];
  future: string[];
};
const notFound = () =>
  new ApiError(404, 'PROJECT_NOT_FOUND', 'This project is not available in this browser session.');
const conflict = () =>
  new ApiError(
    409,
    'VERSION_CONFLICT',
    'This project has changed. Open the latest version or save your work as a new project.',
  );

function summary(record: ProjectRecord): ProjectSummary {
  return {
    id: record._id,
    name: record.building.name,
    version: record.version,
    revision: record.building.revision,
    storeys: record.building.floors.length,
    objectCount: record.building.objects.length,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    canUndo: record.past.length > 0,
    canRedo: record.future.length > 0,
  };
}

function project(record: ProjectRecord): Project {
  return { ...summary(record), building: record.building };
}

function receipt(
  record: ProjectRecord,
  acceptedVersion: number,
  replayed: boolean,
  revision: SceneRevision | null,
): ProjectWrite {
  return { project: project(record), acceptedVersion, replayed, revision };
}

function checkRequest(record: RevisionRecord, digest: string) {
  if (record.fingerprint !== digest)
    throw new ApiError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'This request ID has already been used for a different change.',
    );
}

export class Projects {
  constructor(private readonly database: Database) {}

  async get(ownerId: string, id: string): Promise<Project> {
    const record = await this.database.projects.findOne({ _id: id, ownerId });
    if (!record) throw notFound();
    return project(record);
  }

  async list(ownerId: string, limit: number, cursor?: string): Promise<ProjectList> {
    let after: z.infer<typeof cursorSchema> | null = null;
    if (cursor) {
      try {
        after = cursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
      } catch {
        throw new ApiError(400, 'INVALID_CURSOR', 'The project list cursor is invalid.');
      }
    }
    const records = await this.database.projects
      .find({
        ownerId,
        ...(after
          ? {
              $or: [
                { updatedAt: { $lt: new Date(after.at) } },
                { updatedAt: new Date(after.at), _id: { $lt: after.id } },
              ],
            }
          : {}),
      })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit + 1)
      .toArray();
    const page = records.slice(0, limit),
      last = page.at(-1);
    return {
      items: page.map(summary),
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
      const existing = await this.database.projects.findOne({
        ownerId,
        creationId: input.requestId,
      });
      if (!existing) return null;
      if (existing.creationFingerprint !== digest)
        throw new ApiError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'This request ID has already been used to create a different project.',
        );
      return receipt(existing, 0, true, null);
    };
    const previous = await replay();
    if (previous) return previous;
    validateAssets(input.building);
    const compiled = validateBuilding(input.building);
    const now = new Date();
    const record: ProjectRecord = {
      _id: randomUUID(),
      ownerId,
      creationId: input.requestId,
      creationFingerprint: digest,
      building: compiled.building,
      version: 0,
      createdAt: now,
      updatedAt: now,
      past: [],
      future: [],
    };
    try {
      await this.database.projects.insertOne(record);
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
      const repeated = await replay();
      if (!repeated) throw error;
      return repeated;
    }
    return receipt(record, 0, false, null);
  }

  async save(ownerId: string, id: string, input: ProjectSave): Promise<ProjectWrite> {
    return this.change(ownerId, id, input.requestId, 'snapshot', input, async (record) => {
      if (record.version !== input.expectedVersion) throw conflict();
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
      return { building: compiled.building, revision: null, past: [], future: [] };
    });
  }

  async edit(ownerId: string, id: string, input: ProjectEdit): Promise<ProjectWrite> {
    return this.change(ownerId, id, input.edit.id, 'edit', input, async (record) => {
      const result = validatePlacement(record.building, input.edit, {}, input.player ?? undefined);
      validateAssets(result.building);
      return {
        building: result.building,
        revision: result.revision,
        past: [...record.past, this.revisionId(id, input.edit.id)].slice(-50),
        future: [],
      };
    });
  }

  async history(
    ownerId: string,
    id: string,
    kind: 'undo' | 'redo',
    input: ProjectHistory,
  ): Promise<ProjectWrite> {
    return this.change(ownerId, id, input.id, kind, input, async (record, session) => {
      if (record.building.revision !== input.expectedRevision) throw conflict();
      const stack = kind === 'undo' ? record.past : record.future;
      const revisionId = stack.at(-1);
      if (!revisionId) throw new ApiError(409, 'HISTORY_EMPTY', `There is no change to ${kind}.`);
      const previous = await this.database.revisions.findOne(
        { _id: revisionId, projectId: id },
        { session },
      );
      if (!previous?.revision) throw new Error('Project history is incomplete');
      const result = undoRevision(record.building, previous.revision, {
        id: input.id,
        at: input.at,
      });
      const compiled = validateBuilding(result.building);
      if (input.player && !isPlayerPositionValid(compiled, input.player))
        throw new EngineError([
          {
            code: 'PLAYER_BLOCKED',
            entityId: input.player.floorId,
            message: 'This change would occupy the player or remove their floor support.',
          },
        ]);
      validateAssets(result.building);
      const nextId = this.revisionId(id, input.id);
      return {
        building: result.building,
        revision: result.revision,
        past: kind === 'undo' ? record.past.slice(0, -1) : [...record.past, nextId].slice(-50),
        future:
          kind === 'redo' ? record.future.slice(0, -1) : [...record.future, nextId].slice(-50),
      };
    });
  }

  private revisionId(projectId: string, requestId: string) {
    return `${projectId}:${requestId}`;
  }

  private async change(
    ownerId: string,
    id: string,
    requestId: string,
    kind: RevisionRecord['kind'],
    input: unknown,
    apply: (record: ProjectRecord, session: ClientSession) => Promise<Change>,
  ): Promise<ProjectWrite> {
    const digest = fingerprint({ kind, input }),
      revisionId = this.revisionId(id, requestId);
    try {
      return await this.database.client.withSession((session) =>
        session.withTransaction(
          async () => {
            const record = await this.database.projects.findOne({ _id: id, ownerId }, { session });
            if (!record) throw notFound();
            const previous = await this.database.revisions.findOne(
              { _id: revisionId },
              { session },
            );
            if (previous) {
              checkRequest(previous, digest);
              return receipt(record, previous.acceptedVersion, true, previous.revision);
            }
            const changed = await apply(record, session);
            const next: ProjectRecord = {
              ...record,
              building: changed.building,
              past: changed.past,
              future: changed.future,
              version: record.version + 1,
              updatedAt: new Date(),
            };
            const result = await this.database.projects.replaceOne(
              { _id: id, ownerId, version: record.version },
              next,
              { session },
            );
            if (result.matchedCount !== 1) throw conflict();
            await this.database.revisions.insertOne(
              {
                _id: revisionId,
                projectId: id,
                requestId,
                kind,
                fingerprint: digest,
                acceptedVersion: next.version,
                revision: changed.revision,
                createdAt: next.updatedAt,
              },
              { session },
            );
            return receipt(next, next.version, false, changed.revision);
          },
          {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
            maxCommitTimeMS: 5000,
          },
        ),
      );
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
      const current = await this.database.projects.findOne({ _id: id, ownerId });
      if (!current) throw notFound();
      const previous = await this.database.revisions.findOne({ _id: revisionId });
      if (!previous) throw error;
      checkRequest(previous, digest);
      return receipt(current, previous.acceptedVersion, true, previous.revision);
    }
  }
}
