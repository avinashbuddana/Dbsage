export type DatasourceErrorCode =
  | 'DATASOURCE_AUTHENTICATION_FAILED'
  | 'DATASOURCE_CONNECTION_REFUSED'
  | 'DATASOURCE_TIMEOUT'
  | 'DATASOURCE_DATABASE_NOT_FOUND'
  | 'DATASOURCE_TLS_ERROR'
  | 'DATASOURCE_NETWORK_BLOCKED'
  | 'SSH_AUTHENTICATION_FAILED'
  | 'SSH_CONNECTION_REFUSED'
  | 'SSH_TIMEOUT'
  | 'SSH_TUNNEL_FAILED'
  | 'DATASOURCE_DISABLED'
  | 'DATASOURCE_CONNECTION_FAILED'
  | 'DATASOURCE_RESOURCE_LIMIT';

export class DatasourceConnectionError extends Error {
  constructor(
    readonly code: DatasourceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DatasourceConnectionError';
  }
}
