import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\//),
  MONGODB_DATABASE: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,63}$/)
    .default('refloor'),
  CLIENT_ORIGINS: z.string().default('http://127.0.0.1:5173,http://localhost:5173'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.literal('gpt-6-luna').default('gpt-6-luna'),
});

export type ServerConfig = {
  production: boolean;
  host: string;
  port: number;
  mongoUri: string;
  database: string;
  clientOrigins: string[];
  ai?: { apiKey: string; model: 'gpt-6-luna' };
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
  return {
    production: value.NODE_ENV === 'production',
    host: value.HOST,
    port: value.PORT,
    mongoUri: value.MONGODB_URI,
    database: value.MONGODB_DATABASE,
    clientOrigins,
    ...(value.OPENAI_API_KEY
      ? { ai: { apiKey: value.OPENAI_API_KEY, model: value.OPENAI_MODEL } }
      : {}),
  };
}
