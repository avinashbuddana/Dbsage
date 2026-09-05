import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager, Repository } from 'typeorm';

import { AuditEvent, AuditService } from '../audit/audit.service';
import {
  CREDENTIAL_PROVIDER,
  type CredentialProvider,
  type DatasourceSecrets,
} from '../credentials/credential-provider.interface';
import type { ConnectionTestResult } from '../database-connectors/database-connector.types';
import { DatabaseConnectionManager } from '../database-connections/database-connection.manager';
import { DatasourceConnectionError } from '../database-connections/datasource-connection.error';
import { DatasourceNetworkPolicyService } from '../network/datasource-network-policy.service';
import {
  type CreateDatasourceDto,
  type TestDatasourceConnectionDto,
  type UpdateDatasourceDto,
} from './dto/datasource.dto';
import { DatasourceSshConfigEntity } from './entities/datasource-ssh-config.entity';
import { DatasourceEntity } from './entities/datasource.entity';
import {
  DatasourceConnectionMode,
  DatasourceSecretType,
  DatasourceStatus,
  DatasourceType,
  SshAuthenticationType,
} from './enums/datasource.enums';
import type {
  CandidateConnectionInput,
  DatasourceResponse,
  ResolvedCandidate,
} from './datasource.types';

const SSH_SECRET_TYPES = [
  DatasourceSecretType.SshPassword,
  DatasourceSecretType.SshPrivateKey,
  DatasourceSecretType.SshPrivateKeyPassphrase,
] as const;

@Injectable()
export class DatasourcesService {
  constructor(
    @InjectRepository(DatasourceEntity)
    private readonly datasourceRepository: Repository<DatasourceEntity>,
    @InjectRepository(DatasourceSshConfigEntity)
    private readonly sshRepository: Repository<DatasourceSshConfigEntity>,
    @InjectDataSource() private readonly database: DataSource,
    @Inject(CREDENTIAL_PROVIDER) private readonly credentials: CredentialProvider,
    private readonly connectionManager: DatabaseConnectionManager,
    private readonly networkPolicy: DatasourceNetworkPolicyService,
    private readonly audit: AuditService,
  ) {}

  async testConnection(
    organizationId: string,
    input: TestDatasourceConnectionDto,
  ): Promise<ConnectionTestResult> {
    const config = await this.resolveCandidate(organizationId, randomUUID(), input);
    return this.testOrAudit(organizationId, config);
  }

  async create(organizationId: string, input: CreateDatasourceDto): Promise<DatasourceResponse> {
    const config = await this.resolveCandidate(organizationId, randomUUID(), input);
    await this.testOrAudit(organizationId, config);

    return this.database.transaction(async (manager) => {
      const repository = manager.getRepository(DatasourceEntity);
      const now = new Date();
      const datasource = await repository.save(
        repository.create({
          organizationId,
          name: input.name,
          databaseType: input.databaseType,
          connectionMode: input.connectionMode,
          host: input.host,
          port: input.port,
          databaseName: input.databaseName,
          username: input.username,
          sslEnabled: input.sslEnabled,
          status: DatasourceStatus.Active,
          lastConnectedAt: now,
          lastConnectionErrorCode: null,
        }),
      );
      if (input.ssh) await this.saveSshConfig(manager, datasource.id, input.ssh);
      await this.credentials.saveCredentials(datasource.id, this.secretsFromInput(input), manager);
      await this.audit.record(
        organizationId,
        AuditEvent.DatasourceCreated,
        {
          datasourceId: datasource.id,
          databaseType: datasource.databaseType,
          connectionMode: datasource.connectionMode,
        },
        manager,
      );
      return this.toResponse(datasource);
    });
  }

  async findAll(organizationId: string): Promise<DatasourceResponse[]> {
    const datasources = await this.datasourceRepository.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
    return datasources.map((datasource) => this.toResponse(datasource));
  }

  async findOne(organizationId: string, datasourceId: string): Promise<DatasourceResponse> {
    return this.toResponse(await this.getEntity(organizationId, datasourceId));
  }

