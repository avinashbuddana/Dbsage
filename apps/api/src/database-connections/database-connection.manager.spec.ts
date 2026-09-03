import type { DataSource } from 'typeorm';

import type { AppConfigService } from '../config/app-config.service';
import type { DatabaseConnectorFactory } from '../database-connectors/database-connector.factory';
import type { DatabaseConnector } from '../database-connectors/database-connector.interface';
import type { CustomerDatabaseConnectionConfig } from '../database-connectors/database-connector.types';
import { DatasourceConnectionMode, DatasourceStatus, DatasourceType } from '../datasources/enums/datasource.enums';
import type { SshTunnelService } from '../ssh/ssh-tunnel.service';
import { DatabaseConnectionManager } from './database-connection.manager';
import type { DatasourceConfigResolver } from './datasource-config.resolver';

const config: CustomerDatabaseConnectionConfig = {
  datasourceId: '55c6be46-1ad4-4dc8-9a6b-69cb234746b0',
  organizationId: '31215d9b-01f0-4de9-a7e3-239b576e4943',
  type: DatasourceType.MySql,
  connectionMode: DatasourceConnectionMode.Direct,
  status: DatasourceStatus.Active,
  host: '203.0.113.20',
  port: 3306,
  databaseName: 'app',
  username: 'reader',
  password: 'secret',
  sslEnabled: true,
};

function dataSource(): DataSource {
  return {
    isInitialized: true,
    destroy: jest.fn().mockResolvedValue(undefined),
  } as unknown as DataSource;
}

function setup(maxActiveDatasources = 2) {
  const created: DataSource[] = [];
  const connector: DatabaseConnector = {
    createDataSource: jest.fn(async () => {
      const value = dataSource();
      created.push(value);
      return value;
    }),
    testConnection: jest.fn(),
    ping: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(async (value: DataSource) => value.destroy()),
  };
  const factory = { get: jest.fn().mockReturnValue(connector) } as unknown as DatabaseConnectorFactory;
  const resolver = { resolve: jest.fn().mockResolvedValue(config) } as unknown as DatasourceConfigResolver;
  const appConfig = {
    mysql: {
      maxActiveDatasources,
      idleTimeoutMs: 100,
      cleanupIntervalMs: 60_000,
      poolSize: 3,
      connectTimeoutMs: 5_000,
    },
  } as unknown as AppConfigService;
  const ssh = { createTunnel: jest.fn() } as unknown as SshTunnelService;
  const manager = new DatabaseConnectionManager(factory, resolver, appConfig, ssh);

  return { connector, created, manager, resolver };
}

describe('DatabaseConnectionManager', () => {
  afterEach(() => jest.useRealTimers());

  it('deduplicates concurrent initialization and reuses one datasource', async () => {
    const { connector, manager } = setup();

    const [first, second] = await Promise.all([
      manager.getOrCreateDataSource(config.organizationId, config.datasourceId),
      manager.getOrCreateDataSource(config.organizationId, config.datasourceId),
    ]);

    expect(first).toBe(second);
    expect(connector.createDataSource).toHaveBeenCalledTimes(1);
    await manager.closeAll();
  });

  it('does not evict a datasource while it has an active operation', async () => {
    const { manager, resolver } = setup(1);
    let release!: () => void;
    const operation = manager.withDataSource(
      config.organizationId,
      config.datasourceId,
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    await Promise.resolve();
    jest.mocked(resolver.resolve).mockResolvedValue({ ...config, datasourceId: crypto.randomUUID() });

    await expect(
      manager.getOrCreateDataSource(config.organizationId, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'DATASOURCE_RESOURCE_LIMIT' });

    release();
    await operation;
    await manager.closeAll();
  });

  it('removes failed initialization from the in-flight cache', async () => {
    const { connector, manager } = setup();
    jest.mocked(connector.createDataSource).mockRejectedValueOnce(new Error('offline'));

    await expect(
      manager.getOrCreateDataSource(config.organizationId, config.datasourceId),
    ).rejects.toThrow('offline');
    await manager.getOrCreateDataSource(config.organizationId, config.datasourceId);

    expect(connector.createDataSource).toHaveBeenCalledTimes(2);
    await manager.closeAll();
  });

  it('invalidation and shutdown close every initialized datasource', async () => {
    const { created, manager, resolver } = setup();
    await manager.getOrCreateDataSource(config.organizationId, config.datasourceId);
    await manager.invalidateDatasource(config.datasourceId);
    jest.mocked(resolver.resolve).mockResolvedValue({ ...config, datasourceId: crypto.randomUUID() });
    await manager.getOrCreateDataSource(config.organizationId, crypto.randomUUID());
    await manager.closeAll();

    expect(created).toHaveLength(2);
    expect(created.every((value) => jest.mocked(value.destroy).mock.calls.length === 1)).toBe(true);
  });

  it('refuses disabled datasources', async () => {
    const { manager, resolver } = setup();
    jest.mocked(resolver.resolve).mockResolvedValue({ ...config, status: DatasourceStatus.Disabled });

    await expect(
      manager.getOrCreateDataSource(config.organizationId, config.datasourceId),
    ).rejects.toMatchObject({ code: 'DATASOURCE_DISABLED' });
  });
});
