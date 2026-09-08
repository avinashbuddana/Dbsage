import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { DatasourceSpecAnalysisReport } from '@schemaiq/types';

import { OrganizationEntity } from '../../organizations/organization.entity';
import { DatasourceSpecAnalysisStatus } from '../enums/datasource-spec-analysis-status.enum';
import { DatasourceEntity } from './datasource.entity';

@Entity({ name: 'datasource_spec_analyses' })
@Index('IDX_datasource_spec_analyses_organization_datasource_created', [
  'organizationId',
  'datasourceId',
  'createdAt',
])
export class DatasourceSpecAnalysisEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'datasource_id', type: 'uuid' })
  datasourceId!: string;

  @Column({ name: 'database_name', type: 'varchar', length: 128 })
  databaseName!: string;

  @Column({
    type: 'enum',
    enum: DatasourceSpecAnalysisStatus,
    enumName: 'datasource_spec_analysis_status',
  })
  status!: DatasourceSpecAnalysisStatus;

  @Column({ name: 'encrypted_specification', type: 'text', nullable: true, select: false })
  encryptedSpecification!: string | null;

  @Column({ name: 'specification_iv', type: 'varchar', length: 24, nullable: true, select: false })
  specificationIv!: string | null;

  @Column({ name: 'specification_auth_tag', type: 'varchar', length: 24, nullable: true, select: false })
  specificationAuthTag!: string | null;

  @Column({ name: 'specification_encryption_version', type: 'integer', nullable: true, select: false })
  specificationEncryptionVersion!: number | null;

  @Column({ type: 'text', nullable: true })
  result!: string | null;

  @Column({ name: 'match_score', type: 'smallint', nullable: true })
  matchScore!: number | null;

  @Column({ name: 'specification_id', type: 'uuid', nullable: true })
  specificationId!: string | null;

  @Column({ name: 'specification_version_id', type: 'uuid', nullable: true })
  specificationVersionId!: string | null;

  @Column({ name: 'schema_snapshot_id', type: 'uuid', nullable: true })
  schemaSnapshotId!: string | null;

  @Column({ name: 'compatibility_check_id', type: 'uuid', nullable: true })
  compatibilityCheckId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  report!: DatasourceSpecAnalysisReport | null;

  @Column({ name: 'error_code', type: 'varchar', length: 80, nullable: true })
  errorCode!: string | null;

  @Column({ name: 'error_message', type: 'varchar', length: 255, nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: OrganizationEntity;

  @ManyToOne(() => DatasourceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'datasource_id' })
  datasource!: DatasourceEntity;
}
