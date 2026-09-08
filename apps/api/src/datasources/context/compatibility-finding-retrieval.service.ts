import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DatabaseContextAuthority,
  DatabaseContextSource,
  DatabaseSpecFindingSeverity,
  DatabaseSpecFindingStatus,
} from '@schemaiq/types';
import { In, type Repository } from 'typeorm';

import { SpecificationDatabaseFindingEntity } from '../knowledge/entities/specification-database-finding.entity';
import type { AnalyzedDatabaseContextRequest, DatabaseContextCandidate } from './database-context.types';
import { lexicalRelevance, normalizeIdentifier } from './database-context.types';

@Injectable()
export class CompatibilityFindingRetrievalService {
  constructor(
    @InjectRepository(SpecificationDatabaseFindingEntity)
    private readonly findings: Repository<SpecificationDatabaseFindingEntity>,
  ) {}

  async retrieve(
    organizationId: string,
    datasourceId: string,
    compatibilityCheckId: string,
    request: AnalyzedDatabaseContextRequest,
    maximum: number,
  ): Promise<DatabaseContextCandidate[]> {
    const findings = await this.findings.find({
      order: { createdAt: 'DESC' },
      take: maximum * 2,
      where: {
        compatibilityCheckId,
        datasourceId,
        organizationId,
        status: In([DatabaseSpecFindingStatus.Open, DatabaseSpecFindingStatus.Acknowledged]),
      },
    });
    return findings
      .map((finding) => {
        const tableMatch = finding.tableName !== null && request.identifiers.some(
          (identifier) => normalizeIdentifier(identifier) === normalizeIdentifier(finding.tableName ?? ''),
        );
        const relevance = Math.max(
          lexicalRelevance(request.tokens, `${finding.title} ${finding.description} ${finding.tableName ?? ''}`),
          tableMatch ? 1 : 0,
        );
        return {
          authority: DatabaseContextAuthority.HybridVerified,
          columnName: finding.columnName,
          confidence: finding.confidenceScore,
          content: finding.description,
          dedupeKey: `finding:${finding.id}`,
          exactMatch: tableMatch,
          id: `finding:${finding.id}`,
          importance: severityScore(finding.severity),
          kind: 'FINDING' as const,
          relevance,
          relationshipName: finding.relationshipName,
          semanticSimilarity: 0,
          source: DatabaseContextSource.CompatibilityFinding,
          tableName: finding.tableName,
          verified: true,
        };
      })
      .sort((left, right) => right.relevance - left.relevance || right.importance - left.importance)
      .slice(0, maximum);
  }
}

function severityScore(severity: DatabaseSpecFindingSeverity): number {
  switch (severity) {
    case DatabaseSpecFindingSeverity.Critical:
      return 100;
    case DatabaseSpecFindingSeverity.High:
      return 90;
    case DatabaseSpecFindingSeverity.Medium:
      return 70;
    case DatabaseSpecFindingSeverity.Low:
      return 50;
    case DatabaseSpecFindingSeverity.Info:
      return 30;
  }
}
