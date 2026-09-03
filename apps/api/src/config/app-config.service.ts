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
    poolSize: number;
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
      poolSize: this.config.getOrThrow('MYSQL_POOL_SIZE', { infer: true }),
      connectTimeoutMs: this.config.getOrThrow('MYSQL_CONNECT_TIMEOUT_MS', { infer: true }),
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
