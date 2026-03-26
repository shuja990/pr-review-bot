import { z } from 'zod';
import { resolve } from 'path';
import dotenv from 'dotenv';

// Load .env in development (production platforms set env vars directly)
dotenv.config({ path: resolve(import.meta.dirname, '../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  ANTHROPIC_API_KEY: z.string().min(1),
  BITBUCKET_CLIENT_ID: z.string().min(1),
  BITBUCKET_CLIENT_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(8),
  APP_URL: z.string().default('http://localhost:5173'),
  WEBHOOK_SECRET: z.string().default(''),
  PORT: z.coerce.number().default(3001),
});

export const env = envSchema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
