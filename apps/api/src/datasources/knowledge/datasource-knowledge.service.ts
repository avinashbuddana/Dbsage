import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import type { Repository } from 'typeorm';
import type { DatasourceSpecAnalysisReport } from '@schemaiq/types';

import { AppConfigService } from '../../config/app-config.service';
import { DatasourceCompatibilityService, type DetailedCompatibilityAnalysis } from './datasource-compatibility.service';
import {
  CompatibilityStatus,
  DatabaseSpecFindingStatus,
  DatasourceKnowledgeStaleness,
  DatasourceKnowledgeVersionStatus,
  KnowledgeEligibilityStatus,
} from './datasource-knowledge.enums';
import { DatasourceKnowledgeVersionEntity } from './entities/datasource-knowledge-version.entity';
import { DatasourceSchemaSnapshotEntity } from './entities/datasource-schema-snapshot.entity';
import { DatasourceSpecificationEntity } from './entities/datasource-specification.entity';
import { DatasourceSpecificationVersionEntity } from './entities/datasource-specification-version.entity';
import { SpecificationCompatibilityCheckEntity } from './entities/specification-compatibility-check.entity';
import { SpecificationDatabaseFindingEntity } from './entities/specification-database-finding.entity';
import {
  SpecificationEntityMappingEntity,
  SpecificationFieldMappingEntity,
  SpecificationRelationshipMappingEntity,
} from './entities/specification-mapping.entity';
import { DatasourceKnowledgeBuildQueueService } from './queue/datasource-knowledge-build-queue.service';

export interface CompatibilityResponse {
  id: string;
  overallScore: number;
  entityScore: number;
  fieldScore: number;
  relationshipScore: number;
  constraintScore: number;
  semanticScore: number;
  anchorScore: number;
  status: CompatibilityStatus;
  knowledgeEligibility: KnowledgeEligibilityStatus;
  reason: string;
  matchedCount: number;
  partiallyMatchedCount: number;
  missingInDatabaseCount: number;
  notMentionedInSpecCount: number;
  conflictingCount: number;
  needsReviewCount: number;
  createdAt: Date;
}

@Injectable()
export class DatasourceKnowledgeService {
  constructor(
    @InjectRepository(DatasourceSpecificationEntity)
    private readonly specifications: Repository<DatasourceSpecificationEntity>,
    @InjectRepository(DatasourceSpecificationVersionEntity)
    private readonly versions: Repository<DatasourceSpecificationVersionEntity>,
    @InjectRepository(DatasourceSchemaSnapshotEntity)
    private readonly snapshots: Repository<DatasourceSchemaSnapshotEntity>,
    @InjectRepository(SpecificationCompatibilityCheckEntity)
    private readonly checks: Repository<SpecificationCompatibilityCheckEntity>,
    @InjectRepository(SpecificationDatabaseFindingEntity)
    private readonly findings: Repository<SpecificationDatabaseFindingEntity>,
    @InjectRepository(SpecificationEntityMappingEntity)
    private readonly entityMappings: Repository<SpecificationEntityMappingEntity>,
    @InjectRepository(SpecificationFieldMappingEntity)
    private readonly fieldMappings: Repository<SpecificationFieldMappingEntity>,
    @InjectRepository(SpecificationRelationshipMappingEntity)
    private readonly relationshipMappings: Repository<SpecificationRelationshipMappingEntity>,
    @InjectRepository(DatasourceKnowledgeVersionEntity)
    private readonly knowledgeVersions: Repository<DatasourceKnowledgeVersionEntity>,
    private readonly compatibility: DatasourceCompatibilityService,
    private readonly queue: DatasourceKnowledgeBuildQueueService,
    private readonly config: AppConfigService,
  ) {}

  async analyzeAndPersist(
    organizationId: string,
    datasourceId: string,
    databaseName: string,
    specification: string,
  ): Promise<{
    specificationId: string;
    specificationVersionId: string;
    schemaSnapshotId: string;
    compatibility: CompatibilityResponse;
    databaseName: string;
    report: DatasourceSpecAnalysisReport;
  }> {
    const analysis = await this.compatibility.analyze(organizationId, datasourceId, databaseName, specification);
    const specificationEntity = await this.findOrCreateSpecification(organizationId, datasourceId, databaseName);
    const version = await this.createVersion(specificationEntity, organizationId, datasourceId, analysis);
    const snapshot = await this.findOrCreateSnapshot(organizationId, datasourceId, analysis);
    const check = await this.saveCompatibilityCheck(organizationId, datasourceId, version.id, snapshot.id, analysis);
    await this.saveFindingsAndMappings(organizationId, datasourceId, version.id, snapshot.id, check.id, analysis);
    const compatibility = this.toCompatibilityResponse(check);
    return {
      compatibility,
      databaseName: analysis.snapshot.databaseName,
      report: {
        assumptions: [analysis.reason],
        requirements: analysis.requirements.map((requirement) => {
          const mapping = analysis.entityMappings.find((candidate) => candidate.requirementId === requirement.id);
          return {
            evidence: mapping ? `Verified table: ${mapping.tableName}` : 'No matching table was verified.',
            requirement: requirement.description,
            status: mapping?.matchType === 'PARTIAL' ? 'PARTIAL' : mapping ? 'MATCHED' : 'MISSING',
          };
        }),
        summary: `${compatibility.status}: ${compatibility.reason}`,
      },
      schemaSnapshotId: snapshot.id,
      specificationId: specificationEntity.id,
      specificationVersionId: version.id,
    };
  }

