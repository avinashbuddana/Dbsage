import type { Repository } from 'typeorm';

import type { CredentialProvider } from '../credentials/credential-provider.interface';
import { DatasourceSshConfigEntity } from '../datasources/entities/datasource-ssh-config.entity';
import { DatasourceEntity } from '../datasources/entities/datasource.entity';
import {
  DatasourceConnectionMode,
  DatasourceSecretType,
  DatasourceStatus,
  DatasourceType,
} from '../datasources/enums/datasource.enums';
import type { DatasourceNetworkPolicyService } from '../network/datasource-network-policy.service';
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
    } as unknown as Repository<DatasourceEntity>;
    const sshRepository = {} as Repository<DatasourceSshConfigEntity>;
    const credentials = {
      getCredentials: jest.fn().mockResolvedValue({
        [DatasourceSecretType.DatabasePassword]: 'database-password',
      }),
    } as unknown as CredentialProvider;
    const network = {
      validateTarget: jest.fn(async (host: string) => host),
    } as unknown as DatasourceNetworkPolicyService;
    const resolver = new DatasourceConfigResolver(
      repository,
      sshRepository,
      credentials,
      network,
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
});
