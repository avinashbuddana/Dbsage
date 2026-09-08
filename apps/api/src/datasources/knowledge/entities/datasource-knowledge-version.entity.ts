import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { DatasourceKnowledgeVersionStatus } from '../datasource-knowledge.enums';

@Entity({ name: 'datasource_knowledge_versions' })
@Index('IDX_datasource_knowledge_versions_organization_datasource_created', ['organizationId', 'datasourceId', 'createdAt'])
@Index('UQ_datasource_knowledge_versions_compatibility', ['compatibilityCheckId'], { unique: true })
export class DatasourceKnowledgeVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'datasource_id', type: 'uuid' })
  datasourceId!: string;

  @Column({ name: 'specification_version_id', type: 'uuid' })
  specificationVersionId!: string;

  @Column({ name: 'schema_snapshot_id', type: 'uuid' })
  schemaSnapshotId!: string;

  @Column({ name: 'compatibility_check_id', type: 'uuid' })
  compatibilityCheckId!: string;

  @Column({ name: 'version_number', type: 'integer' })
  versionNumber!: number;

  @Column({ type: 'varchar', length: 16 })
  status!: DatasourceKnowledgeVersionStatus;

  @Column({ name: 'knowledge_count', type: 'integer', default: 0 })
  knowledgeCount!: number;

  @Column({ name: 'chunk_count', type: 'integer', default: 0 })
  chunkCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true })
  activatedAt!: Date | null;

  @Column({ name: 'superseded_at', type: 'timestamptz', nullable: true })
  supersededAt!: Date | null;
}
