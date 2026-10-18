import { describe, expect, it } from 'vitest';
import { readConfig } from '@refloor/server/shared/config/env';

const mongo = { MONGODB_URI: 'mongodb://127.0.0.1:27018/refloor' };

describe('client origin configuration', () => {
  it('allows both local frontend addresses for development and preview', () => {
    expect(readConfig(mongo).clientOrigins).toEqual([
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      'http://127.0.0.1:4173',
      'http://localhost:4173',
    ]);
  });

  it('keeps an explicit deployment allowlist exact', () => {
    expect(
      readConfig({ ...mongo, CLIENT_ORIGINS: 'https://refloor.example' }).clientOrigins,
    ).toEqual(['https://refloor.example']);
    expect(() => readConfig({ ...mongo, CLIENT_ORIGINS: 'https://refloor.example/path' })).toThrow(
      'exact HTTP(S) origins',
    );
  });
});
