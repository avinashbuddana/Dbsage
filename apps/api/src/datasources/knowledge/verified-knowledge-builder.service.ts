import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { In, type Repository } from 'typeorm';
import { z } from 'zod';

import { LlmTask } from '../../llm/enums/llm-task.enum';
import { LlmService } from '../../llm/llm.service';
import { EmbeddingService } from './embedding.service';
import {
  DatabaseKnowledgeSourceType,
  DatabaseKnowledgeType,
  DatabaseSpecFindingSeverity,
  DatasourceKnowledgeVersionStatus,
  KnowledgeEligibilityStatus,
} from './datasource-knowledge.enums';
import { DatabaseKnowledgeEntity } from './entities/database-knowledge.entity';
import { DatasourceKnowledgeVersionEntity } from './entities/datasource-knowledge-version.entity';
import { KnowledgeChunkEntity } from './entities/knowledge-chunk.entity';
import { SpecificationCompatibilityCheckEntity } from './entities/specification-compatibility-check.entity';
import { SpecificationDatabaseFindingEntity } from './entities/specification-database-finding.entity';
import {
  SpecificationEntityMappingEntity,
  SpecificationFieldMappingEntity,
  SpecificationRelationshipMappingEntity,
} from './entities/specification-mapping.entity';

const knowledgeItemSchema = z.object({
  content: z.string().min(1).max(1_200),
  sourceId: z.uuid(),
});
const knowledgeOutputSchema = z.object({ items: z.array(knowledgeItemSchema).min(1).max(40) });

interface KnowledgeCandidate {
  sourceId: string;
  type: DatabaseKnowledgeType;
  subjectType: string;
  subject: string;
  content: string;
  importanceScore: number;
  confidenceScore: number;
}

