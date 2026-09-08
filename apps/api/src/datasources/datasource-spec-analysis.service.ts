import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { DatasourceSpecAnalysisReport } from '@schemaiq/types';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, type Repository } from 'typeorm';

import { AuditEvent, AuditService } from '../audit/audit.service';
import { CredentialEncryptionService } from '../credentials/credential-encryption.service';
import { DatasourceStatus } from './enums/datasource.enums';
import { DatasourceSpecAnalysisStatus } from './enums/datasource-spec-analysis-status.enum';
import { DatasourceSpecAnalysisDto } from './dto/datasource-analysis.dto';
import { DatasourceSpecAnalysisEntity } from './entities/datasource-spec-analysis.entity';
import { KnowledgeEligibilityStatus } from './knowledge/datasource-knowledge.enums';
import { DatasourceKnowledgeService } from './knowledge/datasource-knowledge.service';
import { DatasourcesService } from './datasources.service';
import { DatasourceSpecAnalysisQueueService } from './queue/datasource-spec-analysis-queue.service';

const ANALYSIS_FAILED_CODE = 'SPEC_ANALYSIS_FAILED';
const MAX_STALLED_ANALYSES = 25;
const STALLED_ANALYSIS_AFTER_MS = 30 * 60_000;

export interface DatasourceSpecAnalysisResponse {
  id: string;
  datasourceId: string;
  databaseName: string;
  status: DatasourceSpecAnalysisStatus;
  result: string | null;
  matchScore: number | null;
  specificationId: string | null;
  specificationVersionId: string | null;
  schemaSnapshotId: string | null;
  compatibilityCheckId: string | null;
  report: DatasourceSpecAnalysisReport | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class DatasourceSpecAnalysisService {
  constructor(
    @InjectRepository(DatasourceSpecAnalysisEntity)
    private readonly repository: Repository<DatasourceSpecAnalysisEntity>,
    private readonly datasources: DatasourcesService,
    private readonly queue: DatasourceSpecAnalysisQueueService,
    private readonly encryption: CredentialEncryptionService,
    private readonly audit: AuditService,
    private readonly knowledge: DatasourceKnowledgeService,
  ) {}

  async create(
    organizationId: string,
    datasourceId: string,
    input: DatasourceSpecAnalysisDto,
  ): Promise<DatasourceSpecAnalysisResponse> {
    const datasource = await this.datasources.findOne(organizationId, datasourceId);
    if (datasource.status !== DatasourceStatus.Active) {
      throw new BadRequestException('Datasource must be active before analysis can begin');
    }

    const activeAnalysis = await this.repository.findOne({
      where: {
        databaseName: input.databaseName,
        datasourceId,
        organizationId,
        status: In([
          DatasourceSpecAnalysisStatus.Queued,
          DatasourceSpecAnalysisStatus.Processing,
        ]),
      },
    });
    if (activeAnalysis) return this.toResponse(activeAnalysis);

    const specification = this.encryption.encrypt(input.specification);
    const entity = await this.repository.save(
      this.repository.create({
        databaseName: input.databaseName,
        datasourceId,
        encryptedSpecification: specification.ciphertext,
        organizationId,
        specificationAuthTag: specification.authTag,
        specificationEncryptionVersion: specification.version,
        specificationIv: specification.iv,
        status: DatasourceSpecAnalysisStatus.Queued,
      }),
    );

    try {
      await this.queue.enqueue(entity.id, organizationId);
      await this.audit.record(organizationId, AuditEvent.DatasourceSpecAnalysisQueued, {
        analysisId: entity.id,
        databaseName: entity.databaseName,
        datasourceId,
      });
    } catch (error) {
      await this.markFailed(organizationId, entity.id);
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Specification analysis could not be queued');
    }

    return this.toResponse(entity);
  }

  async findLatest(
    organizationId: string,
    datasourceId: string,
  ): Promise<DatasourceSpecAnalysisResponse | null> {
    const entity = await this.repository.findOne({
      order: { createdAt: 'DESC' },
      where: { datasourceId, organizationId },
    });
    return entity ? this.toResponse(entity) : null;
  }

  async processQueued(organizationId: string, analysisId: string): Promise<void> {
    const claim = await this.repository.update(
      { id: analysisId, organizationId, status: DatasourceSpecAnalysisStatus.Queued },
      { startedAt: new Date(), status: DatasourceSpecAnalysisStatus.Processing },
    );
    if (!claim.affected) return;

    try {
      const entity = await this.repository
        .createQueryBuilder('analysis')
        .addSelect([
          'analysis.encryptedSpecification',
          'analysis.specificationIv',
          'analysis.specificationAuthTag',
          'analysis.specificationEncryptionVersion',
        ])
        .where('analysis.id = :analysisId', { analysisId })
        .andWhere('analysis.organizationId = :organizationId', { organizationId })
        .getOne();
      if (!entity) return;
      if (
        !entity.encryptedSpecification ||
        !entity.specificationIv ||
        !entity.specificationAuthTag ||
        typeof entity.specificationEncryptionVersion !== 'number'
      ) {
        throw new Error('Specification source is unavailable');
      }

      const specification = this.encryption.decrypt({
        authTag: entity.specificationAuthTag,
        ciphertext: entity.encryptedSpecification,
        iv: entity.specificationIv,
        version: entity.specificationEncryptionVersion,
      });
      const response = await this.knowledge.analyzeAndPersist(
        organizationId,
        entity.datasourceId,
        entity.databaseName,
        specification,
      );
      if (response.compatibility.knowledgeEligibility === KnowledgeEligibilityStatus.Eligible) {
        await this.knowledge.requestKnowledgeBuild(
          organizationId,
          entity.datasourceId,
          response.specificationId,
          response.specificationVersionId,
        );
      }
      const completedAt = new Date();
      const completion = await this.repository.update(
        { id: analysisId, organizationId, status: DatasourceSpecAnalysisStatus.Processing },
        {
          compatibilityCheckId: response.compatibility.id,
          completedAt,
          encryptedSpecification: null,
          errorCode: null,
          errorMessage: null,
          matchScore: response.compatibility.overallScore,
          report: response.report,
          result: response.report.summary,
          schemaSnapshotId: response.schemaSnapshotId,
          specificationAuthTag: null,
          specificationEncryptionVersion: null,
          specificationId: response.specificationId,
          specificationIv: null,
          specificationVersionId: response.specificationVersionId,
          status: DatasourceSpecAnalysisStatus.Completed,
        },
      );
      if (!completion.affected) return;
      await this.audit.record(organizationId, AuditEvent.DatasourceSpecAnalysisCompleted, {
        analysisId,
        databaseName: response.databaseName,
        datasourceId: entity.datasourceId,
      });
    } catch (error) {
      await this.markFailed(organizationId, analysisId);
      throw error;
    }
  }

  async requeueStalledAnalyses(): Promise<number> {
    const cutoff = new Date(Date.now() - STALLED_ANALYSIS_AFTER_MS);
    const stalled = await this.repository.find({
      order: { startedAt: 'ASC' },
      take: MAX_STALLED_ANALYSES,
      where: {
        startedAt: LessThan(cutoff),
        status: DatasourceSpecAnalysisStatus.Processing,
      },
    });
    let recovered = 0;
    for (const analysis of stalled) {
      const reset = await this.repository.update(
        {
          id: analysis.id,
          organizationId: analysis.organizationId,
          startedAt: LessThan(cutoff),
          status: DatasourceSpecAnalysisStatus.Processing,
        },
        {
          completedAt: null,
          errorCode: null,
          errorMessage: null,
          startedAt: null,
          status: DatasourceSpecAnalysisStatus.Queued,
        },
      );
      if (!reset.affected) continue;
      try {
        await this.queue.enqueue(analysis.id, analysis.organizationId);
        recovered += 1;
      } catch (error) {
        await this.markFailed(analysis.organizationId, analysis.id);
        throw error;
      }
    }
    return recovered;
  }

  private async markFailed(organizationId: string, analysisId: string): Promise<void> {
    const update = await this.repository.update(
      {
        id: analysisId,
        organizationId,
        status: In([
          DatasourceSpecAnalysisStatus.Queued,
          DatasourceSpecAnalysisStatus.Processing,
        ]),
      },
      {
        completedAt: new Date(),
        encryptedSpecification: null,
        errorCode: ANALYSIS_FAILED_CODE,
        errorMessage: 'SchemaIQ could not complete this analysis.',
        matchScore: null,
        report: null,
        result: null,
        specificationAuthTag: null,
        specificationEncryptionVersion: null,
        specificationIv: null,
        status: DatasourceSpecAnalysisStatus.Failed,
      },
    );
    if (update.affected) {
      await this.audit.record(organizationId, AuditEvent.DatasourceSpecAnalysisFailed, { analysisId });
    }
  }

  private toResponse(entity: DatasourceSpecAnalysisEntity): DatasourceSpecAnalysisResponse {
    return {
      completedAt: entity.completedAt,
      createdAt: entity.createdAt,
      databaseName: entity.databaseName,
      datasourceId: entity.datasourceId,
      errorCode: entity.errorCode ?? null,
      errorMessage: entity.errorMessage ?? null,
      id: entity.id,
      matchScore: entity.matchScore ?? null,
      compatibilityCheckId: entity.compatibilityCheckId ?? null,
      report: entity.report ?? null,
      result: entity.result ?? null,
      schemaSnapshotId: entity.schemaSnapshotId ?? null,
      specificationId: entity.specificationId ?? null,
      specificationVersionId: entity.specificationVersionId ?? null,
      startedAt: entity.startedAt ?? null,
      status: entity.status,
    };
  }
}