  async findCompatibility(
    organizationId: string,
    datasourceId: string,
    specificationId: string,
    versionId: string,
  ): Promise<CompatibilityResponse> {
    await this.requireVersion(organizationId, datasourceId, specificationId, versionId);
    const check = await this.checks.findOne({
      order: { createdAt: 'DESC' },
      where: { datasourceId, organizationId, specificationVersionId: versionId },
    });
    if (!check) throw new NotFoundException('Compatibility analysis was not found');
    return this.toCompatibilityResponse(check);
  }

  async findFindings(
    organizationId: string,
    datasourceId: string,
    specificationId: string,
    versionId: string,
    page: number,
    limit: number,
    filters: { findingType?: string; severity?: string; status?: string },
  ): Promise<{ items: SpecificationDatabaseFindingEntity[]; page: number; limit: number; total: number }> {
    await this.requireVersion(organizationId, datasourceId, specificationId, versionId);
    const check = await this.checks.findOne({
      order: { createdAt: 'DESC' },
      where: { datasourceId, organizationId, specificationVersionId: versionId },
    });
    if (!check) throw new NotFoundException('Compatibility analysis was not found');
    const query = this.findings
      .createQueryBuilder('finding')
      .where('finding.organizationId = :organizationId', { organizationId })
      .andWhere('finding.datasourceId = :datasourceId', { datasourceId })
      .andWhere('finding.compatibilityCheckId = :compatibilityCheckId', { compatibilityCheckId: check.id })
      .orderBy('finding.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);
    if (filters.findingType) query.andWhere('finding.findingType = :findingType', { findingType: filters.findingType });
    if (filters.severity) query.andWhere('finding.severity = :severity', { severity: filters.severity });
    if (filters.status) query.andWhere('finding.status = :status', { status: filters.status });
    const [items, total] = await query.getManyAndCount();
    return { items, limit, page, total };
  }

  async knowledgeStatus(organizationId: string, datasourceId: string): Promise<{
    activeKnowledgeVersion: string | null;
    specificationVersionId: string | null;
    schemaSnapshotId: string | null;
    status: DatasourceKnowledgeVersionStatus | null;
    knowledgeCount: number;
    chunkCount: number;
    staleness: DatasourceKnowledgeStaleness;
  }> {
    const active = await this.knowledgeVersions.findOne({
      order: { activatedAt: 'DESC' },
      where: { datasourceId, organizationId, status: DatasourceKnowledgeVersionStatus.Active },
    });
    const latestVersion = await this.versions.findOne({
      order: { createdAt: 'DESC' },
      where: { datasourceId, organizationId },
    });
    const latestSnapshot = await this.snapshots.findOne({
      order: { createdAt: 'DESC' },
      where: { datasourceId, organizationId },
    });
    const building = await this.knowledgeVersions.findOne({
      where: { datasourceId, organizationId, status: DatasourceKnowledgeVersionStatus.Building },
    });
    const failed = await this.knowledgeVersions.findOne({
      where: { datasourceId, organizationId, status: DatasourceKnowledgeVersionStatus.Failed },
    });
    const staleness = building
      ? DatasourceKnowledgeStaleness.Rebuilding
      : failed
        ? DatasourceKnowledgeStaleness.Failed
        : !active
          ? DatasourceKnowledgeStaleness.SchemaChanged
          : active.specificationVersionId !== latestVersion?.id
            ? DatasourceKnowledgeStaleness.SpecChanged
            : active.schemaSnapshotId !== latestSnapshot?.id
              ? DatasourceKnowledgeStaleness.SchemaChanged
              : DatasourceKnowledgeStaleness.Current;
    return {
      activeKnowledgeVersion: active?.id ?? null,
      chunkCount: active?.chunkCount ?? 0,
      knowledgeCount: active?.knowledgeCount ?? 0,
      schemaSnapshotId: active?.schemaSnapshotId ?? null,
      specificationVersionId: active?.specificationVersionId ?? null,
      status: active?.status ?? null,
      staleness,
    };
  }

  async createKnowledgeVersion(
    organizationId: string,
    datasourceId: string,
    specificationId: string,
    versionId: string,
  ): Promise<DatasourceKnowledgeVersionEntity> {
    await this.requireVersion(organizationId, datasourceId, specificationId, versionId);
    const check = await this.checks.findOne({
      order: { createdAt: 'DESC' },
      where: { datasourceId, organizationId, specificationVersionId: versionId },
    });
    if (!check) throw new NotFoundException('Compatibility analysis was not found');
    if (check.knowledgeEligibility !== KnowledgeEligibilityStatus.Eligible) {
      throw new BadRequestException('Knowledge can only be built from eligible compatibility results');
    }
    const existing = await this.knowledgeVersions.findOne({ where: { compatibilityCheckId: check.id } });
    if (existing) return existing;
    const latest = await this.knowledgeVersions.findOne({
      order: { versionNumber: 'DESC' },
      where: { datasourceId, organizationId },
    });
    return this.knowledgeVersions.save(
      this.knowledgeVersions.create({
        compatibilityCheckId: check.id,
        datasourceId,
        knowledgeCount: 0,
        schemaSnapshotId: check.schemaSnapshotId,
        specificationVersionId: versionId,
        organizationId,
        chunkCount: 0,
        status: DatasourceKnowledgeVersionStatus.Building,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
      }),
    );
  }

  async requestKnowledgeBuild(
    organizationId: string,
    datasourceId: string,
    specificationId: string,
    versionId: string,
  ): Promise<DatasourceKnowledgeVersionEntity> {
    const version = await this.createKnowledgeVersion(organizationId, datasourceId, specificationId, versionId);
    if (version.status !== DatasourceKnowledgeVersionStatus.Building) return version;
    try {
      await this.queue.enqueue({
        compatibilityCheckId: version.compatibilityCheckId,
        datasourceId,
        knowledgeVersionId: version.id,
        organizationId,
        schemaSnapshotId: version.schemaSnapshotId,
        specificationVersionId: version.specificationVersionId,
      });
      return version;
    } catch (error) {
      await this.knowledgeVersions.update(
        { datasourceId, id: version.id, organizationId, status: DatasourceKnowledgeVersionStatus.Building },
        { completedAt: new Date(), status: DatasourceKnowledgeVersionStatus.Failed },
      );
      throw error;
    }
  }

  async refreshLatest(organizationId: string, datasourceId: string): Promise<CompatibilityResponse> {
    const version = await this.versions.findOne({
      order: { createdAt: 'DESC' },
      where: { datasourceId, organizationId },
    });
    if (!version) throw new NotFoundException('No completed specification is available for refresh');
    const specification = await this.specifications.findOne({
      where: { datasourceId, id: version.specificationId, organizationId },
    });
    if (!specification) throw new NotFoundException('No completed specification is available for refresh');
    const analysis = await this.compatibility.reanalyzeExtracted(
      organizationId,
      datasourceId,
      specification.databaseName,
      version.extractionConfidence,
      version.requirements,
      version.expectedModel,
    );
    const snapshot = await this.findOrCreateSnapshot(organizationId, datasourceId, analysis);
    const existing = await this.checks.findOne({
      where: { schemaSnapshotId: snapshot.id, specificationVersionId: version.id },
    });
    if (existing) return this.toCompatibilityResponse(existing);
    const check = await this.saveCompatibilityCheck(organizationId, datasourceId, version.id, snapshot.id, analysis);
    await this.saveFindingsAndMappings(organizationId, datasourceId, version.id, snapshot.id, check.id, analysis);
    if (this.config.knowledge.autoRefreshOnSchemaChange && check.knowledgeEligibility === KnowledgeEligibilityStatus.Eligible) {
      await this.requestKnowledgeBuild(organizationId, datasourceId, specification.id, version.id);
    }
    return this.toCompatibilityResponse(check);
  }

  private async findOrCreateSpecification(
    organizationId: string,
    datasourceId: string,
    databaseName: string,
  ): Promise<DatasourceSpecificationEntity> {
    const existing = await this.specifications.findOne({ where: { databaseName, datasourceId, organizationId } });
    if (existing) return existing;
    return this.specifications.save(this.specifications.create({ databaseName, datasourceId, organizationId }));
  }

  private async createVersion(
    specification: DatasourceSpecificationEntity,
    organizationId: string,
    datasourceId: string,
    analysis: DetailedCompatibilityAnalysis,
  ): Promise<DatasourceSpecificationVersionEntity> {
    const previous = await this.versions.findOne({
      order: { versionNumber: 'DESC' },
      where: { specificationId: specification.id },
    });
    return this.versions.save(
      this.versions.create({
        completedAt: new Date(),
        datasourceId,
        expectedModel: analysis.expectedModel,
        extractionConfidence: analysis.extractionConfidence,
        organizationId,
        requirements: analysis.requirements,
        specificationId: specification.id,
        versionNumber: (previous?.versionNumber ?? 0) + 1,
      }),
    );
  }

  private async findOrCreateSnapshot(
    organizationId: string,
    datasourceId: string,
    analysis: DetailedCompatibilityAnalysis,
  ): Promise<DatasourceSchemaSnapshotEntity> {
    const schema = analysis.snapshot as unknown as Record<string, unknown>;
    const contentHash = hash(JSON.stringify(schema));
    const existing = await this.snapshots.findOne({
      where: { contentHash, databaseName: analysis.snapshot.databaseName, datasourceId, organizationId },
    });
    if (existing) return existing;
    return this.snapshots.save(
      this.snapshots.create({
        completedAt: new Date(),
        contentHash,
        databaseName: analysis.snapshot.databaseName,
        datasourceId,
        organizationId,
        schema,
      }),
    );
  }

  private async saveCompatibilityCheck(
    organizationId: string,
    datasourceId: string,
    specificationVersionId: string,
    schemaSnapshotId: string,
    analysis: DetailedCompatibilityAnalysis,
  ): Promise<SpecificationCompatibilityCheckEntity> {
    return this.checks.save(
      this.checks.create({
        anchorScore: analysis.anchorScore,
        constraintScore: analysis.constraintScore,
        datasourceId,
        entityScore: analysis.entityScore,
        fieldScore: analysis.fieldScore,
        knowledgeEligibility: analysis.knowledgeEligibility,
        organizationId,
        overallScore: analysis.overallScore,
        reason: analysis.reason,
        relationshipScore: analysis.relationshipScore,
        schemaSnapshotId,
        semanticScore: analysis.semanticScore,
        specificationVersionId,
        status: analysis.status,
        summary: analysis.summary,
      }),
    );
  }

  private async saveFindingsAndMappings(
    organizationId: string,
    datasourceId: string,
    specificationVersionId: string,
    schemaSnapshotId: string,
    compatibilityCheckId: string,
    analysis: DetailedCompatibilityAnalysis,
  ): Promise<void> {
    await this.findings.save(
      analysis.findings.map((finding) =>
        this.findings.create({
          ...finding,
          compatibilityCheckId,
          datasourceId,
          organizationId,
          specificationVersionId,
          schemaSnapshotId,
          status: DatabaseSpecFindingStatus.Open,
        }),
      ),
    );
    await this.entityMappings.save(
      analysis.entityMappings.map((mapping) => this.entityMappings.create({ ...mapping, compatibilityCheckId, datasourceId, organizationId, schemaSnapshotId, specificationVersionId })),
    );
    await this.fieldMappings.save(
      analysis.fieldMappings.map((mapping) => this.fieldMappings.create({ ...mapping, compatibilityCheckId, datasourceId, organizationId, schemaSnapshotId, specificationVersionId })),
    );
    await this.relationshipMappings.save(
      analysis.relationshipMappings.map((mapping) => this.relationshipMappings.create({ ...mapping, compatibilityCheckId, datasourceId, organizationId, schemaSnapshotId, specificationVersionId })),
    );
  }

  private async requireVersion(
    organizationId: string,
    datasourceId: string,
    specificationId: string,
    versionId: string,
  ): Promise<void> {
    const version = await this.versions.findOne({
      where: { datasourceId, id: versionId, organizationId, specificationId },
    });
    if (!version) throw new NotFoundException('Specification version was not found');
  }

  private toCompatibilityResponse(check: SpecificationCompatibilityCheckEntity): CompatibilityResponse {
    return {
      anchorScore: check.anchorScore,
      conflictingCount: check.summary.conflictingCount ?? 0,
      constraintScore: check.constraintScore,
      createdAt: check.createdAt,
      entityScore: check.entityScore,
      fieldScore: check.fieldScore,
      id: check.id,
      knowledgeEligibility: check.knowledgeEligibility,
      matchedCount: check.summary.matchedCount ?? 0,
      missingInDatabaseCount: check.summary.missingInDatabaseCount ?? 0,
      needsReviewCount: check.summary.needsReviewCount ?? 0,
      notMentionedInSpecCount: check.summary.notMentionedInSpecCount ?? 0,
      overallScore: check.overallScore,
      partiallyMatchedCount: check.summary.partiallyMatchedCount ?? 0,
      reason: check.reason,
      relationshipScore: check.relationshipScore,
      semanticScore: check.semanticScore,
      status: check.status,
    };
  }
}

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
