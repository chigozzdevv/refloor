import type { FastifyInstance } from 'fastify';
import type { HouseController } from '@refloor/server/features/houses/house.controller';

export function registerHouseRoutes(app: FastifyInstance, controller: HouseController) {
  app.get('/api/projects', controller.list);
  app.post('/api/projects', controller.create);
  app.get('/api/projects/:id', controller.get);
  app.put('/api/projects/:id', controller.save);
}
