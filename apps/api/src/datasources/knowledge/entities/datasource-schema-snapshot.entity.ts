import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'datasource_schema_snapshots' })
@Index('IDX_datasource_schema_snapshots_organization_datasource_created', ['organizationId', 'datasourceId', 'createdAt'])
@Index('UQ_datasource_schema_snapshots_organization_datasource_database_hash', ['organizationId', 'datasourceId', 'databaseName', 'contentHash'], { unique: true })
export class DatasourceSchemaSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'datasource_id', type: 'uuid' })
  datasourceId!: string;

  @Column({ name: 'database_name', type: 'varchar', length: 128 })
  databaseName!: string;

  @Column({ type: 'jsonb' })
  schema!: Record<string, unknown>;

  @Column({ name: 'content_hash', type: 'char', length: 64 })
  contentHash!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz' })
  completedAt!: Date;
}
