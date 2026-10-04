import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { z } from 'zod';

const ROOT_DIR = path.resolve(__dirname, '..', '..');

/**
 * Candidate .env locations, most specific first. `__dirname` resolves
 * differently between `ts-node`/`tsx` (src/config) and the compiled build
 * (dist/config), and the process cwd varies by how the app is started, so all
 * reasonable locations are probed rather than assuming one.
 */
const candidates = [
  process.env.ENV_FILE,
  path.join(ROOT_DIR, '.env'),
  path.join(ROOT_DIR, 'backend', '.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
  path.resolve(process.cwd(), 'backend', '.env'),
].filter((p): p is string => Boolean(p));

const envFile = candidates.find((p) => fs.existsSync(p));
if (envFile) {
  dotenv.config({ path: envFile });
}

const booleanish = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_URI_TEST: z.string().optional(),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  CLIENT_URL: z.string().default('http://localhost:3000'),

  SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SUPER_ADMIN_PASSWORD: z.string().optional(),

  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  AI_MODEL: z.string().default('gpt-4o-mini'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),

  STORAGE_DIR: z.string().default('./storage'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(15),
  FORCE_INSECURE_COOKIES: booleanish,
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\n[config] Invalid environment configuration:\n${details}\n`);
  throw new Error('Invalid environment configuration. Copy .env.example to .env and fill in the values.');
}

const raw = parsed.data;

if (raw.NODE_ENV === 'production' && raw.JWT_SECRET.includes('replace-me')) {
  throw new Error('[config] JWT_SECRET must be replaced before running in production.');
}

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  clientUrls: raw.CLIENT_URL.split(',')
    .map((u) => u.trim())
    .filter(Boolean),
  // `ROOT_DIR` is already `<repo>/backend` (resolved from src/config), so the
  // relative storage path is joined directly. Joining 'backend' a second time
  // would silently create a nested `backend/backend/storage` directory.
  storageDir: path.isAbsolute(raw.STORAGE_DIR)
    ? raw.STORAGE_DIR
    : path.join(ROOT_DIR, raw.STORAGE_DIR),
  maxUploadBytes: raw.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  secureCookies: raw.NODE_ENV === 'production' && !raw.FORCE_INSECURE_COOKIES,
};

export type Env = typeof env;