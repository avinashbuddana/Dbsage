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

const optionalOllamaModel = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const ollamaBaseUrl = z
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === 'http:' &&
      ['127.0.0.1', '::1', 'localhost'].includes(url.hostname)
    );
  }, 'Ollama base URL must use loopback HTTP')
  .default('http://127.0.0.1:11434');

const modelList = z.preprocess(
  (value) => {
    if (value === undefined || value === '') return [];
    if (typeof value !== 'string') return value;

    return value.split(',').map((model) => model.trim());
  },
  z.array(z.string().min(1)).max(3).refine((models) => new Set(models).size === models.length, {
    message: 'LLM fallback models must be unique',
  }),
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
    MYSQL_CUSTOMER_POOL_SIZE: z.coerce.number().int().positive().max(10).default(3),
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
    LLM_PROVIDER: z.enum(['ollama', 'openrouter']).default('openrouter'),
    OPENROUTER_API_KEY: optionalSecret,
    OPENROUTER_BASE_URL: z
      .url()
      .refine((value) => new URL(value).protocol === 'https:', 'OpenRouter base URL must use HTTPS')
      .default('https://openrouter.ai/api/v1'),
    OPENROUTER_MODEL: z.string().min(1).default('nvidia/nemotron-3.5-lightning'),
    OPENROUTER_SUPPORTS_JSON_SCHEMA: booleanFromString.default(true),
    LLM_REASONING_MODEL: z.string().min(1).default('nvidia/nemotron-3-super-120b-a12b'),
    LLM_FALLBACK_MODELS: modelList.default([]),
    LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),
    LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().max(131_072).default(2_048),
    LLM_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
    LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(2),
    LLM_MAX_CONCURRENCY: z.coerce.number().int().positive().max(32).default(4),
    OLLAMA_BASE_URL: ollamaBaseUrl,
    OLLAMA_MODEL: optionalOllamaModel,
    OLLAMA_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(120_000),
    EMBEDDING_PROVIDER: z.literal('ollama').default('ollama'),
    OLLAMA_EMBEDDING_MODEL: optionalOllamaModel,
    EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().max(16_000).default(768),
    EMBEDDING_MAX_BATCH_SIZE: z.coerce.number().int().positive().max(128).default(16),
    EMBEDDING_MAX_CONCURRENCY: z.coerce.number().int().positive().max(16).default(2),
    EMBEDDING_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(120_000),
    KNOWLEDGE_AUTO_REFRESH_ON_SCHEMA_CHANGE: booleanFromString.default(false),
    DATABASE_CONTEXT_MAX_RELATIONSHIP_DEPTH: z.coerce.number().int().min(1).max(2).default(1),
    DATABASE_CONTEXT_MAX_ITEMS: z.coerce.number().int().positive().max(100).default(30),
    DATABASE_CONTEXT_MAX_ESTIMATED_TOKENS: z.coerce.number().int().positive().max(8_000).default(1_000),
    DATABASE_CONTEXT_MAX_TABLES: z.coerce.number().int().positive().max(20).default(8),
    DATABASE_CONTEXT_MAX_COLUMNS_PER_TABLE: z.coerce.number().int().positive().max(50).default(12),
    DATABASE_CONTEXT_MAX_RELATIONSHIPS: z.coerce.number().int().positive().max(50).default(16),
    DATABASE_CONTEXT_MAX_FINDINGS: z.coerce.number().int().positive().max(30).default(10),
    DATABASE_CONTEXT_MAX_KNOWLEDGE: z.coerce.number().int().positive().max(40).default(16),
    DATABASE_CONTEXT_MIN_VECTOR_SIMILARITY: z.coerce.number().min(0).max(1).default(0.45),
    SQL_MAX_TABLES: z.coerce.number().int().positive().max(8).default(4),
    SQL_MAX_JOINS: z.coerce.number().int().min(0).max(7).default(3),
    SQL_MAX_SUBQUERY_DEPTH: z.coerce.number().int().min(0).max(3).default(0),
    SQL_MAX_FILTER_DEPTH: z.coerce.number().int().positive().max(6).default(3),
    SQL_MAX_GROUP_BY_COLUMNS: z.coerce.number().int().positive().max(12).default(5),
    SQL_MAX_ORDER_BY_COLUMNS: z.coerce.number().int().positive().max(12).default(5),
    SQL_MAX_LIMIT: z.coerce.number().int().positive().max(10_000).default(1_000),
    SQL_DEFAULT_LIMIT: z.coerce.number().int().positive().max(10_000).default(100),
    SQL_MAX_OFFSET: z.coerce.number().int().min(0).max(1_000_000).default(10_000),
    SQL_ALLOW_CTES: booleanFromString.default(false),
    SQL_ALLOW_DISTINCT: booleanFromString.default(true),
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
    if (environment.LLM_FALLBACK_MODELS.includes(environment.OPENROUTER_MODEL)) {
      context.addIssue({
        code: 'custom',
        path: ['LLM_FALLBACK_MODELS'],
        message: 'LLM fallback models cannot include the OpenRouter model',
      });
    }
    if (environment.LLM_PROVIDER === 'openrouter' && !environment.OPENROUTER_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['OPENROUTER_API_KEY'],
        message: 'OpenRouter API key is required when OpenRouter is selected',
      });
    }
    if (environment.LLM_PROVIDER === 'ollama' && !environment.OLLAMA_MODEL) {
      context.addIssue({
        code: 'custom',
        path: ['OLLAMA_MODEL'],
        message: 'Ollama model is required when Ollama is selected',
      });
    }
    if (!environment.OLLAMA_EMBEDDING_MODEL) {
      context.addIssue({
        code: 'custom',
        path: ['OLLAMA_EMBEDDING_MODEL'],
        message: 'Ollama embedding model is required when Ollama embeddings are selected',
      });
    }
    if (environment.SQL_DEFAULT_LIMIT > environment.SQL_MAX_LIMIT) {
      context.addIssue({
        code: 'custom',
        path: ['SQL_DEFAULT_LIMIT'],
        message: 'SQL default limit cannot exceed the maximum limit',
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
