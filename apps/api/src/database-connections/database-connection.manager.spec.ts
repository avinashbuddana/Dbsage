import type { DataSource } from 'typeorm';

import type { AppConfigService } from '../config/app-config.service';
import type { DatabaseConnectorFactory } from '../database-connectors/database-connector.factory';
import type { CustomerDatabaseConnectionConfig } from '../database-connectors/database-connector.types';
import {
  DatasourceConnectionMode,
  DatasourceStatus,
  DatasourceType,
  SshAuthenticationType,
} from '../datasources/enums/datasource.enums';
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

const sshConfig: CustomerDatabaseConnectionConfig = {
  ...config,
  connectionMode: DatasourceConnectionMode.SshTunnel,
  host: '10.1.2.3',
  ssh: {
    host: 'bastion.example.com',
    port: 22,
    username: 'tunnel-user',
    authenticationType: SshAuthenticationType.PrivateKey,
    privateKey: 'private-key',
  },
};

function dataSource(): DataSource {
  return {
    isInitialized: true,
    destroy: jest.fn().mockResolvedValue(undefined),
  } as unknown as DataSource;
}

function tunnelHandle() {
  return {
    host: '127.0.0.1' as const,
    port: 41_234,
    isHealthy: jest.fn().mockReturnValue(true),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function setup(maxActiveDatasources = 2) {
  const created: DataSource[] = [];
  const connector = {
    createDataSource: jest.fn(() => {
      const value = dataSource();
      created.push(value);
      return Promise.resolve(value);
    }),
    testConnection: jest.fn(),
    ping: jest.fn().mockResolvedValue(undefined),
    close: jest.fn((value: DataSource) => value.destroy()),
  };
  const factory = { get: jest.fn().mockReturnValue(connector) };
  const resolver = { resolve: jest.fn().mockResolvedValue(config) };
  const appConfig = {
    mysql: {
      maxActiveDatasources,
      idleTimeoutMs: 100,
      cleanupIntervalMs: 60_000,
      poolSize: 3,
      connectTimeoutMs: 5_000,
    },
  };
  const ssh = { createTunnel: jest.fn() };
  const logger = { warn: jest.fn() };
  const manager = new DatabaseConnectionManager(
    factory as unknown as DatabaseConnectorFactory,
    resolver as unknown as DatasourceConfigResolver,
    appConfig as unknown as AppConfigService,
    ssh as unknown as SshTunnelService,
    logger as unknown as ConstructorParameters<typeof DatabaseConnectionManager>[4],
  );

  return { connector, created, manager, resolver, ssh, logger };
}

describe('DatabaseConnectionManager', () => {
  afterEach(() => jest.useRealTimers());

  it('deduplicates twenty simultaneous requests for one datasource', async () => {
    const { connector, manager } = setup();

    const dataSources = await Promise.all(
      Array.from({ length: 20 }, () =>
        manager.getOrCreateDataSource(config.organizationId, config.datasourceId),
      ),
    );

    expect(new Set(dataSources).size).toBe(1);
    expect(connector.createDataSource).toHaveBeenCalledTimes(1);
    await manager.closeAll();
  });

  it('does not start unbounded concurrent initialization for distinct datasources', async () => {
    const { manager, resolver } = setup(1);
    const secondDatasourceId = crypto.randomUUID();

    const first = manager.getOrCreateDataSource(config.organizationId, config.datasourceId);
    await expect(manager.getOrCreateDataSource(config.organizationId, secondDatasourceId)).rejects.toMatchObject({
      code: 'DATASOURCE_RESOURCE_LIMIT',
    });
    await first;
    expect(resolver.resolve).toHaveBeenCalledTimes(1);
    await manager.closeAll();
  });

  it('keeps datasource registries isolated by datasource ID', async () => {
    const { connector, manager, resolver } = setup(2);
    const secondDatasourceId = crypto.randomUUID();
    jest.mocked(resolver.resolve).mockImplementation(async (_organizationId, datasourceId) => ({
      ...config,
      datasourceId,
      databaseName: datasourceId === config.datasourceId ? 'database_a' : 'database_b',
    }));

    const first = await manager.getOrCreateDataSource(config.organizationId, config.datasourceId);
    const second = await manager.getOrCreateDataSource(config.organizationId, secondDatasourceId);
    await manager.invalidateDatasource(config.datasourceId);

    expect(first).not.toBe(second);
    expect(connector.createDataSource).toHaveBeenCalledTimes(2);
    await expect(manager.getOrCreateDataSource(config.organizationId, secondDatasourceId)).resolves.toBe(second);
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
    expect(created.every((value) => (value.destroy as jest.Mock).mock.calls.length === 1)).toBe(
      true,
    );
  });

  it('refuses disabled datasources', async () => {
    const { manager, resolver } = setup();
    jest.mocked(resolver.resolve).mockResolvedValue({ ...config, status: DatasourceStatus.Disabled });

    await expect(
      manager.getOrCreateDataSource(config.organizationId, config.datasourceId),
    ).rejects.toMatchObject({ code: 'DATASOURCE_DISABLED' });
  });

  it('reuses one SSH tunnel across concurrent initialization and closes it on shutdown', async () => {
    const { manager, resolver, ssh } = setup();
    jest.mocked(resolver.resolve).mockResolvedValue(sshConfig);
    const tunnel = tunnelHandle();
    jest.mocked(ssh.createTunnel).mockResolvedValue(tunnel);

    const [first, second] = await Promise.all([
      manager.getOrCreateDataSource(sshConfig.organizationId, sshConfig.datasourceId),
      manager.getOrCreateDataSource(sshConfig.organizationId, sshConfig.datasourceId),
    ]);

    expect(first).toBe(second);
    expect(ssh.createTunnel).toHaveBeenCalledTimes(1);
    expect(tunnel.close).not.toHaveBeenCalled();

    await manager.closeAll();
    expect(tunnel.close).toHaveBeenCalledTimes(1);
  });

  it('closes the SSH tunnel when the datasource is invalidated', async () => {
    const { manager, resolver, ssh } = setup();
    jest.mocked(resolver.resolve).mockResolvedValue(sshConfig);
    const tunnel = tunnelHandle();
    jest.mocked(ssh.createTunnel).mockResolvedValue(tunnel);

    await manager.getOrCreateDataSource(sshConfig.organizationId, sshConfig.datasourceId);
    await manager.invalidateDatasource(sshConfig.datasourceId);

    expect(tunnel.close).toHaveBeenCalledTimes(1);
  });

  it('closes the temporary SSH tunnel after a one-off connection test', async () => {
    const { connector, manager, ssh } = setup();
    const tunnel = tunnelHandle();
    jest.mocked(ssh.createTunnel).mockResolvedValue(tunnel);
    jest.mocked(connector.testConnection).mockResolvedValue({
      success: true,
      latencyMs: 1,
      databaseType: DatasourceType.MySql,
    });

    await manager.testConfig(sshConfig);

    expect(ssh.createTunnel).toHaveBeenCalledTimes(1);
    expect(tunnel.close).toHaveBeenCalledTimes(1);
  });
});
