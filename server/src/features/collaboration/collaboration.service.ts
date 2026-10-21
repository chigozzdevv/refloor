import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { MongoServerError } from 'mongodb';
import type { ClientSession } from 'mongodb';
import { isPlayerPositionValid, validateBuilding, validatePlacement } from '@refloor/engine';
import type { NavigationPoint } from '@refloor/engine';
import { sharedPlayersClear } from '@refloor/engine/validation/shared-players';
import { editGuardPaths, guardsCover } from '@refloor/scene/edit-guards';
import { diffProperties, propertiesMatch, restorationChanges } from '@refloor/scene/properties';
import { recordChatTurn, recordTransition } from '@refloor/scene/edit-memory';
import type {
  SharedEdit,
  SharedHistory,
  SharedReceipt,
  SharedState,
} from '@refloor/scene/collaboration';
import type { CollaborationRepository } from '@refloor/server/features/collaboration/collaboration.repo';
import {
  activityView,
  memberView,
} from '@refloor/server/features/collaboration/collaboration.model';
import type {
  ActivityRecord,
  MemberRecord,
} from '@refloor/server/features/collaboration/collaboration.model';
import { ApiError } from '@refloor/server/shared/http/errors';
import { fingerprint } from '@refloor/server/shared/database/fingerprint';
import { houseSummary, houseDocument } from '@refloor/server/features/houses/house.presenter';
import {
  validateAssets,
  validateMemory,
  validateTuning,
} from '@refloor/server/features/houses/house.validation';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const colors = ['#8ec5ff', '#ffba89', '#c5a2ff', '#8ee0b4', '#f3a8d1', '#ffe08a'];
const denied = () =>
  new ApiError(403, 'SHARING_DENIED', 'You no longer have access to this shared house.');