  async testSaved(organizationId: string, datasourceId: string): Promise<ConnectionTestResult> {
    const datasource = await this.getEntity(organizationId, datasourceId);
    if (datasource.status === DatasourceStatus.Disabled) {
      throw new DatasourceConnectionError('DATASOURCE_DISABLED', 'Datasource is disabled');
    }
    try {
      const result = await this.connectionManager.testDatasource(organizationId, datasourceId);
      await this.datasourceRepository.update(
        { id: datasourceId, organizationId },
        { status: DatasourceStatus.Active, lastConnectedAt: new Date(), lastConnectionErrorCode: null },
      );
      await this.audit.record(organizationId, AuditEvent.DatasourceConnectionTestSucceeded, {
        datasourceId,
        durationMs: result.latencyMs,
      });
      return result;
    } catch (error) {
      const errorCode = this.errorCode(error);
      await this.datasourceRepository.update(
        { id: datasourceId, organizationId },
        { status: DatasourceStatus.ConnectionFailed, lastConnectionErrorCode: errorCode },
      );
      await this.audit.record(organizationId, AuditEvent.DatasourceConnectionTestFailed, {
        datasourceId,
        errorCode,
      });
      throw error;
    }
  }

  async update(
    organizationId: string,
    datasourceId: string,
    input: UpdateDatasourceDto,
  ): Promise<DatasourceResponse> {
    const datasource = await this.getEntity(organizationId, datasourceId);
    const current = await this.currentInput(datasource);
    const candidateInput: CandidateConnectionInput = {
      ...current,
      connectionMode: input.connectionMode ?? current.connectionMode,
      host: input.host ?? current.host,
      port: input.port ?? current.port,
      databaseName: input.databaseName ?? current.databaseName,
      username: input.username ?? current.username,
      databasePassword: input.databasePassword ?? current.databasePassword,
      sslEnabled: input.sslEnabled ?? current.sslEnabled,
      ...(input.ssh ? { ssh: input.ssh } : {}),
    };
    if (candidateInput.connectionMode === DatasourceConnectionMode.Direct) delete candidateInput.ssh;
    const candidate = await this.resolveCandidate(
      organizationId,
      datasourceId,
      candidateInput,
      DatasourceStatus.Active,
    );
    const criticalChange = [
      'connectionMode',
      'host',
      'port',
      'databaseName',
      'username',
      'databasePassword',
      'sslEnabled',
      'ssh',
    ].some((field) => field in input);
    if (criticalChange || input.status === DatasourceStatus.Active) {
      await this.testOrAudit(organizationId, candidate);
    }

    const targetStatus = input.status ?? datasource.status;
    const previousStatus = datasource.status;
    const updated = await this.database.transaction(async (manager) => {
      const repository = manager.getRepository(DatasourceEntity);
      Object.assign(datasource, {
        ...(input.name === undefined ? {} : { name: input.name }),
        connectionMode: candidate.connectionMode,
        host: candidateInput.host,
        port: candidateInput.port,
        databaseName: candidateInput.databaseName,
        username: candidateInput.username,
        sslEnabled: candidateInput.sslEnabled,
        status: targetStatus,
        ...(criticalChange
          ? { lastConnectedAt: new Date(), lastConnectionErrorCode: null }
          : {}),
      });
      const saved = await repository.save(datasource);
      await this.updateSshConfig(manager, datasourceId, candidateInput);
      await this.updateSecrets(manager, organizationId, datasourceId, input, candidateInput);
      await this.audit.record(
        organizationId,
        targetStatus === DatasourceStatus.Disabled
          ? AuditEvent.DatasourceDisabled
          : previousStatus === DatasourceStatus.Disabled
            ? AuditEvent.DatasourceEnabled
            : AuditEvent.DatasourceUpdated,
        { datasourceId },
        manager,
      );
      return saved;
    });
    await this.connectionManager.invalidateDatasource(datasourceId);
    return this.toResponse(updated);
  }

  async remove(organizationId: string, datasourceId: string): Promise<void> {
    await this.getEntity(organizationId, datasourceId);
    await this.connectionManager.invalidateDatasource(datasourceId);
    await this.database.transaction(async (manager) => {
      await this.credentials.deleteCredentials(datasourceId, manager);
      await manager.getRepository(DatasourceSshConfigEntity).delete({ datasourceId });
      await manager.getRepository(DatasourceEntity).delete({ id: datasourceId, organizationId });
      await this.audit.record(
        organizationId,
        AuditEvent.DatasourceDeleted,
        { datasourceId },
        manager,
      );
    });
  }

