import {
  projectListSchema,
  projectSchema,
  projectSummarySchema,
  projectWriteSchema,
} from '@refloor/scene/contracts';
import type { ProjectCollection, ProjectCreate, ProjectSave } from '@refloor/scene/contracts';
import { authenticated, request } from '@/shared/refloor/client';

export const projectApi = {
  list: (cursor?: string, deleted = false) =>
    authenticated(() =>
      request(
        `/projects${cursor || deleted ? `?${new URLSearchParams({ ...(cursor ? { cursor } : {}), ...(deleted ? { deleted: 'true' } : {}) })}` : ''}`,
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
  updateCollection: (id: string, input: ProjectCollection) =>
    authenticated(() =>
      request(
        `/projects/${encodeURIComponent(id)}/collection`,
        projectSummarySchema,
        'PATCH',
        input,
      ),
    ),
};