export class CollaborationService {
  readonly changes = new Set<(projectId: string) => void>();
  players: (projectId: string) => NavigationPoint[] = () => [];
  constructor(readonly repo: CollaborationRepository) {}
  changed(id: string) {
    for (const notify of this.changes) notify(id);
  }
  async access(ownerId: string, id: string, session?: ClientSession, edit = false) {
    const member = await this.repo.members.findOne(
      { projectId: id, ownerId, active: true },
      session ? { session } : {},
    );
    if (!member) throw denied();
    if (edit && member.role === 'viewer')
      throw new ApiError(
        403,
        'VIEW_ONLY',
        'This invitation allows viewing. Ask the owner for editor access.',
      );
    return member;
  }
  async list(ownerId: string) {
    const memberships = await this.repo.members
      .find({ ownerId, active: true })
      .limit(100)
      .toArray();
    const projects = await this.repo.projects
      .find({ _id: { $in: memberships.map((member) => member.projectId) }, shared: true })
      .sort({ updatedAt: -1 })
      .toArray();
    return { items: projects.map(houseSummary), nextCursor: null };
  }
  async validPresence(id: string, player: NavigationPoint | null, floorId: string) {
    const record = await this.repo.projects.findOne({ _id: id, shared: true });
    return (
      !!record &&
      (!floorId || record.building.floors.some((floor) => floor.id === floorId)) &&
      (!player || isPlayerPositionValid(validateBuilding(record.building), player))
    );
  }
  async state(ownerId: string, id: string): Promise<SharedState> {
    return this.repo.transaction(async (session) => {
      const self = await this.access(ownerId, id, session);
      const record = await this.repo.projects.findOne({ _id: id, shared: true }, { session });
      if (!record) throw denied();
      const members = await this.repo.members
        .find({ projectId: id, ...(self.role === 'owner' ? {} : { active: true }) }, { session })
        .toArray();
      const events = await this.repo.activity
        .find({ projectId: id }, { session })
        .sort({ version: -1 })
        .limit(101)
        .toArray();
      return {
        project: houseDocument(record),
        self: memberView(self),
        members: members.map(memberView),
        activity: events.slice(0, 100).reverse().map(activityView),
        hasEarlier: events.length > 100,
      };
    });
  }
  async history(ownerId: string, id: string, before: number) {
    await this.access(ownerId, id);
    const events = await this.repo.activity
      .find({ projectId: id, version: { $lt: before } })
      .sort({ version: -1 })
      .limit(101)
      .toArray();
    return {
      items: events.slice(0, 100).reverse().map(activityView),
      hasEarlier: events.length > 100,
    };
  }
  async enable(ownerId: string, id: string, name: string, expectedVersion: number) {
    await this.repo.transaction(async (session) => {
      const record = await this.repo.projects.findOne({ _id: id, ownerId }, { session });
      if (!record) throw denied();
      if (!record.shared && record.version !== expectedVersion)
        throw new ApiError(
          409,
          'VERSION_CONFLICT',
          'The house changed while sharing was starting. Open the latest saved version and try again.',
        );
      const member = this.member(ownerId, id, name, 'owner');
      await this.repo.members.updateOne(
        { projectId: id, ownerId },
        {
          $set: { name, role: 'owner', active: true },
          $setOnInsert: {
            _id: member._id,
            id: member.id,
            ownerId,
            projectId: id,
            color: member.color,
          },
        },
        { upsert: true, session },
      );
      await this.repo.projects.updateOne(
        { _id: id, ownerId },
        { $set: { shared: true }, $inc: { version: 1 } },
        { session },
      );
    });
    this.changed(id);
    return this.state(ownerId, id);
  }
  private member(
    ownerId: string,
    projectId: string,
    name: string,
    role: MemberRecord['role'],
  ): MemberRecord {
    const id = randomUUID(),
      color = colors[parseInt(hash(ownerId).slice(0, 8), 16) % colors.length]!;
    return {
      _id: `${projectId}:${ownerId}`,
      id,
      ownerId,
      projectId,
      name,
      role,
      color,
      active: true,
    };
  }
  async invites(ownerId: string, id: string) {
    if ((await this.access(ownerId, id)).role !== 'owner') throw denied();
    const items = await this.repo.invites
      .find({ projectId: id, revoked: false, expiresAt: { $gt: new Date() } })
      .sort({ expiresAt: -1 })
      .limit(100)
      .toArray();
    return {
      items: items.map((item) => ({
        id: item._id,
        role: item.role,
        expiresAt: item.expiresAt.toISOString(),
      })),
    };
  }
  async invite(ownerId: string, id: string, role: 'editor' | 'viewer') {
    const member = await this.access(ownerId, id);
    if (member.role !== 'owner') throw denied();
    const token = randomBytes(32).toString('hex'),
      invitation = {
        _id: randomUUID(),
        projectId: id,
        tokenHash: hash(token),
        role,
        expiresAt: new Date(Date.now() + 7 * 86400000),
        revoked: false,
      };
    await this.repo.invites.insertOne(invitation);
    return { id: invitation._id, token, role, expiresAt: invitation.expiresAt.toISOString() };
  }
  async join(ownerId: string, token: string, name: string) {
    let id = '';
    await this.repo.transaction(async (session) => {
      const invite = await this.repo.invites.findOne(
        { tokenHash: hash(token), revoked: false, expiresAt: { $gt: new Date() } },
        { session },
      );
      if (!invite)
        throw new ApiError(410, 'INVITE_EXPIRED', 'This invitation has expired or been revoked.');
      id = invite.projectId;
      const existing = await this.repo.members.findOne({ projectId: id, ownerId }, { session });
      if (existing && !existing.active) throw denied();
      if (
        !existing &&
        (await this.repo.members.countDocuments({ projectId: id, active: true }, { session })) >=
          100
      )
        throw new ApiError(409, 'MEMBER_LIMIT', 'This house already has 100 members.');
      if (!existing)
        await this.repo.members.insertOne(this.member(ownerId, id, name, invite.role), { session });
      else
        await this.repo.members.updateOne({ _id: existing._id }, { $set: { name } }, { session });
      await this.repo.projects.updateOne(
        { _id: id, shared: true },
        { $inc: { version: 1 } },
        { session },
      );
      // Writing the invitation makes revocation and joins serialize together.
      await this.repo.invites.updateOne({ _id: invite._id }, { $inc: { uses: 1 } }, { session });
    });
    this.changed(id);
    return this.state(ownerId, id);
  }
  async manage(
    ownerId: string,
    id: string,
    memberId: string,
    role: 'editor' | 'viewer' | 'removed',
  ) {
    await this.repo.transaction(async (session) => {
      if ((await this.access(ownerId, id, session)).role !== 'owner') throw denied();
      const member = await this.repo.members.findOne({ projectId: id, id: memberId }, { session });
      if (!member || member.role === 'owner')
        throw new ApiError(400, 'INVALID_MEMBER', 'The owner cannot be removed or demoted.');
      await this.repo.members.updateOne(
        { _id: member._id },
        { $set: role === 'removed' ? { active: false } : { role, active: true } },
        { session },
      );
      await this.repo.projects.updateOne({ _id: id }, { $inc: { version: 1 } }, { session });
    });
    this.changed(id);
    return this.state(ownerId, id);
  }
  async revokeInvite(ownerId: string, id: string, inviteId: string) {
    if ((await this.access(ownerId, id)).role !== 'owner') throw denied();
    await this.repo.invites.updateOne(
      { _id: inviteId, projectId: id },
      { $set: { revoked: true } },
    );
    return { ready: true as const };
  }
  edit(ownerId: string, id: string, input: SharedEdit) {
    return this.commit(ownerId, id, input, null);
  }
  rollback(ownerId: string, id: string, eventId: string, input: SharedHistory) {
    return this.commit(ownerId, id, input, eventId);
  }
  private async commit(
    ownerId: string,
    id: string,
    input: SharedEdit | SharedHistory,
    originalId: string | null,
  ): Promise<SharedReceipt> {
    const digest = fingerprint({ ownerId, input, originalId }),
      key = `${id}:${input.id}`;
    let acceptedVersion = 0,
      replayed = false;
    const run = () =>
      this.repo.transaction(async (session) => {
        const navigation =
          'commands' in input &&
          input.source === 'navigation' &&
          input.commands.every(
            (command) => command.type === 'set-door' || command.type === 'emit-event',
          );
        const author = await this.access(ownerId, id, session, !navigation),
          record = await this.repo.projects.findOne({ _id: id, shared: true }, { session });
        if (!record) throw denied();
        const previous = await this.repo.activity.findOne({ _id: key }, { session });
        if (previous) {
          if (previous.fingerprint !== digest)
            throw new ApiError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'This request ID already belongs to a different edit.',
            );
          acceptedVersion = previous.version;
          replayed = true;
          return;
        }
        let original: ActivityRecord | null = null;
        if (originalId) {
          original = await this.repo.activity.findOne(
            { projectId: id, id: originalId, kind: 'edit', undoable: true },
            { session },
          );
          if (!original || !('restore' in input) || Boolean(original.revertedBy) !== input.restore)
            throw new ApiError(
              409,
              'HISTORY_CONFLICT',
              'This change has already been restored or rolled back.',
            );
        }
        const restore = 'restore' in input && input.restore;
        const commands =
          'commands' in input
            ? input.commands
            : [
                {
                  type: 'restore-properties' as const,
                  changes: restorationChanges(record.building, original!.patches, restore),
                },
              ];
        if ('commands' in input) {
          if (!propertiesMatch(record.building, input.guards))
            throw new ApiError(
              409,
              'EDIT_CONFLICT',
              'Someone changed the same property. Your house is up to date; try your instruction again.',
            );
          if (!guardsCover(editGuardPaths(record.building, commands), input.guards))
            throw new ApiError(400, 'MISSING_GUARD', 'The edit is missing its property checks.');
          validateTuning(record.building, commands);
        }
        const before = validateBuilding(record.building);
        const result = validatePlacement(
          record.building,
          {
            id: input.id,
            at: new Date().toISOString(),
            expectedRevision: record.building.revision,
            commands,
          },
          {},
          undefined,
          { evaluateRules: !original },
        );
        if (!original) validateTuning(record.building, result.revision.commands);
        validateAssets(result.building);
        const players = [
          ...this.players(id),
          ...('player' in input && input.player ? [input.player] : []),
        ];
        if (!sharedPlayersClear(before, result.compiled, players))
          throw new ApiError(
            409,
            'PERSON_IN_WAY',
            'Someone is in the way of this change. Wait until they move clear.',
          );
        const source = 'source' in input ? input.source : original!.source,
          label =
            'label' in input
              ? input.label
              : `${restore ? 'Restore' : 'Roll back'}: ${original!.label}`;
        let memory = recordTransition(
          validateMemory(record.building, record.memory),
          result.building,
          {
            revision: result.revision,
            kind: original ? (restore ? 'redo' : 'undo') : 'edit',
            source,
            label,
          },
        );
        if ('message' in input && input.message && input.target)
          memory = recordChatTurn(memory, {
            id: input.id,
            at: result.revision.at,
            target: input.target,
            author: { id: author.id, name: author.name },
            message: input.message,
            reply: input.reply ?? 'Done.',
            status: 'applied',
            baseRevision: record.building.revision,
            revisionId: input.id,
          });
        const patches = diffProperties(record.building, result.building);
        const event: ActivityRecord = {
          _id: key,
          id: input.id,
          requestId: input.id,
          fingerprint: digest,
          ownerId,
          projectId: id,
          version: record.version + 1,
          at: result.revision.at,
          author: memberView(author),
          kind: original ? (restore ? 'restore' : 'rollback') : 'edit',
          source,
          label,
          ...('target' in input && input.target ? { target: input.target } : {}),
          ...('message' in input && input.message ? { message: input.message } : {}),
          ...('reply' in input && input.reply ? { reply: input.reply } : {}),
          ...(original ? { originalId: original.id } : {}),
          revertedBy: null,
          undoable:
            patches.length > 0 &&
            (source !== 'navigation' ||
              result.revision.commands.some(
                (command) => command.type !== 'set-door' && command.type !== 'emit-event',
              )),
          revision: result.revision,
          patches,
        };
        const changed = await this.repo.projects.replaceOne(
          { _id: id, version: record.version },
          {
            ...record,
            building: result.building,
            memory,
            version: event.version,
            past: [],
            future: [],
            updatedAt: new Date(event.at),
          },
          { session },
        );
        if (!changed.matchedCount)
          throw new ApiError(
            409,
            'EDIT_CONFLICT',
            'Another edit arrived. Try that instruction again.',
          );
        await this.repo.activity.insertOne(event, { session });
        if (original)
          await this.repo.activity.updateOne(
            { _id: original._id },
            { $set: { revertedBy: restore ? null : event.id } },
            { session },
          );
        acceptedVersion = event.version;
      });
    try {
      await run();
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
      await run();
    }
    this.changed(id);
    return { state: await this.state(ownerId, id), acceptedVersion, replayed, eventId: input.id };
  }
}
