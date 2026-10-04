import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { env } from './config/env';
import { logger } from './config/logger';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimit';

export function createApp(): Application {
  const app = express();

  // Required for correct client IPs and rate limiting behind a proxy/load balancer.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Baseline security headers. CSP is intentionally not locked down here because
  // the API only serves JSON, but the defaults still add useful protection.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));

  // Only the configured frontends may call the API.
  app.use(
    cors({
      origin(origin, callback) {
        // Allow server-to-server / tooling requests that send no Origin header.
        if (!origin) return callback(null, true);
        if (env.clientUrls.includes(origin)) return callback(null, true);
        logger.warn('cors.blocked_origin', { origin });
        return callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Support-Session'],
      exposedHeaders: ['Content-Disposition'],
      maxAge: 86400,
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Correlation id for structured logs; never derived from user input.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.requestId = crypto.randomUUID();
    next();
  });

  // Small request log (method, path, status, duration) without sensitive bodies.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.debug('http.request', {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - start,
        userId: req.user?.id,
      });
    });
    next();
  });

  app.use('/api', apiRateLimiter, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;