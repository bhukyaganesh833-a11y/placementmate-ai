import { ZodError } from 'zod';
import { config } from '../config/env.js';

// Every error leaves the API in one shape: { error: { code, message, details? } }
export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  const status = Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) {
    req.log?.error({ err }, 'Unhandled error');
  }
  res.status(status).json({
    error: {
      code: err.code && status < 500 ? err.code : status >= 500 ? 'INTERNAL_ERROR' : 'ERROR',
      // Never leak internals for 5xx, even in development logs go to pino.
      message: status >= 500 ? 'Something went wrong' : err.message,
      ...(err.details ? { details: err.details } : {}),
      ...(status >= 500 && config.NODE_ENV === 'development' ? { debug: err.message } : {}),
    },
  });
}
