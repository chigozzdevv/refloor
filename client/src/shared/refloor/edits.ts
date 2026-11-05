import { languageEditResponseSchema } from '@refloor/scene/chat';
import type { LanguageEditRequest } from '@refloor/scene/chat';
import { authenticated, request } from '@/shared/refloor/client';

export const editApi = {
  interpret: (input: LanguageEditRequest) =>
    authenticated(() =>
      request('/edits/interpret', languageEditResponseSchema, 'POST', input, 35000),
    ),
};
