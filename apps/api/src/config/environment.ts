import { z } from 'zod';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const booleanFromString = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const csvImportTempDir = join(tmpdir(), 'schemaiq-imports');

const csvImportDelimiters = z
  .string()
  .min(1)
  .max(16)
  .refine(
    (value) => {
      const delimiters = Array.from(value);
      return (
        delimiters.every(
          (delimiter) =>
            Buffer.byteLength(delimiter) === 1 && !['\r', '\n', '"', "'", '\\'].includes(delimiter),
        ) &&
        new Set(delimiters).size === delimiters.length
      );
    },
    'CSV import delimiters must be unique single characters',
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
    CSV_IMPORT_MAX_FILE_SIZE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .default(1_073_741_824),
    CSV_IMPORT_SYNC_MAX_FILE_SIZE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .default(5_242_880),
    CSV_IMPORT_QUEUE_THRESHOLD_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .default(5_242_880),
    CSV_IMPORT_MAX_COLUMNS: z.coerce.number().int().positive().max(1_000).default(200),
    CSV_IMPORT_MAX_HEADER_LENGTH: z.coerce.number().int().positive().max(1_024).default(256),
    CSV_IMPORT_ALLOWED_DELIMITERS: csvImportDelimiters.default(',;|\t'),
    CSV_IMPORT_TEMP_DIR: z.string().min(1).default(csvImportTempDir),
    CSV_IMPORT_WORKER_CONCURRENCY: z.coerce.number().int().positive().max(8).default(2),
    CSV_IMPORT_MAX_ACTIVE_JOBS: z.coerce.number().int().positive().max(10_000).default(100),
    CSV_IMPORT_JOB_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(14_400_000)
      .default(1_800_000),
    CSV_IMPORT_RETENTION_HOURS: z.coerce.number().int().positive().max(720).default(24),
    CSV_IMPORT_CLEANUP_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(86_400_000)
      .default(3_600_000),
    CSV_IMPORT_POSTGRES_POOL_MAX: z.coerce.number().int().positive().max(10).default(3),
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
    if (environment.NODE_ENV === 'production' && environment.ALLOW_LOCAL_DATASOURCES) {
      context.addIssue({
        code: 'custom',
        path: ['ALLOW_LOCAL_DATASOURCES'],
        message: 'Local datasource targets are forbidden in production',
      });
    }
    if (environment.CSV_IMPORT_SYNC_MAX_FILE_SIZE_BYTES > environment.CSV_IMPORT_MAX_FILE_SIZE_BYTES) {
      context.addIssue({
        code: 'custom',
        path: ['CSV_IMPORT_SYNC_MAX_FILE_SIZE_BYTES'],
        message: 'Synchronous CSV import size cannot exceed the maximum file size',
      });
    }
    if (environment.CSV_IMPORT_QUEUE_THRESHOLD_BYTES > environment.CSV_IMPORT_SYNC_MAX_FILE_SIZE_BYTES) {
      context.addIssue({
        code: 'custom',
        path: ['CSV_IMPORT_QUEUE_THRESHOLD_BYTES'],
        message: 'CSV import queue threshold cannot exceed the synchronous size limit',
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
