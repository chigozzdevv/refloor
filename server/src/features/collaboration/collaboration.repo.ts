import type { Db, MongoClient, ClientSession } from 'mongodb';
import type { HouseRecord } from '@refloor/server/features/houses/house.model';
import type {
  MemberRecord,
  InviteRecord,
  ActivityRecord,
} from '@refloor/server/features/collaboration/collaboration.model';
export class CollaborationRepository {
  readonly projects;
  readonly members;
  readonly invites;
  readonly activity;
  constructor(
    readonly client: MongoClient,
    db: Db,
  ) {
    this.projects = db.collection<HouseRecord>('projects');
    this.members = db.collection<MemberRecord>('project_members');
    this.invites = db.collection<InviteRecord>('project_invites');
    this.activity = db.collection<ActivityRecord>('project_activity');
  }
  transaction<T>(run: (session: ClientSession) => Promise<T>): Promise<T> {
    return this.client.withSession((session) =>
      session.withTransaction(() => run(session), {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        maxCommitTimeMS: 5000,
      }),
    );
  }
}
