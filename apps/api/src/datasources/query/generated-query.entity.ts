import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { DatabaseCopilotIntent, GeneratedQueryStatus } from '@schemaiq/types';

@Entity({ name: 'generated_queries' })
@Index('IDX_generated_queries_organization_datasource', ['organizationId', 'datasourceId'])
@Index('IDX_generated_queries_datasource_created', ['datasourceId', 'createdAt'])
@Index('IDX_generated_queries_schema_snapshot', ['schemaSnapshotId'])
@Index('IDX_generated_queries_status', ['status'])
export class GeneratedQueryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'datasource_id', type: 'uuid' })
  datasourceId!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'text' })
  question!: string;

  @Column({ type: 'varchar', length: 40 })
  intent!: DatabaseCopilotIntent;

  @Column({ name: 'schema_snapshot_id', type: 'uuid' })
  schemaSnapshotId!: string;

  @Column({ name: 'knowledge_version_id', type: 'uuid', nullable: true })
  knowledgeVersionId!: string | null;

  @Column({ name: 'query_plan', type: 'jsonb' })
  queryPlan!: Record<string, unknown>;

  @Column({ name: 'generated_sql', type: 'text', nullable: true })
  generatedSql!: string | null;

  @Column({ name: 'parameter_metadata', type: 'jsonb' })
  parameterMetadata!: Record<string, unknown>[];

  @Column({ type: 'varchar', length: 24 })
  status!: GeneratedQueryStatus;

  @Column({ name: 'validation_status', type: 'varchar', length: 24 })
  validationStatus!: GeneratedQueryStatus;

  @Column({ type: 'numeric', precision: 4, scale: 3 })
  confidence!: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  provider!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  model!: string | null;

  @Column({ name: 'prompt_version', type: 'varchar', length: 120, nullable: true })
  promptVersion!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
