import type { DataSource, EntityManager, Repository } from 'typeorm';

import type { AuditService } from '../audit/audit.service';
import type { CredentialProvider } from '../credentials/credential-provider.interface';
import type { DatabaseConnectionManager } from '../database-connections/database-connection.manager';
import { DatasourceConnectionError } from '../database-connections/datasource-connection.error';
import type { DatasourceNetworkPolicyService } from '../network/datasource-network-policy.service';
import { CreateDatasourceDto } from './dto/datasource.dto';
import { DatasourceSshConfigEntity } from './entities/datasource-ssh-config.entity';
import { DatasourceEntity } from './entities/datasource.entity';
import {
  DatasourceConnectionMode,
  DatasourceSecretType,
  DatasourceStatus,
  DatasourceType,
} from './enums/datasource.enums';
import { DatasourcesService } from './datasources.service';

const organizationId = crypto.randomUUID();
const input = Object.assign(new CreateDatasourceDto(), {
  name: 'Production reporting',
  databaseType: DatasourceType.MySql,
  connectionMode: DatasourceConnectionMode.Direct,
  host: 'db.example.com',
  port: 3306,
  databaseName: 'reporting',
  username: 'schemaiq_reader',
  databasePassword: 'database-password',
  sslEnabled: true,
});

function setup() {
  const datasourceRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  } as unknown as Repository<DatasourceEntity>;
  const sshRepository = {} as Repository<DatasourceSshConfigEntity>;
  const transactionalDatasourceRepository = {
    create: jest.fn((value) => Object.assign(new DatasourceEntity(), value)),
    save: jest.fn(async (value: DatasourceEntity) =>
      Object.assign(value, {
        id: crypto.randomUUID(),
        createdAt: new Date('2026-09-03T00:00:00Z'),
        updatedAt: new Date('2026-09-03T00:00:00Z'),
      }),
    ),
  };
  const transactionalSshRepository = {
    create: jest.fn((value) => Object.assign(new DatasourceSshConfigEntity(), value)),
    save: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === DatasourceEntity ? transactionalDatasourceRepository : transactionalSshRepository,
    ),
  } as unknown as EntityManager;
  const database = {
    transaction: jest.fn(async (callback: (entityManager: EntityManager) => Promise<unknown>) =>
      callback(manager),
    ),
  } as unknown as DataSource;
  const credentials = {
    saveCredentials: jest.fn(),
    getCredentials: jest.fn(),
    updateCredentials: jest.fn(),
    deleteCredentials: jest.fn(),
  } as unknown as CredentialProvider;
  const connectionManager = {
    testConfig: jest.fn().mockResolvedValue({
      success: true,
      latencyMs: 5,
      databaseType: DatasourceType.MySql,
    }),
    invalidateDatasource: jest.fn(),
  } as unknown as DatabaseConnectionManager;
  const networkPolicy = {
    validateTarget: jest.fn(async (host: string) => host),
    validateRemoteTarget: jest.fn((host: string) => host),
  } as unknown as DatasourceNetworkPolicyService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const service = new DatasourcesService(
    datasourceRepository,
    sshRepository,
    database,
    credentials,
    connectionManager,
    networkPolicy,
    audit,
  );

  return {
    connectionManager,
    credentials,
    database,
    datasourceRepository,
    service,
  };
}

describe('DatasourcesService', () => {
  it('tests before saving, stores credentials through the provider, and returns safe metadata', async () => {
    const { connectionManager, credentials, database, service } = setup();

    const result = await service.create(organizationId, input);

    expect(connectionManager.testConfig).toHaveBeenCalledTimes(1);
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(credentials.saveCredentials).toHaveBeenCalledWith(
      result.id,
      { [DatasourceSecretType.DatabasePassword]: 'database-password' },
      expect.anything(),
    );
    expect(result).not.toHaveProperty('databasePassword');
    expect(JSON.stringify(result)).not.toContain('database-password');
  });

  it('persists nothing when candidate connection testing fails', async () => {
    const { connectionManager, database, service } = setup();
    jest.mocked(connectionManager.testConfig).mockRejectedValue(
      new DatasourceConnectionError(
        'DATASOURCE_AUTHENTICATION_FAILED',
        'Customer database connection failed',
      ),
    );

    await expect(service.create(organizationId, input)).rejects.toMatchObject({
      code: 'DATASOURCE_AUTHENTICATION_FAILED',
    });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('always scopes datasource detail lookup to the organization', async () => {
    const { datasourceRepository, service } = setup();
    const datasourceId = crypto.randomUUID();
    jest.mocked(datasourceRepository.findOne).mockResolvedValue(null);

    await expect(service.findOne(organizationId, datasourceId)).rejects.toThrow(
      'Datasource not found',
    );
    expect(datasourceRepository.findOne).toHaveBeenCalledWith({
      where: { id: datasourceId, organizationId },
    });
  });

  it('does not permit unsupported connection modes', async () => {
    const { service } = setup();

    await expect(
      service.create(organizationId, {
        ...input,
        connectionMode: DatasourceConnectionMode.Vpn,
        status: DatasourceStatus.Active,
      } as CreateDatasourceDto),
    ).rejects.toThrow('Unsupported connection mode');
  });
});
