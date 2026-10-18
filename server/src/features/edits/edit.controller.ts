import type { FastifyRequest } from 'fastify';
import { houseParamsSchema } from '@refloor/server/features/houses/house.schema';
import {
  editRequestSchema,
  historyRequestSchema,
} from '@refloor/server/features/edits/edit.schema';
import type { EditService } from '@refloor/server/features/edits/edit.service';
import type { UndoService } from '@refloor/server/features/edits/undo.service';
import type { SessionController } from '@refloor/server/features/sessions/session.controller';

export class EditController {
  constructor(
    private readonly edits: EditService,
    private readonly history: UndoService,
    private readonly sessions: SessionController,
  ) {}

  apply = async (request: FastifyRequest) => {
    const owner = await this.sessions.owner(request);
    return this.edits.apply(
      owner,
      houseParamsSchema.parse(request.params).id,
      editRequestSchema.parse(request.body),
    );
  };
  undo = (request: FastifyRequest) => this.restore(request, 'undo');
  redo = (request: FastifyRequest) => this.restore(request, 'redo');

  private async restore(request: FastifyRequest, kind: 'undo' | 'redo') {
    const owner = await this.sessions.owner(request);
    return this.history.restore(
      owner,
      houseParamsSchema.parse(request.params).id,
      kind,
      historyRequestSchema.parse(request.body),
    );
  }
}
