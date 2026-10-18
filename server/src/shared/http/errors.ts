import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { SceneError } from '@refloor/scene';
import { EngineError } from '@refloor/engine';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function registerErrors(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError)
      return reply.code(error.status).send({ error: { code: error.code, message: error.message } });
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: {
          code: 'INVALID_INPUT',
          message: 'The request is invalid.',
          issues: error.issues.map((issue) => ({
            code: issue.code,
            message: `${issue.path.join('.')}: ${issue.message}`,
          })),
        },
      });
    if (error instanceof EngineError)
      return reply.code(422).send({
        error: {
          code: 'INVALID_BUILDING',
          message: 'This change does not produce an accessible, valid building.',
          issues: error.issues,
        },
      });
    if (error instanceof SceneError)
      return reply
        .code(['REVISION_CONFLICT', 'REVISION_MISMATCH'].includes(error.code) ? 409 : 422)
        .send({ error: { code: error.code, message: error.message } });
    if (
      error instanceof Error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    )
      return reply.code(error.statusCode).send({
        error: {
          code: 'REQUEST_REJECTED',
          message:
            error.statusCode === 429
              ? 'Too many requests. Please try again shortly.'
              : error.statusCode === 413
                ? 'Project requests must be smaller than 2 MB.'
                : 'The request could not be processed.',
        },
      });
    request.log.error({ err: error }, 'Request failed');
    return reply
      .code(500)
      .send({ error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' } });
  });
  app.setNotFoundHandler((_request, reply) =>
    reply
      .code(404)
      .send({ error: { code: 'NOT_FOUND', message: 'This endpoint does not exist.' } }),
  );
}
