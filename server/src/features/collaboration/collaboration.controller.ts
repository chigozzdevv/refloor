import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  memberNameSchema,
  sharedEditSchema,
  sharedHistorySchema,
} from '@refloor/scene/collaboration';
import type { CollaborationService } from '@refloor/server/features/collaboration/collaboration.service';
import type { SessionController } from '@refloor/server/features/sessions/session.controller';
const paramsSchema = z.object({ id: z.uuid() });
export class CollaborationController {
  constructor(
    private readonly service: CollaborationService,
    private readonly sessions: SessionController,
  ) {}
  private async context(request: FastifyRequest) {
    return { owner: await this.sessions.owner(request), id: paramsSchema.parse(request.params).id };
  }
  list = async (request: FastifyRequest) => this.service.list(await this.sessions.owner(request));
  state = async (request: FastifyRequest) => {
    const { owner, id } = await this.context(request);
    return this.service.state(owner, id);
  };
  enable = async (request: FastifyRequest) => {
    const { owner, id } = await this.context(request);
    const input = z
      .strictObject({ name: memberNameSchema, expectedVersion: z.number().int().nonnegative() })
      .parse(request.body);
    return this.service.enable(owner, id, input.name, input.expectedVersion);
  };
  invites = async (request: FastifyRequest) => {
    const { owner, id } = await this.context(request);
    return this.service.invites(owner, id);
  };
  invite = async (request: FastifyRequest) => {
    const { owner, id } = await this.context(request);
    return this.service.invite(
      owner,
      id,
      z.strictObject({ role: z.enum(['editor', 'viewer']) }).parse(request.body).role,
    );
  };
  join = async (request: FastifyRequest) => {
    const input = z
      .strictObject({ token: z.string().regex(/^[a-f0-9]{64}$/), name: memberNameSchema })
      .parse(request.body);
    return this.service.join(await this.sessions.owner(request), input.token, input.name);
  };
  edit = async (request: FastifyRequest) => {
    const { owner, id } = await this.context(request);
    return this.service.edit(owner, id, sharedEditSchema.parse(request.body));
  };
  rollback = async (request: FastifyRequest) => {
    const { owner, id } = await this.context(request);
    const { eventId } = z.object({ eventId: z.uuid() }).parse(request.params);
    return this.service.rollback(owner, id, eventId, sharedHistorySchema.parse(request.body));
  };
  history = async (request: FastifyRequest) => {
    const { owner, id } = await this.context(request);
    const { before } = z
      .object({ before: z.coerce.number().int().nonnegative() })
      .parse(request.query);
    return this.service.history(owner, id, before);
  };
  manage = async (request: FastifyRequest) => {
    const { owner, id } = await this.context(request);
    const input = z
      .strictObject({ memberId: z.uuid(), role: z.enum(['editor', 'viewer', 'removed']) })
      .parse(request.body);
    return this.service.manage(owner, id, input.memberId, input.role);
  };
  revoke = async (request: FastifyRequest) => {
    const { owner, id } = await this.context(request);
    const { inviteId } = z.object({ inviteId: z.uuid() }).parse(request.params);
    return this.service.revokeInvite(owner, id, inviteId);
  };
}
