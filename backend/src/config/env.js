import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  DATA_STORE: z.enum(['memory', 'firestore']).default('memory'),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;
const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);

if (env.NODE_ENV === 'production') {
  if (corsOrigins.includes('*')) {
    console.error('CORS_ORIGINS must not contain "*" in production.');
    process.exit(1);
  }
  if (env.DATA_STORE !== 'firestore') {
    console.error('DATA_STORE must be "firestore" in production.');
    process.exit(1);
  }
}

export const config = { ...env, corsOrigins };
