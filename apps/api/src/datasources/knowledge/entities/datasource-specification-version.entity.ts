import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'datasource_specification_versions' })
@Index('UQ_datasource_specification_versions_specification_number', ['specificationId', 'versionNumber'], { unique: true })
@Index('IDX_datasource_specification_versions_organization_datasource', ['organizationId', 'datasourceId'])
export class DatasourceSpecificationVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'specification_id', type: 'uuid' })
  specificationId!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'datasource_id', type: 'uuid' })
  datasourceId!: string;

  @Column({ name: 'version_number', type: 'integer' })
  versionNumber!: number;

  @Column({ name: 'extraction_confidence', type: 'numeric', precision: 4, scale: 3 })
  extractionConfidence!: number;

  @Column({ type: 'jsonb' })
  requirements!: Record<string, unknown>[];

  @Column({ name: 'expected_model', type: 'jsonb' })
  expectedModel!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
