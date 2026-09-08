import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { DatabaseKnowledgeSourceType, DatabaseKnowledgeType } from '../datasource-knowledge.enums';

@Entity({ name: 'database_knowledge' })
@Index('IDX_database_knowledge_organization_datasource_active', ['organizationId', 'datasourceId', 'active'])
@Index('UQ_database_knowledge_version_hash', ['knowledgeVersionId', 'contentHash'], { unique: true })
export class DatabaseKnowledgeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'datasource_id', type: 'uuid' })
  datasourceId!: string;

  @Column({ name: 'knowledge_version_id', type: 'uuid' })
  knowledgeVersionId!: string;

  @Column({ name: 'knowledge_type', type: 'varchar', length: 32 })
  knowledgeType!: DatabaseKnowledgeType;

  @Column({ name: 'subject_type', type: 'varchar', length: 48 })
  subjectType!: string;

  @Column({ name: 'subject_id', type: 'varchar', length: 128, nullable: true })
  subjectId!: string | null;

  @Column({ type: 'varchar', length: 384 })
  subject!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'source_type', type: 'varchar', length: 24 })
  sourceType!: DatabaseKnowledgeSourceType;

  @Column({ name: 'source_id', type: 'varchar', length: 128, nullable: true })
  sourceId!: string | null;

  @Column({ name: 'importance_score', type: 'smallint' })
  importanceScore!: number;

  @Column({ name: 'confidence_score', type: 'numeric', precision: 4, scale: 3 })
  confidenceScore!: number;

  @Column({ type: 'boolean' })
  verified!: boolean;

  @Column({ type: 'boolean', default: false })
  active!: boolean;

  @Column({ name: 'content_hash', type: 'char', length: 64 })
  contentHash!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
