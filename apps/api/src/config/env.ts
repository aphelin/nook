import { hostname } from 'node:os';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  /** Identifies this replica in health output and logs. */
  INSTANCE_ID: z.string().default(hostname()),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_S: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** A rotated token presented again within this window is a lost response, not theft (see TokensService). */
  REFRESH_REUSE_GRACE_S: z.coerce.number().int().nonnegative().default(30),
  /** Set true behind HTTPS. Local docker runs on plain http, so the default is false. */
  COOKIE_SECURE: z.stringbool().default(false),
  /** S3 as the api and worker reach it (inside the network). */
  S3_ENDPOINT: z.url().default('http://localhost:8333'),
  /** S3 as the browser reaches it: presigned URLs are signed for this host. */
  S3_PUBLIC_URL: z.url().default('http://localhost:8333'),
  S3_BUCKET: z.string().default('nook-uploads'),
  S3_ACCESS_KEY: z.string().default('nook'),
  S3_SECRET_KEY: z.string().default('nook-dev-secret'),
  S3_REGION: z.string().default('us-east-1'),
  /**
   * "Try the demo" on the landing page signs anyone in as this seeded, fictional account. Off unless
   * enabled; docker compose turns it on for the local demo. Never enable it where real people sign up.
   */
  DEMO_LOGIN: z.stringbool().default(false),
  DEMO_EMAIL: z.email().default('mara@nook.demo'),
  /** Sign-ups allowed per IP per hour. The browser test suite raises it for its own stack. */
  REGISTER_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(20),
  /** Tests only: let the unfurler reach a local page. Never set in a real deployment. */
  UNFURL_ALLOW_PRIVATE: z.stringbool().default(false),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
