import type { FastifyRequest, FastifyReply } from 'fastify';
import type { HouseService } from '@refloor/server/features/houses/house.service';
import {
  houseCreateSchema,
  houseListSchema,
  houseParamsSchema,
  houseSaveSchema,
} from '@refloor/server/features/houses/house.schema';
import type { SessionController } from '@refloor/server/features/sessions/session.controller';

export class HouseController {
  constructor(
    private readonly houses: HouseService,
    private readonly sessions: SessionController,
  ) {}

  list = async (request: FastifyRequest) => {
    const owner = await this.sessions.owner(request),
      query = houseListSchema.parse(request.query);
    return this.houses.list(owner, query.limit, query.cursor);
  };
  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const owner = await this.sessions.owner(request);
    const result = await this.houses.create(owner, houseCreateSchema.parse(request.body));
    return reply.code(result.replayed ? 200 : 201).send(result);
  };
  get = async (request: FastifyRequest) => {
    const owner = await this.sessions.owner(request);
    return this.houses.get(owner, houseParamsSchema.parse(request.params).id);
  };
  save = async (request: FastifyRequest) => {
    const owner = await this.sessions.owner(request);
    return this.houses.save(
      owner,
      houseParamsSchema.parse(request.params).id,
      houseSaveSchema.parse(request.body),
    );
  };
}
