import type { EntityManager } from 'typeorm';

import type { DatasourceSecretType } from '../datasources/enums/datasource.enums';

export type DatasourceSecrets = Partial<Record<DatasourceSecretType, string>>;

export const CREDENTIAL_PROVIDER = Symbol('CREDENTIAL_PROVIDER');

export interface CredentialProvider {
  saveCredentials(
    datasourceId: string,
    credentials: DatasourceSecrets,
    manager?: EntityManager,
  ): Promise<void>;
  getCredentials(datasourceId: string, manager?: EntityManager): Promise<DatasourceSecrets>;
  updateCredentials(
    datasourceId: string,
    credentials: DatasourceSecrets,
    manager?: EntityManager,
  ): Promise<void>;
  deleteCredentials(
    datasourceId: string,
    manager?: EntityManager,
    types?: readonly DatasourceSecretType[],
  ): Promise<void>;
}
