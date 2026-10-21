import { MongoServerError } from 'mongodb';
import type { Collection, MongoClient, Db } from 'mongodb';
import type { ProjectWrite } from '@refloor/scene/contracts';
import type { HouseRecord } from '@refloor/server/features/houses/house.model';
import type { HouseRepository } from '@refloor/server/features/houses/house.repo';
import { houseReceipt } from '@refloor/server/features/houses/house.presenter';
import { revisionKey } from '@refloor/server/features/edits/revision.model';
import type {
  HouseChange,
  RevisionHistory,
  RevisionRecord,
} from '@refloor/server/features/edits/revision.model';
import { ApiError } from '@refloor/server/shared/http/errors';
import { fingerprint } from '@refloor/server/shared/database/fingerprint';
import { createEditMemory } from '@refloor/scene/edit-memory';

function checkRequest(record: RevisionRecord, digest: string) {
  if (record.fingerprint !== digest)
    throw new ApiError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'This request ID has already been used for a different change.',
    );
}
const notFound = () =>
  new ApiError(404, 'PROJECT_NOT_FOUND', 'This project is not available in this browser session.');

export class RevisionRepository {
  private readonly collection: Collection<RevisionRecord>;
  constructor(
    private readonly client: MongoClient,
    database: Db,
    private readonly houses: HouseRepository,
  ) {
    this.collection = database.collection<RevisionRecord>('project_revisions');
  }

  async commit(
    ownerId: string,
    id: string,
    requestId: string,
    kind: RevisionRecord['kind'],
    input: unknown,
    apply: (record: HouseRecord, history: RevisionHistory) => Promise<HouseChange>,
  ): Promise<ProjectWrite> {
    const digest = fingerprint({ kind, input }),
      revisionId = revisionKey(id, requestId);
    try {
      return await this.client.withSession((session) =>
        session.withTransaction(
          async () => {
            const record = await this.houses.find(ownerId, id, session);
            if (!record) throw notFound();
            if (record.shared)
              throw new ApiError(
                409,
                'COLLABORATION_REQUIRED',
                'This house accepts individual shared edits. Reconnect collaboration before editing.',
              );
            const previous = await this.collection.findOne({ _id: revisionId }, { session });
            if (previous) {
              checkRequest(previous, digest);
              return houseReceipt(record, previous.acceptedVersion, true, previous.revision);
            }
            const changed = await apply(record, {
              find: (key) => this.collection.findOne({ _id: key, projectId: id }, { session }),
            });
            const next: HouseRecord = {
              ...record,
              building: changed.building,
              memory: changed.memory ?? record.memory ?? createEditMemory(record.building),
              past: changed.past,
              future: changed.future,
              version: record.version + 1,
              updatedAt: new Date(),
            };
            if (!(await this.houses.replace(ownerId, next, record.version, session)))
              throw new ApiError(
                409,
                'VERSION_CONFLICT',
                'This project has changed. Open the latest version or save your work as a new project.',
              );
            await this.collection.insertOne(
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
            return houseReceipt(next, next.version, false, changed.revision);
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
      const current = await this.houses.find(ownerId, id);
      if (!current) throw notFound();
      const previous = await this.collection.findOne({ _id: revisionId });
      if (!previous) throw error;
      checkRequest(previous, digest);
      return houseReceipt(current, previous.acceptedVersion, true, previous.revision);
    }
  }
}
