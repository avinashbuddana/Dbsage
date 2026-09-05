import type { Repository } from 'typeorm';

import type { CredentialProvider } from '../credentials/credential-provider.interface';
import type { DatasourceSshConfigEntity } from '../datasources/entities/datasource-ssh-config.entity';
import { DatasourceEntity } from '../datasources/entities/datasource.entity';
import {
  DatasourceConnectionMode,
  DatasourceSecretType,
  DatasourceStatus,
  DatasourceType,
} from '../datasources/enums/datasource.enums';
import type { DatasourceNetworkPolicyService } from '../network/datasource-network-policy.service';
import { DatasourceConnectionError } from './datasource-connection.error';
import { DatasourceConfigResolver } from './datasource-config.resolver';

describe('DatasourceConfigResolver', () => {
  it('loads organization-scoped metadata and decrypts the password just in time', async () => {
    const organizationId = crypto.randomUUID();
    const datasourceId = crypto.randomUUID();
    const datasource = Object.assign(new DatasourceEntity(), {
      id: datasourceId,
      organizationId,
      databaseType: DatasourceType.MySql,
      connectionMode: DatasourceConnectionMode.Direct,
      status: DatasourceStatus.Active,
      host: 'db.example.com',
      port: 3306,
      databaseName: 'app',
      username: 'reader',
      sslEnabled: true,
    });
    const repository = {
      findOne: jest.fn().mockResolvedValue(datasource),
    };
    const sshRepository = {};
    const credentials = {
      getCredentials: jest.fn().mockResolvedValue({
        [DatasourceSecretType.DatabasePassword]: 'database-password',
      }),
    };
    const network = {
      validateTarget: jest.fn((host: string) => Promise.resolve(host)),
    };
    const resolver = new DatasourceConfigResolver(
      repository as unknown as Repository<DatasourceEntity>,
      sshRepository as unknown as Repository<DatasourceSshConfigEntity>,
      credentials as unknown as CredentialProvider,
      network as unknown as DatasourceNetworkPolicyService,
    );

    await expect(resolver.resolve(organizationId, datasourceId)).resolves.toMatchObject({
      datasourceId,
      organizationId,
      password: 'database-password',
    });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: datasourceId, organizationId },
    });
  });

  it('does not decrypt credentials for a disabled datasource', async () => {
    const datasource = Object.assign(new DatasourceEntity(), {
      id: crypto.randomUUID(),
      organizationId: crypto.randomUUID(),
      status: DatasourceStatus.Disabled,
    });
    const repository = { findOne: jest.fn().mockResolvedValue(datasource) };
    const credentials = { getCredentials: jest.fn() };
    const resolver = new DatasourceConfigResolver(
      repository as unknown as Repository<DatasourceEntity>,
      {} as Repository<DatasourceSshConfigEntity>,
      credentials as unknown as CredentialProvider,
      {} as DatasourceNetworkPolicyService,
    );

    await expect(resolver.resolve(datasource.organizationId, datasource.id)).rejects.toEqual(
      new DatasourceConnectionError('DATASOURCE_DISABLED', 'Datasource is disabled'),
    );
    expect(credentials.getCredentials).not.toHaveBeenCalled();
  });
});
