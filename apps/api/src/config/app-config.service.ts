import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from './environment';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  get nodeEnv(): Environment['NODE_ENV'] {
    return this.config.getOrThrow('NODE_ENV', { infer: true });
  }

  get apiPort(): number {
    return this.config.getOrThrow('API_PORT', { infer: true });
  }

  get corsOrigins(): string[] {
    return this.config
      .getOrThrow('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((origin) => origin.trim());
  }

  get logLevel(): Environment['LOG_LEVEL'] {
    return this.config.getOrThrow('LOG_LEVEL', { infer: true });
  }

  get datasourceEncryptionKey(): string {
    return this.config.getOrThrow('DATASOURCE_ENCRYPTION_KEY', { infer: true });
  }

  get allowLocalDatasources(): boolean {
    return this.config.getOrThrow('ALLOW_LOCAL_DATASOURCES', { infer: true });
  }

  get mysql(): Readonly<{
    maxActiveDatasources: number;
    idleTimeoutMs: number;
    cleanupIntervalMs: number;
    customerPoolSize: number;
    connectTimeoutMs: number;
  }> {
    return {
      maxActiveDatasources: this.config.getOrThrow('MYSQL_MAX_ACTIVE_DATASOURCES', {
        infer: true,
      }),
      idleTimeoutMs: this.config.getOrThrow('MYSQL_DATASOURCE_IDLE_TIMEOUT_MS', { infer: true }),
      cleanupIntervalMs: this.config.getOrThrow('MYSQL_DATASOURCE_CLEANUP_INTERVAL_MS', {
        infer: true,
      }),
      customerPoolSize: this.config.getOrThrow('MYSQL_CUSTOMER_POOL_SIZE', { infer: true }),
      connectTimeoutMs: this.config.getOrThrow('MYSQL_CONNECT_TIMEOUT_MS', { infer: true }),
    };
  }

  get csvImport(): Readonly<{
    maxFileSizeBytes: number;
    syncMaxFileSizeBytes: number;
    queueThresholdBytes: number;
    maxColumns: number;
    maxHeaderLength: number;
    allowedDelimiters: readonly string[];
    tempDir: string;
    workerConcurrency: number;
    maxActiveJobs: number;
    jobTimeoutMs: number;
    retentionHours: number;
    cleanupIntervalMs: number;
    postgresPoolMax: number;
  }> {
    return {
      maxFileSizeBytes: this.config.getOrThrow('CSV_IMPORT_MAX_FILE_SIZE_BYTES', { infer: true }),
      syncMaxFileSizeBytes: this.config.getOrThrow('CSV_IMPORT_SYNC_MAX_FILE_SIZE_BYTES', {
        infer: true,
      }),
      queueThresholdBytes: this.config.getOrThrow('CSV_IMPORT_QUEUE_THRESHOLD_BYTES', {
        infer: true,
      }),
      maxColumns: this.config.getOrThrow('CSV_IMPORT_MAX_COLUMNS', { infer: true }),
      maxHeaderLength: this.config.getOrThrow('CSV_IMPORT_MAX_HEADER_LENGTH', { infer: true }),
      allowedDelimiters: Array.from(
        this.config.getOrThrow('CSV_IMPORT_ALLOWED_DELIMITERS', { infer: true }),
      ),
      tempDir: this.config.getOrThrow('CSV_IMPORT_TEMP_DIR', { infer: true }),
      workerConcurrency: this.config.getOrThrow('CSV_IMPORT_WORKER_CONCURRENCY', {
        infer: true,
      }),
      maxActiveJobs: this.config.getOrThrow('CSV_IMPORT_MAX_ACTIVE_JOBS', { infer: true }),
      jobTimeoutMs: this.config.getOrThrow('CSV_IMPORT_JOB_TIMEOUT_MS', { infer: true }),
      retentionHours: this.config.getOrThrow('CSV_IMPORT_RETENTION_HOURS', { infer: true }),
      cleanupIntervalMs: this.config.getOrThrow('CSV_IMPORT_CLEANUP_INTERVAL_MS', {
        infer: true,
      }),
      postgresPoolMax: this.config.getOrThrow('CSV_IMPORT_POSTGRES_POOL_MAX', {
        infer: true,
      }),
    };
  }

  get llm(): Readonly<{
    provider: 'ollama' | 'openrouter';
    apiKey?: string;
    baseUrl: string;
    openRouterModel: string;
    openRouterSupportsJsonSchema: boolean;
    reasoningModel: string;
    fallbackModels: readonly string[];
    temperature: number;
    maxOutputTokens: number;
    timeoutMs: number;
    maxRetries: number;
    maxConcurrency: number;
  }> {
    return {
      provider: this.config.getOrThrow('LLM_PROVIDER', { infer: true }),
      apiKey: this.config.get('OPENROUTER_API_KEY', { infer: true }),
      baseUrl: this.config.getOrThrow('OPENROUTER_BASE_URL', { infer: true }),
      openRouterModel: this.config.getOrThrow('OPENROUTER_MODEL', { infer: true }),
      openRouterSupportsJsonSchema: this.config.getOrThrow('OPENROUTER_SUPPORTS_JSON_SCHEMA', { infer: true }),
      reasoningModel: this.config.getOrThrow('LLM_REASONING_MODEL', { infer: true }),
      fallbackModels: this.config.getOrThrow('LLM_FALLBACK_MODELS', { infer: true }),
      temperature: this.config.getOrThrow('LLM_TEMPERATURE', { infer: true }),
      maxOutputTokens: this.config.getOrThrow('LLM_MAX_OUTPUT_TOKENS', { infer: true }),
      timeoutMs: this.config.getOrThrow('LLM_TIMEOUT_MS', { infer: true }),
      maxRetries: this.config.getOrThrow('LLM_MAX_RETRIES', { infer: true }),
      maxConcurrency: this.config.getOrThrow('LLM_MAX_CONCURRENCY', { infer: true }),
    };
  }

  get ollama(): Readonly<{
    baseUrl: string;
    model?: string;
    embeddingModel?: string;
    timeoutMs: number;
  }> {
    return {
      baseUrl: this.config.getOrThrow('OLLAMA_BASE_URL', { infer: true }),
      model: this.config.get('OLLAMA_MODEL', { infer: true }),
      embeddingModel: this.config.get('OLLAMA_EMBEDDING_MODEL', { infer: true }),
      timeoutMs: this.config.getOrThrow('OLLAMA_TIMEOUT_MS', { infer: true }),
    };
  }

  get embedding(): Readonly<{
    provider: 'ollama';
    dimensions: number;
    maxBatchSize: number;
    maxConcurrency: number;
    timeoutMs: number;
  }> {
    return {
      provider: this.config.getOrThrow('EMBEDDING_PROVIDER', { infer: true }),
      dimensions: this.config.getOrThrow('EMBEDDING_DIMENSIONS', { infer: true }),
      maxBatchSize: this.config.getOrThrow('EMBEDDING_MAX_BATCH_SIZE', { infer: true }),
      maxConcurrency: this.config.getOrThrow('EMBEDDING_MAX_CONCURRENCY', { infer: true }),
      timeoutMs: this.config.getOrThrow('EMBEDDING_TIMEOUT_MS', { infer: true }),
    };
  }

  get knowledge(): Readonly<{ autoRefreshOnSchemaChange: boolean }> {
    return {
      autoRefreshOnSchemaChange: this.config.getOrThrow(
        'KNOWLEDGE_AUTO_REFRESH_ON_SCHEMA_CHANGE',
        { infer: true },
      ),
    };
  }

  get databaseContext(): Readonly<{
    maxRelationshipDepth: number;
    maxItems: number;
    maxEstimatedTokens: number;
    maxTables: number;
    maxColumnsPerTable: number;
    maxRelationships: number;
    maxFindings: number;
    maxKnowledge: number;
    minVectorSimilarity: number;
  }> {
    return {
      maxRelationshipDepth: this.config.getOrThrow('DATABASE_CONTEXT_MAX_RELATIONSHIP_DEPTH', {
        infer: true,
      }),
      maxItems: this.config.getOrThrow('DATABASE_CONTEXT_MAX_ITEMS', { infer: true }),
      maxEstimatedTokens: this.config.getOrThrow('DATABASE_CONTEXT_MAX_ESTIMATED_TOKENS', {
        infer: true,
      }),
      maxTables: this.config.getOrThrow('DATABASE_CONTEXT_MAX_TABLES', { infer: true }),
      maxColumnsPerTable: this.config.getOrThrow('DATABASE_CONTEXT_MAX_COLUMNS_PER_TABLE', {
        infer: true,
      }),
      maxRelationships: this.config.getOrThrow('DATABASE_CONTEXT_MAX_RELATIONSHIPS', {
        infer: true,
      }),
      maxFindings: this.config.getOrThrow('DATABASE_CONTEXT_MAX_FINDINGS', { infer: true }),
      maxKnowledge: this.config.getOrThrow('DATABASE_CONTEXT_MAX_KNOWLEDGE', { infer: true }),
      minVectorSimilarity: this.config.getOrThrow('DATABASE_CONTEXT_MIN_VECTOR_SIMILARITY', {
        infer: true,
      }),
    };
  }

  get sql(): Readonly<{
    maxTables: number;
    maxJoins: number;
    maxSubqueryDepth: number;
    maxFilterDepth: number;
    maxGroupByColumns: number;
    maxOrderByColumns: number;
    maxLimit: number;
    defaultLimit: number;
    maxOffset: number;
    allowCtes: boolean;
    allowDistinct: boolean;
  }> {
    return {
      maxTables: this.config.getOrThrow('SQL_MAX_TABLES', { infer: true }),
      maxJoins: this.config.getOrThrow('SQL_MAX_JOINS', { infer: true }),
      maxSubqueryDepth: this.config.getOrThrow('SQL_MAX_SUBQUERY_DEPTH', { infer: true }),
      maxFilterDepth: this.config.getOrThrow('SQL_MAX_FILTER_DEPTH', { infer: true }),
      maxGroupByColumns: this.config.getOrThrow('SQL_MAX_GROUP_BY_COLUMNS', { infer: true }),
      maxOrderByColumns: this.config.getOrThrow('SQL_MAX_ORDER_BY_COLUMNS', { infer: true }),
      maxLimit: this.config.getOrThrow('SQL_MAX_LIMIT', { infer: true }),
      defaultLimit: this.config.getOrThrow('SQL_DEFAULT_LIMIT', { infer: true }),
      maxOffset: this.config.getOrThrow('SQL_MAX_OFFSET', { infer: true }),
      allowCtes: this.config.getOrThrow('SQL_ALLOW_CTES', { infer: true }),
      allowDistinct: this.config.getOrThrow('SQL_ALLOW_DISTINCT', { infer: true }),
    };
  }

  get database(): Readonly<{
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    ssl: boolean;
  }> {
    return {
      host: this.config.getOrThrow('DATABASE_HOST', { infer: true }),
      port: this.config.getOrThrow('DATABASE_PORT', { infer: true }),
      name: this.config.getOrThrow('DATABASE_NAME', { infer: true }),
      user: this.config.getOrThrow('DATABASE_USER', { infer: true }),
      password: this.config.getOrThrow('DATABASE_PASSWORD', { infer: true }),
      ssl: this.config.getOrThrow('DATABASE_SSL', { infer: true }),
    };
  }

  get redis(): Readonly<{ host: string; port: number; password?: string }> {
    const password = this.config.get('REDIS_PASSWORD', { infer: true });

    return {
      host: this.config.getOrThrow('REDIS_HOST', { infer: true }),
      port: this.config.getOrThrow('REDIS_PORT', { infer: true }),
      ...(password === undefined ? {} : { password }),
    };
  }
}
