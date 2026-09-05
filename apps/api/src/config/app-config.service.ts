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
