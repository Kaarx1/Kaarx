import { config } from 'dotenv';
import { z } from 'zod';

if (process.env.NODE_ENV !== 'test') config({ quiet: true });

const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    PROCESS_ROLE: z.enum(['api', 'worker', 'all']).default('all'),
    DATABASE_URL: z.string().min(1),
    DATABASE_SSL: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    REDIS_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_SEC: z.coerce.number().int().positive().default(900),
    REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
    OTP_MODE: z.enum(['fixed', 'sms']).default('fixed'),
    MSG91_AUTH_KEY: optionalString,
    MSG91_OTP_TEMPLATE_ID: optionalString,
    ROUTING_PROVIDER: z.enum(['haversine', 'ola']).default('haversine'),
    OLA_MAPS_API_KEY: optionalString,
    STORAGE_ENDPOINT: z.url(),
    STORAGE_REGION: z.string().min(1).default('ap-south-1'),
    STORAGE_BUCKET: z.string().min(1),
    STORAGE_ACCESS_KEY_ID: z.string().min(1),
    STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      ),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV === 'production' && e.OTP_MODE === 'fixed') {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_MODE'],
        message: 'OTP_MODE=fixed is not allowed in production',
      });
    }
    if (e.OTP_MODE === 'sms' && (!e.MSG91_AUTH_KEY || !e.MSG91_OTP_TEMPLATE_ID)) {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_MODE'],
        message: 'OTP_MODE=sms requires MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID',
      });
    }
    if (e.ROUTING_PROVIDER === 'ola' && !e.OLA_MAPS_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['ROUTING_PROVIDER'],
        message: 'ROUTING_PROVIDER=ola requires OLA_MAPS_API_KEY',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return result.data;
}

export const env: Env = parseEnv(process.env);

export const runsWorker = env.PROCESS_ROLE !== 'api';
