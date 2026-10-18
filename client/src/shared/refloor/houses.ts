import { projectListSchema, projectSchema, projectWriteSchema } from '@refloor/scene/contracts';
import type { ProjectCreate, ProjectSave } from '@refloor/scene/contracts';
import { authenticated, request } from '@/shared/refloor/client';

export const projectApi = {
  list: (cursor?: string) =>
    authenticated(() =>
      request(
        `/projects${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        projectListSchema,
      ),
    ),
  get: (id: string) =>
    authenticated(() => request(`/projects/${encodeURIComponent(id)}`, projectSchema)),
  create: (input: ProjectCreate) =>
    authenticated(() => request('/projects', projectWriteSchema, 'POST', input)),
  save: (id: string, input: ProjectSave) =>
    authenticated(() =>
      request(`/projects/${encodeURIComponent(id)}`, projectWriteSchema, 'PUT', input),
    ),
};
