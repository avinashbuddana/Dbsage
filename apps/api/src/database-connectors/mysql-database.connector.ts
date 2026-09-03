import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import type { AppConfigService } from '../config/app-config.service';
import { DatasourceConnectionError } from '../database-connections/datasource-connection.error';
import type { DatabaseConnector } from './database-connector.interface';
import type {
  ConnectionTestResult,
  CustomerDatabaseConnectionConfig,
} from './database-connector.types';

@Injectable()
export class MySqlDatabaseConnector implements DatabaseConnector {
  constructor(private readonly config: AppConfigService) {}

  async createDataSource(config: CustomerDatabaseConnectionConfig): Promise<DataSource> {
    const dataSource = new DataSource({
      type: 'mysql',
      connectorPackage: 'mysql2',
      host: config.host,
      port: config.port,
      database: config.databaseName,
      username: config.username,
      password: config.password,
      ssl: config.sslEnabled ? { rejectUnauthorized: true } : undefined,
      entities: [],
      synchronize: false,
      migrationsRun: false,
      logging: false,
      multipleStatements: false,
      connectTimeout: this.config.mysql.connectTimeoutMs,
      poolSize: this.config.mysql.poolSize,
    });
    try {
      return await dataSource.initialize();
    } catch (error) {
      if (dataSource.isInitialized) await dataSource.destroy();
      throw this.normalizeError(error);
    }
  }

  async testConnection(config: CustomerDatabaseConnectionConfig): Promise<ConnectionTestResult> {
    const startedAt = performance.now();
    let dataSource: DataSource;
    try {
      dataSource = await this.createDataSource(config);
    } catch (error) {
      throw this.normalizeError(error);
    }
    try {
      await this.ping(dataSource);
      return {
        success: true,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        databaseType: config.type,
      };
    } finally {
      await this.close(dataSource);
    }
  }

  async ping(dataSource: DataSource): Promise<void> {
    await dataSource.query('SELECT 1');
  }

  async close(dataSource: DataSource): Promise<void> {
    if (dataSource.isInitialized) await dataSource.destroy();
  }

  private normalizeError(error: unknown): DatasourceConnectionError {
    if (error instanceof DatasourceConnectionError) return error;
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : undefined;
    const normalizedCode = (() => {
      switch (code) {
        case 'ER_ACCESS_DENIED_ERROR':
          return 'DATASOURCE_AUTHENTICATION_FAILED' as const;
        case 'ECONNREFUSED':
          return 'DATASOURCE_CONNECTION_REFUSED' as const;
        case 'ETIMEDOUT':
        case 'PROTOCOL_SEQUENCE_TIMEOUT':
          return 'DATASOURCE_TIMEOUT' as const;
        case 'ER_BAD_DB_ERROR':
          return 'DATASOURCE_DATABASE_NOT_FOUND' as const;
        case 'HANDSHAKE_SSL_ERROR':
        case 'ERR_TLS_CERT_ALTNAME_INVALID':
        case 'DEPTH_ZERO_SELF_SIGNED_CERT':
          return 'DATASOURCE_TLS_ERROR' as const;
        default:
          return 'DATASOURCE_CONNECTION_FAILED' as const;
      }
    })();
    return new DatasourceConnectionError(normalizedCode, 'Customer database connection failed');
  }
}
