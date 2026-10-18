import type { FastifyRequest, FastifyReply } from 'fastify';
import { generationRequestSchema } from '@refloor/scene/contracts';
import { generationParamsSchema } from '@refloor/server/features/generation/generation.schema';
import type { GenerationService } from '@refloor/server/features/generation/generation.service';
import type { SessionController } from '@refloor/server/features/sessions/session.controller';

export class GenerationController {
  constructor(
    private readonly generation: GenerationService,
    private readonly sessions: SessionController,
  ) {}
  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const owner = await this.sessions.owner(request);
    return reply
      .code(202)
      .send(await this.generation.create(owner, generationRequestSchema.parse(request.body)));
  };
  get = async (request: FastifyRequest) =>
    this.generation.get(
      await this.sessions.owner(request),
      generationParamsSchema.parse(request.params).id,
    );
}
