import type { DataSource } from 'typeorm';

import type {
  ConnectionTestResult,
  CustomerDatabaseConnectionConfig,
} from './database-connector.types';

export interface DatabaseConnector {
  createDataSource(config: CustomerDatabaseConnectionConfig): Promise<DataSource>;
  testConnection(config: CustomerDatabaseConnectionConfig): Promise<ConnectionTestResult>;
  ping(dataSource: DataSource): Promise<void>;
  close(dataSource: DataSource): Promise<void>;
}