  private async getEntity(organizationId: string, datasourceId: string): Promise<DatasourceEntity> {
    const datasource = await this.datasourceRepository.findOne({
      where: { id: datasourceId, organizationId },
    });
    if (!datasource) throw new NotFoundException('Datasource not found');
    return datasource;
  }

  private async resolveCandidate(
    organizationId: string,
    datasourceId: string,
    input: CandidateConnectionInput,
    status = DatasourceStatus.Active,
  ): Promise<ResolvedCandidate> {
    if (
      input.connectionMode !== DatasourceConnectionMode.Direct &&
      input.connectionMode !== DatasourceConnectionMode.SshTunnel
    ) {
      throw new BadRequestException('Unsupported connection mode');
    }
    if (!Object.values(DatasourceType).includes(input.databaseType)) {
      throw new BadRequestException('Unsupported datasource type');
    }
    if (input.connectionMode === DatasourceConnectionMode.Direct && input.ssh) {
      throw new BadRequestException('DIRECT connections cannot include SSH configuration');
    }
    if (input.connectionMode === DatasourceConnectionMode.SshTunnel && !input.ssh) {
      throw new BadRequestException('SSH configuration is required');
    }

    const host =
      input.connectionMode === DatasourceConnectionMode.Direct
        ? await this.networkPolicy.validateTarget(input.host)
        : this.networkPolicy.validateRemoteTarget(input.host);
    const ssh = input.ssh
      ? {
          host: await this.networkPolicy.validateTarget(input.ssh.host),
          port: input.ssh.port,
          username: input.ssh.username,
          authenticationType: input.ssh.authenticationType,
          password: input.ssh.password,
          privateKey: input.ssh.privateKey,
          privateKeyPassphrase: input.ssh.privateKeyPassphrase,
        }
      : undefined;
    this.validateSshAuthentication(ssh);

    return {
      datasourceId,
      organizationId,
      type: input.databaseType,
      connectionMode: input.connectionMode,
      status,
      host,
      port: input.port,
      databaseName: input.databaseName,
      username: input.username,
      password: input.databasePassword,
      sslEnabled: input.sslEnabled,
      ...(ssh ? { ssh } : {}),
    };
  }

  private validateSshAuthentication(ssh: CandidateConnectionInput['ssh']): void {
    if (!ssh) return;
    if (ssh.authenticationType === SshAuthenticationType.Password) {
      if (!ssh.password || ssh.privateKey || ssh.privateKeyPassphrase) {
        throw new BadRequestException('SSH password authentication fields are invalid');
      }
      return;
    }
    if (!ssh.privateKey || ssh.password) {
      throw new BadRequestException('SSH private key authentication fields are invalid');
    }
  }

  private secretsFromInput(input: CandidateConnectionInput): DatasourceSecrets {
    return {
      [DatasourceSecretType.DatabasePassword]: input.databasePassword,
      ...(input.ssh?.password
        ? { [DatasourceSecretType.SshPassword]: input.ssh.password }
        : {}),
      ...(input.ssh?.privateKey
        ? { [DatasourceSecretType.SshPrivateKey]: input.ssh.privateKey }
        : {}),
      ...(input.ssh?.privateKeyPassphrase
        ? { [DatasourceSecretType.SshPrivateKeyPassphrase]: input.ssh.privateKeyPassphrase }
        : {}),
    };
  }

  private async saveSshConfig(
    manager: EntityManager,
    datasourceId: string,
    ssh: NonNullable<CandidateConnectionInput['ssh']>,
  ): Promise<void> {
    const repository = manager.getRepository(DatasourceSshConfigEntity);
    await repository.save(
      repository.create({
        datasourceId,
        sshHost: ssh.host,
        sshPort: ssh.port,
        sshUsername: ssh.username,
        authenticationType: ssh.authenticationType,
      }),
    );
  }

