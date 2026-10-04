import http from 'http';
import mongoose from 'mongoose';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './config/database';
import { ensureStorageDir } from './services/file.service';

async function bootstrap(): Promise<void> {
  ensureStorageDir();
  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);

  server.listen(env.PORT, () => {
    logger.info('server.started', { port: env.PORT, env: env.NODE_ENV });
  });

  const shutdown = async (signal: string) => {
    logger.info('server.shutdown_started', { signal });
    server.close(async () => {
      await disconnectDatabase();
      logger.info('server.stopped');
      process.exit(0);
    });
    // Do not hang forever if a connection refuses to close.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('process.unhandled_rejection', { reason: String(reason) });
  });
  process.on('uncaughtException', (error) => {
    logger.error('process.uncaught_exception', { error: error.message, stack: error.stack });
    void disconnectDatabase().finally(() => process.exit(1));
  });
}

mongoose.set('strictQuery', true);

bootstrap().catch((error: Error) => {
  logger.error('server.bootstrap_failed', { error: error.message, stack: error.stack });
  process.exit(1);
});