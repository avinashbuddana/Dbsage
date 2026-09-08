import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'specification_entity_mappings' })
@Index('UQ_specification_entity_mappings_check_requirement', ['compatibilityCheckId', 'requirementId'], { unique: true })
export class SpecificationEntityMappingEntity {
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

  @Column({ name: 'requirement_id', type: 'varchar', length: 128 })
  requirementId!: string;

  @Column({ name: 'spec_entity', type: 'varchar', length: 240 })
  specEntity!: string;

  @Column({ name: 'table_name', type: 'varchar', length: 128 })
  tableName!: string;

  @Column({ name: 'match_type', type: 'varchar', length: 32 })
  matchType!: string;

  @Column({ name: 'confidence_score', type: 'numeric', precision: 4, scale: 3 })
  confidenceScore!: number;

  @Column({ type: 'boolean' })
  verified!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

@Entity({ name: 'specification_field_mappings' })
@Index('UQ_specification_field_mappings_check_requirement_field', ['compatibilityCheckId', 'requirementId', 'specField'], { unique: true })
export class SpecificationFieldMappingEntity {
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

  @Column({ name: 'requirement_id', type: 'varchar', length: 128 })
  requirementId!: string;

  @Column({ name: 'spec_field', type: 'varchar', length: 240 })
  specField!: string;

  @Column({ name: 'table_name', type: 'varchar', length: 128 })
  tableName!: string;

  @Column({ name: 'column_name', type: 'varchar', length: 128 })
  columnName!: string;

  @Column({ name: 'match_type', type: 'varchar', length: 32 })
  matchType!: string;

  @Column({ name: 'confidence_score', type: 'numeric', precision: 4, scale: 3 })
  confidenceScore!: number;

  @Column({ type: 'boolean' })
  verified!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

@Entity({ name: 'specification_relationship_mappings' })
@Index('UQ_specification_relationship_mappings_check_requirement_relationship', ['compatibilityCheckId', 'requirementId', 'relationshipName'], { unique: true })
export class SpecificationRelationshipMappingEntity {
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

  @Column({ name: 'requirement_id', type: 'varchar', length: 128 })
  requirementId!: string;

  @Column({ name: 'relationship_name', type: 'varchar', length: 384 })
  relationshipName!: string;

  @Column({ name: 'source_table_name', type: 'varchar', length: 128 })
  sourceTableName!: string;

  @Column({ name: 'target_table_name', type: 'varchar', length: 128 })
  targetTableName!: string;

  @Column({ name: 'match_type', type: 'varchar', length: 32 })
  matchType!: string;

  @Column({ name: 'confidence_score', type: 'numeric', precision: 4, scale: 3 })
  confidenceScore!: number;

  @Column({ type: 'boolean' })
  verified!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
