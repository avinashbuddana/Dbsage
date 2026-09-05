import { Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { DataSource } from 'typeorm';

import { AppConfigService } from '../config/app-config.service';
import { DatabaseConnectorFactory } from '../database-connectors/database-connector.factory';
import type { DatabaseConnector } from '../database-connectors/database-connector.interface';
import type { CustomerDatabaseConnectionConfig } from '../database-connectors/database-connector.types';
import { DatasourceConnectionMode, DatasourceStatus } from '../datasources/enums/datasource.enums';
import type { SshTunnelHandle } from '../ssh/ssh-tunnel.types';
import { SshTunnelService } from '../ssh/ssh-tunnel.service';
import { DatasourceConnectionError } from './datasource-connection.error';
import { DatasourceConfigResolver } from './datasource-config.resolver';

interface ConnectionEntry {
  organizationId: string;
  connector: DatabaseConnector;
  dataSource: DataSource;
  tunnel?: SshTunnelHandle;
  createdAt: number;
  lastUsedAt: number;
  activeOperations: number;
}

@Injectable()
export class DatabaseConnectionManager implements OnModuleInit, OnApplicationShutdown {
  private readonly registry = new Map<string, ConnectionEntry>();
  private readonly inFlight = new Map<string, Promise<ConnectionEntry>>();
  private readonly blocked = new Set<string>();
  private cleanupTimer?: NodeJS.Timeout;
  private accepting = true;

  constructor(
    private readonly connectorFactory: DatabaseConnectorFactory,
    private readonly resolver: DatasourceConfigResolver,
    private readonly config: AppConfigService,
    private readonly sshTunnelService: SshTunnelService,
    @InjectPinoLogger(DatabaseConnectionManager.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.cleanupTimer = setInterval(
      () => void this.cleanupIdleDataSources().catch(() => undefined),
      this.config.mysql.cleanupIntervalMs,
    );
    this.cleanupTimer.unref();
  }

  async getOrCreateDataSource(organizationId: string, datasourceId: string): Promise<DataSource> {
    const entry = await this.acquire(organizationId, datasourceId);
    entry.activeOperations -= 1;
    entry.lastUsedAt = Date.now();
    return entry.dataSource;
  }

  async withDataSource<T>(
    organizationId: string,
    datasourceId: string,
    operation: (dataSource: DataSource) => Promise<T>,
  ): Promise<T> {
    const entry = await this.acquire(organizationId, datasourceId);
    try {
      return await operation(entry.dataSource);
    } finally {
      entry.activeOperations -= 1;
      entry.lastUsedAt = Date.now();
    }
  }

  /**
   * Resolves the registry entry for a datasource and leases it (increments
   * activeOperations) in the same synchronous step the entry is obtained,
   * so a concurrent eviction can never observe a momentarily-unleased entry
   * that is actually about to be used.
   */
  private async acquire(organizationId: string, datasourceId: string): Promise<ConnectionEntry> {
    if (!this.accepting || this.blocked.has(datasourceId)) {
      throw new DatasourceConnectionError(
        'DATASOURCE_CONNECTION_FAILED',
        'Datasource connections are unavailable',
      );
    }

    const existing = this.registry.get(datasourceId);
    if (existing) {
      if (existing.organizationId !== organizationId) throw this.unavailable();
      if (existing.tunnel && !existing.tunnel.isHealthy()) {
        this.registry.delete(datasourceId);
        return this.refresh(organizationId, datasourceId, existing);
      }
      existing.activeOperations += 1;
      existing.lastUsedAt = Date.now();
      return existing;
    }

    const pending = this.inFlight.get(datasourceId);
    if (pending) {
      const entry = await pending;
      if (entry.organizationId !== organizationId) throw this.unavailable();
      entry.activeOperations += 1;
      entry.lastUsedAt = Date.now();
      return entry;
    }

    if (this.inFlight.size >= this.config.mysql.maxActiveDatasources) {
      throw new DatasourceConnectionError(
        'DATASOURCE_RESOURCE_LIMIT',
        'Customer database connection limit reached',
      );
    }

    const initialization = Promise.resolve().then(() =>
      this.initialize(organizationId, datasourceId),
    );
    this.inFlight.set(datasourceId, initialization);
    try {
      const entry = await initialization;
      entry.activeOperations += 1;
      return entry;
    } finally {
      this.inFlight.delete(datasourceId);
    }
  }

  /** Closes a stale entry and reinitializes it, keeping an in-flight marker for the whole
   *  operation so concurrent callers for the same datasourceId await the same refresh
   *  instead of each starting their own DataSource. */
  private async refresh(
    organizationId: string,
    datasourceId: string,
    stale: ConnectionEntry,
  ): Promise<ConnectionEntry> {
    const refreshing = (async () => {
      await this.closeEntry(stale);
      return this.initialize(organizationId, datasourceId);
    })();
    this.inFlight.set(datasourceId, refreshing);
    try {
      const entry = await refreshing;
      entry.activeOperations += 1;
      return entry;
    } finally {
      this.inFlight.delete(datasourceId);
    }
  }

  async testDatasource(organizationId: string, datasourceId: string) {
    return this.testConfig(await this.resolver.resolve(organizationId, datasourceId));
  }

  async testConfig(config: CustomerDatabaseConnectionConfig) {
    if (config.status === DatasourceStatus.Disabled) {
      throw new DatasourceConnectionError('DATASOURCE_DISABLED', 'Datasource is disabled');
    }
    const connector = this.connectorFactory.get(config.type);
    let tunnel: SshTunnelHandle | undefined;
    try {
      if (config.connectionMode === DatasourceConnectionMode.SshTunnel) {
        tunnel = await this.sshTunnelService.createTunnel(config);
        config = { ...config, host: tunnel.host, port: tunnel.port };
      }
      return await connector.testConnection(config);
    } finally {
      await tunnel?.close();
    }
  }

  async cleanupIdleDataSources(now = Date.now()): Promise<void> {
    const closes: Promise<void>[] = [];
    for (const [datasourceId, entry] of this.registry) {
      if (
        entry.activeOperations === 0 &&
        now - entry.lastUsedAt >= this.config.mysql.idleTimeoutMs
      ) {
        this.registry.delete(datasourceId);
        closes.push(this.closeEntry(entry));
      }
    }
    await Promise.all(closes);
  }

  async closeDatasource(datasourceId: string): Promise<void> {
    await this.invalidateDatasource(datasourceId);
  }

  async invalidateDatasource(datasourceId: string): Promise<void> {
    this.blocked.add(datasourceId);
    try {
      await this.inFlight.get(datasourceId)?.catch(() => undefined);
      const entry = this.registry.get(datasourceId);
      if (!entry) return;
      await this.waitForIdle(entry);
      this.registry.delete(datasourceId);
      await this.closeEntry(entry);
    } finally {
      this.blocked.delete(datasourceId);
    }
  }

  async closeAll(): Promise<void> {
    this.accepting = false;
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    await Promise.allSettled(this.inFlight.values());
    const entries = [...this.registry.values()];
    this.registry.clear();
    this.inFlight.clear();
    await Promise.all(
      entries.map(async (entry) => {
        await this.waitForIdle(entry);
        await this.closeEntry(entry);
      }),
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.closeAll();
  }

  private async initialize(organizationId: string, datasourceId: string): Promise<ConnectionEntry> {
    const config = await this.resolver.resolve(organizationId, datasourceId);
    if (config.status === DatasourceStatus.Disabled) {
      throw new DatasourceConnectionError('DATASOURCE_DISABLED', 'Datasource is disabled');
    }
    await this.ensureCapacity(datasourceId);
    const connector = this.connectorFactory.get(config.type);
    let tunnel: SshTunnelHandle | undefined;
    try {
      let effectiveConfig = config;
      if (config.connectionMode === DatasourceConnectionMode.SshTunnel) {
        tunnel = await this.sshTunnelService.createTunnel(config);
        effectiveConfig = { ...config, host: tunnel.host, port: tunnel.port };
      }
      const dataSource = await connector.createDataSource(effectiveConfig);
      const now = Date.now();
      const entry = {
        organizationId,
        connector,
        dataSource,
        ...(tunnel ? { tunnel } : {}),
        createdAt: now,
        lastUsedAt: now,
        activeOperations: 0,
      };
      this.registry.set(datasourceId, entry);
      return entry;
    } catch (error) {
      await tunnel?.close();
      throw error;
    }
  }

  private async ensureCapacity(datasourceId: string): Promise<void> {
    const queuedBefore = [...this.inFlight.keys()].indexOf(datasourceId);
    if (
      this.registry.size + Math.max(queuedBefore, 0) <
      this.config.mysql.maxActiveDatasources
    ) {
      return;
    }
    const candidate = [...this.registry.entries()]
      .filter(([, entry]) => entry.activeOperations === 0)
      .sort((left, right) => left[1].lastUsedAt - right[1].lastUsedAt)[0];
    if (!candidate) {
      throw new DatasourceConnectionError(
        'DATASOURCE_RESOURCE_LIMIT',
        'Customer database connection limit reached',
      );
    }
    this.registry.delete(candidate[0]);
    await this.closeEntry(candidate[1]);
  }

  private async closeEntry(entry: ConnectionEntry): Promise<void> {
    try {
      await entry.connector.close(entry.dataSource);
    } finally {
      await entry.tunnel?.close();
    }
  }

  private async waitForIdle(entry: ConnectionEntry): Promise<void> {
    const deadline = Date.now() + this.config.mysql.connectTimeoutMs;
    while (entry.activeOperations > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (entry.activeOperations > 0) {
      this.logger.warn(
        { activeOperations: entry.activeOperations },
        'Closing a customer datasource connection with active operations still in flight',
      );
    }
  }

  private unavailable(): DatasourceConnectionError {
    return new DatasourceConnectionError(
      'DATASOURCE_CONNECTION_FAILED',
      'Datasource connection is unavailable',
    );
  }
}
