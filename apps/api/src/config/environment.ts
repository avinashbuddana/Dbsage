import { z } from 'zod';

const booleanFromString = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

function isOriginList(value: string): boolean {
  return value.split(',').every((origin) => {
    const candidate = origin.trim();
    if (candidate === '*') return true;

    try {
      new URL(candidate);
      return true;
    } catch {
      return false;
    }
  });
}

function isBase64Key(value: string): boolean {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return false;

  return Buffer.from(value, 'base64').byteLength === 32;
}

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().max(65_535).default(3001),
    WEB_PORT: z.coerce.number().int().positive().max(65_535).default(3000),
    DATABASE_HOST: z.string().min(1),
    DATABASE_PORT: z.coerce.number().int().positive().max(65_535).default(5432),
    DATABASE_NAME: z.string().min(1),
    DATABASE_USER: z.string().min(1),
    DATABASE_PASSWORD: z.string().min(1),
    DATABASE_SSL: booleanFromString.default(false),
    REDIS_HOST: z.string().min(1),
    REDIS_PORT: z.coerce.number().int().positive().max(65_535).default(6379),
    REDIS_PASSWORD: optionalSecret,
    JWT_SECRET: z.string().min(32),
    ENCRYPTION_KEY: z.string().min(32),
    DATASOURCE_ENCRYPTION_KEY: z.string().refine(isBase64Key),
    MYSQL_MAX_ACTIVE_DATASOURCES: z.coerce.number().int().positive().max(100).default(10),
    MYSQL_DATASOURCE_IDLE_TIMEOUT_MS: z.coerce.number().int().min(10_000).default(300_000),
    MYSQL_DATASOURCE_CLEANUP_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .default(60_000),
    MYSQL_POOL_SIZE: z.coerce.number().int().positive().max(10).default(3),
    MYSQL_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(5_000),
    ALLOW_LOCAL_DATASOURCES: booleanFromString.default(false),
    CORS_ORIGIN: z.string().min(1).refine(isOriginList),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === 'production' &&
      environment.CORS_ORIGIN.split(',').some((origin) => origin.trim() === '*')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGIN'],
        message: 'Wildcard CORS is forbidden in production',
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    const invalidKeys = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(
      ', ',
    );
    throw new Error(`Invalid environment configuration: ${invalidKeys}`);
  }

  return result.data;
}
