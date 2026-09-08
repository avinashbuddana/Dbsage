import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'knowledge_chunks' })
@Index('IDX_knowledge_chunks_organization_datasource_active', ['organizationId', 'datasourceId', 'active'])
@Index('IDX_knowledge_chunks_reusable_embedding', ['organizationId', 'datasourceId', 'contentHash', 'embeddingModel'])
@Index('UQ_knowledge_chunks_knowledge_hash', ['knowledgeId', 'contentHash'], { unique: true })
export class KnowledgeChunkEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'datasource_id', type: 'uuid' })
  datasourceId!: string;

  @Column({ name: 'knowledge_version_id', type: 'uuid' })
  knowledgeVersionId!: string;

  @Column({ name: 'knowledge_id', type: 'uuid' })
  knowledgeId!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'content_hash', type: 'char', length: 64 })
  contentHash!: string;

  @Column({ type: 'vector', nullable: true })
  embedding!: string | null;

  @Column({ name: 'embedding_model', type: 'varchar', length: 255 })
  embeddingModel!: string;

  @Column({ name: 'embedding_dimensions', type: 'integer' })
  embeddingDimensions!: number;

  @Column({ name: 'importance_score', type: 'smallint' })
  importanceScore!: number;

  @Column({ name: 'confidence_score', type: 'numeric', precision: 4, scale: 3 })
  confidenceScore!: number;

  @Column({ type: 'boolean', default: false })
  active!: boolean;

  @Column({ type: 'jsonb' })
  metadata!: Record<string, string | number | boolean>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
