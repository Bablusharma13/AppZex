import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

mongoose.set('strictQuery', true);

/**
 * NoSQL-injection posture
 * -----------------------
 * Protection is provided by the validation layer rather than by
 * `mongoose.set('sanitizeFilter', true)`:
 *
 *  - every request body / query / param is parsed by a Zod schema that
 *    whitelists keys (Zod strips unknown properties) and coerces types, so an
 *    attacker cannot introduce an operator object such as `{ "$ne": null }`;
 *  - identifiers must match a 24-character hex ObjectId before reaching a query;
 *  - all services build filters from typed, already-validated values, and free
 *    text used in `$regex` is escaped by `escapeRegex()`.
 *
 * `sanitizeFilter` was deliberately *not* enabled: it rewrites operator filters
 * on indexed paths, which makes Mongoose throw CastErrors for legitimate
 * queries (e.g. `{ expiresAt: { $gt: ... } }`), and it has known bypasses.
 * Typed filters plus schema validation are the stronger guarantee here.
 */
mongoose.set('sanitizeFilter', false);

export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    autoIndex: !env.isProduction,
  });
  logger.info('database.connected', { database: mongoose.connection.name });
  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  logger.info('database.disconnected');
}