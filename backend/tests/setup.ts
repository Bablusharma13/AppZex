import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database';

/**
 * Test database bootstrap.
 *
 * Uses a dedicated database name so a test run can never touch development or
 * production data. The MongoDB server itself is the local/Atlas instance from
 * MONGODB_URI_TEST.
 */
jest.setTimeout(60000);

beforeAll(async () => {
  await connectDatabase(process.env.MONGODB_URI_TEST ?? 'mongodb://127.0.0.1:27017/appzex_agencyos_test');
});

/**
 * Wipes every collection after each test. Suites therefore rebuild their
 * fixtures per test (see `buildFixtures` and the cached password hash).
 */
afterEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await disconnectDatabase();
});

process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[test] Unhandled rejection:', reason);
});