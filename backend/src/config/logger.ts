import fs from 'fs';
import path from 'path';
import { env } from './env';

type Level = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_WEIGHT: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const MIN_WEIGHT = LEVEL_WEIGHT[env.LOG_LEVEL];

/**
 * Secrets that must never reach the log stream, even when a caller passes an
 * entire request body for context.
 */
const REDACT_KEYS = new Set([
  'password', 'passwordhash', 'currentpassword', 'newpassword', 'confirmpassword',
  'token', 'accesstoken', 'refreshtoken', 'authorization', 'cookie',
  'apikey', 'ai_api_key', 'jwt', 'jwtsecret', 'supporttoken', 'mongodb_uri',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACT_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(val, depth + 1);
  }
  return out;
}

export function redactSecrets<T>(payload: T): T {
  return redact(payload) as T;
}

const COLOR: Record<Level, string> = {
  error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[90m',
};
const RESET = '\x1b[0m';

const isTest = env.NODE_ENV === 'test';
let logFileReady = false;

function writeToFile(line: string, level: Level): void {
  if (isTest) return;
  try {
    if (!logFileReady) {
      fs.mkdirSync(path.resolve(process.cwd(), 'logs'), { recursive: true });
      logFileReady = true;
    }
    const file = level === 'error' || level === 'warn' ? 'error.log' : 'app.log';
    fs.appendFileSync(path.resolve(process.cwd(), 'logs', file), `${line}\n`);
  } catch {
    /* logging must never throw */
  }
}

function emit(level: Level, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_WEIGHT[level] > MIN_WEIGHT) return;

  const timestamp = new Date().toISOString();
  const safeContext = context ? (redactSecrets(context) as Record<string, unknown>) : undefined;
  const suffix = safeContext && Object.keys(safeContext).length ? ` ${JSON.stringify(safeContext)}` : '';

  writeToFile(JSON.stringify({ timestamp, level, message, ...(safeContext ?? {}) }), level);

  if (!isTest || process.env.SHOW_TEST_LOGS === 'true') {
    // eslint-disable-next-line no-console
    console.log(`${COLOR[level]}${timestamp} ${level.toUpperCase()}${RESET} ${message}${suffix}`);
  }
}

type LogFn = (message: string, context?: Record<string, unknown>) => void;

export const logger = {
  error: ((m: string, c?: Record<string, unknown>) => emit('error', m, c)) as LogFn,
  warn: ((m: string, c?: Record<string, unknown>) => emit('warn', m, c)) as LogFn,
  info: ((m: string, c?: Record<string, unknown>) => emit('info', m, c)) as LogFn,
  debug: ((m: string, c?: Record<string, unknown>) => emit('debug', m, c)) as LogFn,
};