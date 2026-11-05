import { createResumeMatchService } from './services/resumeMatchService.js';
import { resumeMatchRoutes } from './routes/resumeMatch.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { config } from './config/env.js';
import { OpportunityService } from './services/opportunityService.js';
import { opportunityRoutes } from './routes/opportunities.js';
import { adminRoutes } from './routes/admin.js';
import { AdminOpportunityService } from './services/adminOpportunityService.js';
import { createAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp({ opportunityRepo, authVerifier, logger } = {}) {
  const log =
    logger ||
    pino({
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // correct client IPs behind one hosting proxy

  app.use(pinoHttp({ logger: log }));
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // No Origin header = mobile app, curl, server-to-server: allowed.
        if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.use(
    '/api/',
    rateLimit({
      windowMs: 60_000,
      limit: config.NODE_ENV === 'test' ? 10_000 : 120,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, res) =>
        res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down.' } }),
    }),
  );

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  const service = new OpportunityService(opportunityRepo);
  app.use('/api/v1/opportunities', opportunityRoutes(service));

  if (authVerifier) {
    const adminService = new AdminOpportunityService(opportunityRepo);
    const auth = createAuth(authVerifier);
    app.use('/api/v1/admin', adminRoutes(adminService, auth));
    app.use('/api/v1', resumeMatchRoutes(createResumeMatchService({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.AI_MODEL || 'claude-haiku-5-5' }), auth));
    app.get('/api/v1/me', auth.authenticate, (req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json({ data: { uid: req.user.uid, email: req.user.email, role: req.user.role, plan: req.user.plan } });
    });
  } else {
    app.use('/api/v1/admin', (_req, res) =>
      res.status(503).json({
        error: { code: 'ADMIN_UNAVAILABLE', message: 'Admin API needs Firebase Auth (use DATA_STORE=firestore).' },
      }),
    );
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