@Injectable()
export class VerifiedKnowledgeBuilderService {
  constructor(
    @InjectRepository(DatasourceKnowledgeVersionEntity)
    private readonly versions: Repository<DatasourceKnowledgeVersionEntity>,
    @InjectRepository(SpecificationCompatibilityCheckEntity)
    private readonly checks: Repository<SpecificationCompatibilityCheckEntity>,
    @InjectRepository(SpecificationEntityMappingEntity)
    private readonly entityMappings: Repository<SpecificationEntityMappingEntity>,
    @InjectRepository(SpecificationFieldMappingEntity)
    private readonly fieldMappings: Repository<SpecificationFieldMappingEntity>,
    @InjectRepository(SpecificationRelationshipMappingEntity)
    private readonly relationshipMappings: Repository<SpecificationRelationshipMappingEntity>,
    @InjectRepository(SpecificationDatabaseFindingEntity)
    private readonly findings: Repository<SpecificationDatabaseFindingEntity>,
    @InjectRepository(DatabaseKnowledgeEntity)
    private readonly knowledge: Repository<DatabaseKnowledgeEntity>,
    @InjectRepository(KnowledgeChunkEntity)
    private readonly chunks: Repository<KnowledgeChunkEntity>,
    private readonly llm: LlmService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async build(organizationId: string, datasourceId: string, knowledgeVersionId: string): Promise<void> {
    const version = await this.versions.findOne({
      where: { datasourceId, id: knowledgeVersionId, organizationId, status: DatasourceKnowledgeVersionStatus.Building },
    });
    if (!version) return;
    try {
      const check = await this.checks.findOne({
        where: { datasourceId, id: version.compatibilityCheckId, organizationId },
      });
      if (check?.knowledgeEligibility !== KnowledgeEligibilityStatus.Eligible) {
        throw new Error('Knowledge eligibility is no longer valid');
      }
      const candidates = await this.candidates(version);
      if (candidates.length === 0) throw new Error('No verified knowledge candidates are available');
      const generated = await this.llm.generateStructured({
        datasourceId,
        knowledgeVersionId: version.id,
        messages: [
          {
            content: 'You turn verified database/specification facts into concise retrieval knowledge. Return only source IDs supplied below. Do not add unverified facts, customer rows, or credentials.',
            role: 'system',
          },
          { content: JSON.stringify(candidates), role: 'user' },
        ],
        organizationId,
        schema: knowledgeOutputSchema,
        schemaName: 'verified_datasource_knowledge',
        task: LlmTask.VerifiedKnowledgeGeneration,
      });
      const bySource = new Map(candidates.map((candidate) => [candidate.sourceId, candidate]));
      const selected = generated.data.items
        .map((item) => ({ candidate: bySource.get(item.sourceId), content: normalizeContent(item.content) }))
        .filter((item): item is { candidate: KnowledgeCandidate; content: string } => item.candidate !== undefined)
        .filter((item, index, items) => items.findIndex((candidate) => candidate.candidate.sourceId === item.candidate.sourceId) === index);
      if (selected.length === 0) throw new Error('Knowledge generation returned no verified items');
      const records = await this.knowledge.save(
        selected.map(({ candidate, content }) =>
          this.knowledge.create({
            active: false,
            confidenceScore: candidate.confidenceScore,
            content,
            contentHash: hash(content),
            datasourceId,
            importanceScore: candidate.importanceScore,
            knowledgeType: candidate.type,
            knowledgeVersionId: version.id,
            organizationId,
            sourceId: candidate.sourceId,
            sourceType: DatabaseKnowledgeSourceType.HybridVerified,
            subject: candidate.subject,
            subjectId: candidate.sourceId,
            subjectType: candidate.subjectType,
            verified: true,
          }),
        ),
      );
      await this.embedAndStore(version, records);
      await this.activate(version, records);
    } catch (error) {
      await this.versions.update(
        { datasourceId, id: knowledgeVersionId, organizationId },
        { completedAt: new Date(), status: DatasourceKnowledgeVersionStatus.Failed },
      );
      throw error;
    }
  }

  private async candidates(version: DatasourceKnowledgeVersionEntity): Promise<KnowledgeCandidate[]> {
    const [entities, fields, relationships, findings] = await Promise.all([
      this.entityMappings.find({ where: { compatibilityCheckId: version.compatibilityCheckId, verified: true } }),
      this.fieldMappings.find({ where: { compatibilityCheckId: version.compatibilityCheckId, verified: true } }),
      this.relationshipMappings.find({ where: { compatibilityCheckId: version.compatibilityCheckId, verified: true } }),
      this.findings.find({
        where: {
          compatibilityCheckId: version.compatibilityCheckId,
          findingType: In(['MISSING_IN_DATABASE', 'MISSING_UNIQUE_CONSTRAINT', 'MISSING_FOREIGN_KEY']),
        },
      }),
    ]);
    return [
      ...entities.map((mapping) => ({
        confidenceScore: mapping.confidenceScore,
        content: `The ${mapping.tableName} table represents the ${mapping.specEntity} concept from the verified specification.`,
        importanceScore: 85,
        sourceId: mapping.id,
        subject: mapping.tableName,
        subjectType: 'TABLE',
        type: DatabaseKnowledgeType.TableMeaning,
      })),
      ...fields.slice(0, 20).map((mapping) => ({
        confidenceScore: mapping.confidenceScore,
        content: `The ${mapping.tableName}.${mapping.columnName} column implements the verified ${mapping.specField} field.`,
        importanceScore: 70,
        sourceId: mapping.id,
        subject: `${mapping.tableName}.${mapping.columnName}`,
        subjectType: 'COLUMN',
        type: DatabaseKnowledgeType.FieldMapping,
      })),
      ...relationships.map((mapping) => ({
        confidenceScore: mapping.confidenceScore,
        content: `The ${mapping.sourceTableName} to ${mapping.targetTableName} relationship is verified by a database foreign key.`,
        importanceScore: 80,
        sourceId: mapping.id,
        subject: mapping.relationshipName,
        subjectType: 'RELATIONSHIP',
        type: DatabaseKnowledgeType.Relationship,
      })),
      ...findings.slice(0, 15).map((finding) => ({
        confidenceScore: finding.confidenceScore,
        content: `The current schema does not meet this verified requirement: ${finding.description}`,
        importanceScore: finding.severity === DatabaseSpecFindingSeverity.Critical ? 100 : finding.severity === DatabaseSpecFindingSeverity.High ? 90 : 70,
        sourceId: finding.id,
        subject: finding.title,
        subjectType: 'UNMET_REQUIREMENT',
        type: DatabaseKnowledgeType.UnmetRequirement,
      })),
    ].slice(0, 40);
  }

  private async embedAndStore(
    version: DatasourceKnowledgeVersionEntity,
    records: DatabaseKnowledgeEntity[],
  ): Promise<void> {
    const model = this.embeddings.model;
    const hashes = records.map((record) => record.contentHash);
    const reusable = await this.chunks.find({
      where: {
        contentHash: In(hashes),
        datasourceId: version.datasourceId,
        embeddingModel: model,
        organizationId: version.organizationId,
      },
    });
    const reusableByHash = new Map(reusable.filter((chunk) => chunk.embedding !== null).map((chunk) => [chunk.contentHash, chunk.embedding]));
    const missing = records.filter((record) => !reusableByHash.has(record.contentHash));
    const generated = missing.length === 0 ? [] : await this.embeddings.embed(missing.map((record) => record.content));
    for (const [index, record] of missing.entries()) reusableByHash.set(record.contentHash, vector(generated[index]));
    await this.chunks.save(
      records.map((record) =>
        this.chunks.create({
          active: false,
          confidenceScore: record.confidenceScore,
          content: record.content,
          contentHash: record.contentHash,
          datasourceId: record.datasourceId,
          embedding: reusableByHash.get(record.contentHash) ?? null,
          embeddingDimensions: this.embeddings.dimensions,
          embeddingModel: model,
          importanceScore: record.importanceScore,
          knowledgeId: record.id,
          knowledgeVersionId: version.id,
          metadata: {
            knowledgeType: record.knowledgeType,
            schemaSnapshotId: version.schemaSnapshotId,
            specificationVersionId: version.specificationVersionId,
          },
          organizationId: record.organizationId,
        }),
      ),
    );
  }

  private async activate(version: DatasourceKnowledgeVersionEntity, records: DatabaseKnowledgeEntity[]): Promise<void> {
    const now = new Date();
    await this.versions.update(
      { datasourceId: version.datasourceId, organizationId: version.organizationId, status: DatasourceKnowledgeVersionStatus.Active },
      { status: DatasourceKnowledgeVersionStatus.Superseded, supersededAt: now },
    );
    await this.knowledge.update(
      { datasourceId: version.datasourceId, organizationId: version.organizationId, active: true },
      { active: false },
    );
    await this.chunks.update(
      { datasourceId: version.datasourceId, organizationId: version.organizationId, active: true },
      { active: false },
    );
    await this.knowledge.update({ id: In(records.map((record) => record.id)) }, { active: true });
    await this.chunks.update({ knowledgeVersionId: version.id }, { active: true });
    await this.versions.update(
      { id: version.id, status: DatasourceKnowledgeVersionStatus.Building },
      {
        activatedAt: now,
        chunkCount: records.length,
        completedAt: now,
        knowledgeCount: records.length,
        status: DatasourceKnowledgeVersionStatus.Active,
      },
    );
  }
}

function normalizeContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

function hash(content: string): string {
  return createHash('sha256').update(normalizeContent(content).toLowerCase()).digest('hex');
}

function vector(values: number[] | undefined): string {
  if (!values) throw new Error('Embedding provider returned too few vectors');
  return `[${values.join(',')}]`;
}
