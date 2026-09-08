import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { DatasourceEntity } from '../../datasources/entities/datasource.entity';
import { OrganizationEntity } from '../../organizations/organization.entity';

@Entity({ name: 'llm_usage' })
@Index('IDX_llm_usage_organization_created_at', ['organizationId', 'createdAt'])
@Index('IDX_llm_usage_datasource_id', ['datasourceId'])
@Index('IDX_llm_usage_specification_version_id', ['specificationVersionId'])
@Index('IDX_llm_usage_knowledge_version_id', ['knowledgeVersionId'])
export class LlmUsageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'datasource_id', type: 'uuid', nullable: true })
  datasourceId!: string | null;

  @Column({ name: 'specification_version_id', type: 'uuid', nullable: true })
  specificationVersionId!: string | null;

  @Column({ name: 'knowledge_version_id', type: 'uuid', nullable: true })
  knowledgeVersionId!: string | null;

  @Column({ type: 'varchar', length: 80 })
  task!: string;

  @Column({ name: 'prompt_version', type: 'varchar', length: 120 })
  promptVersion!: string;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ type: 'varchar', length: 255 })
  model!: string;

  @Column({ name: 'input_tokens', type: 'integer', default: 0 })
  inputTokens!: number;

  @Column({ name: 'output_tokens', type: 'integer', default: 0 })
  outputTokens!: number;

  @Column({ name: 'total_tokens', type: 'integer', default: 0 })
  totalTokens!: number;

  @Column({ name: 'latency_ms', type: 'integer' })
  latencyMs!: number;

  @Column({ type: 'boolean' })
  success!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: OrganizationEntity;

  @ManyToOne(() => DatasourceEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'datasource_id' })
  datasource!: DatasourceEntity | null;
}