  private async currentInput(datasource: DatasourceEntity): Promise<CandidateConnectionInput> {
    const secrets = await this.credentials.getCredentials(datasource.id);
    const databasePassword = secrets[DatasourceSecretType.DatabasePassword];
    if (!databasePassword) throw new Error('Datasource database credential is unavailable');
    const sshEntity =
      datasource.connectionMode === DatasourceConnectionMode.SshTunnel
        ? await this.sshRepository.findOne({ where: { datasourceId: datasource.id } })
        : null;
    const ssh = sshEntity
      ? {
          host: sshEntity.sshHost,
          port: sshEntity.sshPort,
          username: sshEntity.sshUsername,
          authenticationType: sshEntity.authenticationType,
          password: secrets[DatasourceSecretType.SshPassword],
          privateKey: secrets[DatasourceSecretType.SshPrivateKey],
          privateKeyPassphrase: secrets[DatasourceSecretType.SshPrivateKeyPassphrase],
        }
      : undefined;
    return {
      databaseType: datasource.databaseType,
      connectionMode: datasource.connectionMode,
      host: datasource.host,
      port: datasource.port,
      databaseName: datasource.databaseName,
      username: datasource.username,
      databasePassword,
      sslEnabled: datasource.sslEnabled,
      ...(ssh ? { ssh } : {}),
    };
  }

  private async updateSshConfig(
    manager: EntityManager,
    datasourceId: string,
    input: CandidateConnectionInput,
  ): Promise<void> {
    if (input.connectionMode === DatasourceConnectionMode.Direct) {
      await manager.getRepository(DatasourceSshConfigEntity).delete({ datasourceId });
      await this.credentials.deleteCredentials(datasourceId, manager, SSH_SECRET_TYPES);
      return;
    }
    if (input.ssh) await this.saveSshConfig(manager, datasourceId, input.ssh);
  }

  private async updateSecrets(
    manager: EntityManager,
    organizationId: string,
    datasourceId: string,
    update: UpdateDatasourceDto,
    candidate: CandidateConnectionInput,
  ): Promise<void> {
    const secrets: DatasourceSecrets = {};
    if (update.databasePassword) {
      secrets[DatasourceSecretType.DatabasePassword] = update.databasePassword;
    }
    if (update.ssh) {
      Object.assign(secrets, this.secretsFromInput(candidate));
      if (update.ssh.authenticationType === SshAuthenticationType.Password) {
        await this.credentials.deleteCredentials(datasourceId, manager, [
          DatasourceSecretType.SshPrivateKey,
          DatasourceSecretType.SshPrivateKeyPassphrase,
        ]);
      } else {
        await this.credentials.deleteCredentials(datasourceId, manager, [
          DatasourceSecretType.SshPassword,
        ]);
      }
    }
    if (Object.keys(secrets).length > 0) {
      await this.credentials.updateCredentials(datasourceId, secrets, manager);
      await this.audit.record(
        organizationId,
        AuditEvent.DatasourceCredentialUpdated,
        { datasourceId },
        manager,
      );
    }
  }

  private async testOrAudit(
    organizationId: string,
    config: ResolvedCandidate,
  ): Promise<ConnectionTestResult> {
    try {
      const result = await this.connectionManager.testConfig(config);
      await this.audit.record(organizationId, AuditEvent.DatasourceConnectionTestSucceeded, {
        databaseType: config.type,
        connectionMode: config.connectionMode,
        durationMs: result.latencyMs,
      });
      return result;
    } catch (error) {
      await this.audit.record(organizationId, AuditEvent.DatasourceConnectionTestFailed, {
        databaseType: config.type,
        connectionMode: config.connectionMode,
        errorCode: this.errorCode(error),
      });
      throw error;
    }
  }

  private errorCode(error: unknown): string {
    return error instanceof DatasourceConnectionError
      ? error.code
      : 'DATASOURCE_CONNECTION_FAILED';
  }

  private toResponse(datasource: DatasourceEntity): DatasourceResponse {
    return {
      id: datasource.id,
      organizationId: datasource.organizationId,
      name: datasource.name,
      databaseType: datasource.databaseType,
      connectionMode: datasource.connectionMode,
      host: datasource.host,
      port: datasource.port,
      databaseName: datasource.databaseName,
      username: datasource.username,
      sslEnabled: datasource.sslEnabled,
      status: datasource.status,
      lastConnectedAt: datasource.lastConnectedAt,
      lastConnectionErrorCode: datasource.lastConnectionErrorCode,
      createdAt: datasource.createdAt,
      updatedAt: datasource.updatedAt,
    };
  }
}
