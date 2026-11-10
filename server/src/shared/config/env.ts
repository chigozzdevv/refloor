import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
  MONGODB_DATABASE: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,63}$/)
    .default('refloor'),
  CLIENT_ORIGINS: z
    .string()
    .default(
      'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173',
    ),
  AI_PROVIDER: z.enum(['openai', 'boundless']).default('openai'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.literal('gpt-6-luna').default('gpt-6-luna'),
  BOUNDLESS_API_KEY: z.string().optional(),
  BOUNDLESS_MODEL: z.string().min(1).default('openai/gpt-6-luna'),
});

export type ServerConfig = {
  sessionCookieName?: string;
  production: boolean;
  host: string;
  trustProxy?: boolean;
  port: number;
  mongoUri: string;
  database: string;
  clientOrigins: string[];
  ai?: { provider: 'openai' | 'boundless'; apiKey: string; model: string };
};

export function readConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success)
    throw new Error(
      `Invalid server configuration: ${[...new Set(result.error.issues.map((issue) => issue.path[0]))].join(', ')}`,
    );
  const value = result.data;
  const clientOrigins = [
    ...new Set(value.CLIENT_ORIGINS.split(',').map((origin) => origin.trim())),
  ];
  for (const origin of clientOrigins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin)
      throw new Error('CLIENT_ORIGINS must contain exact HTTP(S) origins');
  }
  const provider = value.AI_PROVIDER;
  const apiKey = provider === 'boundless' ? value.BOUNDLESS_API_KEY : value.OPENAI_API_KEY;
  const model = provider === 'boundless' ? value.BOUNDLESS_MODEL : value.OPENAI_MODEL;
  return {
    production: value.NODE_ENV === 'production',
    host: value.HOST,
    trustProxy: value.TRUST_PROXY === 'true',
    port: value.PORT,
    mongoUri: value.MONGODB_URI,
    database: value.MONGODB_DATABASE,
    clientOrigins,
    ...(apiKey ? { ai: { provider, apiKey, model } } : {}),
  };
}
