import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { CompatibilityStatus, KnowledgeEligibilityStatus } from '../datasource-knowledge.enums';

@Entity({ name: 'specification_compatibility_checks' })
@Index('IDX_specification_compatibility_checks_organization_datasource_created', ['organizationId', 'datasourceId', 'createdAt'])
@Index('UQ_specification_compatibility_checks_version_snapshot', ['specificationVersionId', 'schemaSnapshotId'], { unique: true })
export class SpecificationCompatibilityCheckEntity {
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

  @Column({ name: 'overall_score', type: 'smallint' })
  overallScore!: number;

  @Column({ name: 'entity_score', type: 'smallint' })
  entityScore!: number;

  @Column({ name: 'field_score', type: 'smallint' })
  fieldScore!: number;

  @Column({ name: 'relationship_score', type: 'smallint' })
  relationshipScore!: number;

  @Column({ name: 'constraint_score', type: 'smallint' })
  constraintScore!: number;

  @Column({ name: 'semantic_score', type: 'smallint' })
  semanticScore!: number;

  @Column({ name: 'anchor_score', type: 'smallint' })
  anchorScore!: number;

  @Column({ type: 'varchar', length: 32 })
  status!: CompatibilityStatus;

  @Column({ name: 'knowledge_eligibility', type: 'varchar', length: 24 })
  knowledgeEligibility!: KnowledgeEligibilityStatus;

  @Column({ type: 'varchar', length: 1_200 })
  reason!: string;

  @Column({ name: 'summary', type: 'jsonb' })
  summary!: Record<string, number>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
