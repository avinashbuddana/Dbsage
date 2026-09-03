import type { SshAuthenticationType } from '../datasources/enums/datasource.enums';
import {
  DatasourceConnectionMode,
  DatasourceStatus,
  DatasourceType,
} from '../datasources/enums/datasource.enums';

export interface SshConnectionConfig {
  host: string;
  port: number;
  username: string;
  authenticationType: SshAuthenticationType;
  password?: string;
  privateKey?: string;
  privateKeyPassphrase?: string;
}

export interface CustomerDatabaseConnectionConfig {
  datasourceId: string;
  organizationId: string;
  type: DatasourceType;
  connectionMode: DatasourceConnectionMode;
  status: DatasourceStatus;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password: string;
  sslEnabled: boolean;
  ssh?: SshConnectionConfig;
}

export interface ConnectionTestResult {
  success: true;
  latencyMs: number;
  databaseType: DatasourceType;
}
