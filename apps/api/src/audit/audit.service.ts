import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';

import { AuditLogEntity } from './audit-log.entity';

export enum AuditEvent {
  DatasourceCreated = 'DATASOURCE_CREATED',
  DatasourceUpdated = 'DATASOURCE_UPDATED',
  DatasourceDeleted = 'DATASOURCE_DELETED',
  DatasourceDisabled = 'DATASOURCE_DISABLED',
  DatasourceEnabled = 'DATASOURCE_ENABLED',
  DatasourceConnectionTestSucceeded = 'DATASOURCE_CONNECTION_TEST_SUCCEEDED',
  DatasourceConnectionTestFailed = 'DATASOURCE_CONNECTION_TEST_FAILED',
  DatasourceCredentialUpdated = 'DATASOURCE_CREDENTIAL_UPDATED',
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repository: Repository<AuditLogEntity>,
  ) {}

  async record(
    organizationId: string,
    action: AuditEvent,
    metadata: Record<string, unknown> = {},
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager?.getRepository(AuditLogEntity) ?? this.repository;
    await repository.save(
      repository.create({ organizationId, userId: null, action, metadata }),
    );
  }
}
