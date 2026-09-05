import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import type { CustomerDatabaseConnectionConfig } from '../database-connectors/database-connector.types';
import {
  CREDENTIAL_PROVIDER,
  type CredentialProvider,
} from '../credentials/credential-provider.interface';
import { DatasourceSshConfigEntity } from '../datasources/entities/datasource-ssh-config.entity';
import { DatasourceEntity } from '../datasources/entities/datasource.entity';
import {
  DatasourceConnectionMode,
  DatasourceSecretType,
  SshAuthenticationType,
} from '../datasources/enums/datasource.enums';
import { DatasourceNetworkPolicyService } from '../network/datasource-network-policy.service';
import { DatasourceConnectionError } from './datasource-connection.error';

@Injectable()
export class DatasourceConfigResolver {
  constructor(
    @InjectRepository(DatasourceEntity)
    private readonly datasourceRepository: Repository<DatasourceEntity>,
    @InjectRepository(DatasourceSshConfigEntity)
    private readonly sshRepository: Repository<DatasourceSshConfigEntity>,
    @Inject(CREDENTIAL_PROVIDER) private readonly credentials: CredentialProvider,
    private readonly networkPolicy: DatasourceNetworkPolicyService,
  ) {}

  async resolve(
    organizationId: string,
    datasourceId: string,
  ): Promise<CustomerDatabaseConnectionConfig> {
    const datasource = await this.datasourceRepository.findOne({
      where: { id: datasourceId, organizationId },
    });
    if (!datasource) throw this.unavailable();
    const secrets = await this.credentials.getCredentials(datasourceId);
    const password = secrets[DatasourceSecretType.DatabasePassword];
    if (!password) throw this.unavailable();

    const host =
      datasource.connectionMode === DatasourceConnectionMode.Direct
        ? await this.networkPolicy.validateTarget(datasource.host)
        : this.networkPolicy.validateRemoteTarget(datasource.host);
    const config: CustomerDatabaseConnectionConfig = {
      datasourceId,
      organizationId,
      type: datasource.databaseType,
      connectionMode: datasource.connectionMode,
      status: datasource.status,
      host,
      port: datasource.port,
      databaseName: datasource.databaseName,
      username: datasource.username,
      password,
      sslEnabled: datasource.sslEnabled,
    };
    if (datasource.connectionMode === DatasourceConnectionMode.SshTunnel) {
      config.ssh = await this.resolveSsh(datasourceId, secrets);
    }
    return config;
  }

  private async resolveSsh(
    datasourceId: string,
    secrets: Awaited<ReturnType<CredentialProvider['getCredentials']>>,
  ): Promise<NonNullable<CustomerDatabaseConnectionConfig['ssh']>> {
    const ssh = await this.sshRepository.findOne({ where: { datasourceId } });
    if (!ssh) throw this.unavailable();
    const host = await this.networkPolicy.validateTarget(ssh.sshHost);
    if (ssh.authenticationType === SshAuthenticationType.Password) {
      const password = secrets[DatasourceSecretType.SshPassword];
      if (!password) throw this.unavailable();
      return {
        host,
        port: ssh.sshPort,
        username: ssh.sshUsername,
        authenticationType: ssh.authenticationType,
        password,
      };
    }
    const privateKey = secrets[DatasourceSecretType.SshPrivateKey];
    if (!privateKey) throw this.unavailable();
    const privateKeyPassphrase = secrets[DatasourceSecretType.SshPrivateKeyPassphrase];
    return {
      host,
      port: ssh.sshPort,
      username: ssh.sshUsername,
      authenticationType: ssh.authenticationType,
      privateKey,
      ...(privateKeyPassphrase ? { privateKeyPassphrase } : {}),
    };
  }

  private unavailable(): DatasourceConnectionError {
    return new DatasourceConnectionError(
      'DATASOURCE_CONNECTION_FAILED',
      'Datasource connection is unavailable',
    );
  }
}
