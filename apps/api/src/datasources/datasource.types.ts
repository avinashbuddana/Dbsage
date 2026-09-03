import type { CustomerDatabaseConnectionConfig } from '../database-connectors/database-connector.types';
import type { SshConnectionDto } from './dto/datasource.dto';
import type {
  DatasourceConnectionMode,
  DatasourceStatus,
  DatasourceType,
} from './enums/datasource.enums';

export interface DatasourceResponse {
  id: string;
  organizationId: string;
  name: string;
  databaseType: DatasourceType;
  connectionMode: DatasourceConnectionMode;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  sslEnabled: boolean;
  status: DatasourceStatus;
  lastConnectedAt: Date | null;
  lastConnectionErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CandidateConnectionInput {
  databaseType: DatasourceType;
  connectionMode: DatasourceConnectionMode;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  databasePassword: string;
  sslEnabled: boolean;
  ssh?: SshConnectionDto;
}

export type ResolvedCandidate = CustomerDatabaseConnectionConfig;
