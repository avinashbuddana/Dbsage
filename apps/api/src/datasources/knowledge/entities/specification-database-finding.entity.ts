import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  DatabaseSpecFindingSeverity,
  DatabaseSpecFindingStatus,
  DatabaseSpecFindingType,
} from '../datasource-knowledge.enums';

@Entity({ name: 'specification_database_findings' })
@Index('IDX_specification_database_findings_check', ['compatibilityCheckId', 'createdAt'])
@Index('IDX_specification_database_findings_organization_datasource', ['organizationId', 'datasourceId'])
export class SpecificationDatabaseFindingEntity {
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

  @Column({ name: 'finding_type', type: 'varchar', length: 40 })
  findingType!: DatabaseSpecFindingType;

  @Column({ type: 'varchar', length: 12 })
  severity!: DatabaseSpecFindingSeverity;

  @Column({ name: 'requirement_id', type: 'varchar', length: 128, nullable: true })
  requirementId!: string | null;

  @Column({ name: 'table_name', type: 'varchar', length: 128, nullable: true })
  tableName!: string | null;

  @Column({ name: 'column_name', type: 'varchar', length: 128, nullable: true })
  columnName!: string | null;

  @Column({ name: 'relationship_name', type: 'varchar', length: 384, nullable: true })
  relationshipName!: string | null;

  @Column({ type: 'varchar', length: 240 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'jsonb' })
  evidence!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  recommendation!: string | null;

  @Column({ name: 'confidence_score', type: 'numeric', precision: 4, scale: 3 })
  confidenceScore!: number;

  @Column({ type: 'varchar', length: 20 })
  status!: DatabaseSpecFindingStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
