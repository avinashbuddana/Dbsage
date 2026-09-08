import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DatabaseContextAuthority,
  DatabaseContextSource,
  DatabaseKnowledgeSourceType,
} from '@schemaiq/types';
import { In, type Repository } from 'typeorm';

import { DatabaseKnowledgeEntity } from '../knowledge/entities/database-knowledge.entity';
import type { AnalyzedDatabaseContextRequest, DatabaseContextCandidate } from './database-context.types';
import { lexicalRelevance, normalizeIdentifier } from './database-context.types';

@Injectable()
export class KnowledgeRetrievalService {
  constructor(
    @InjectRepository(DatabaseKnowledgeEntity)
    private readonly knowledge: Repository<DatabaseKnowledgeEntity>,
  ) {}

  async retrieve(
    organizationId: string,
    datasourceId: string,
    knowledgeVersionId: string,
    request: AnalyzedDatabaseContextRequest,
    maximum: number,
  ): Promise<DatabaseContextCandidate[]> {
    const records = await this.knowledge.find({
      order: { importanceScore: 'DESC', createdAt: 'DESC' },
      take: maximum * 2,
      where: { active: true, datasourceId, knowledgeVersionId, organizationId },
    });
    return records
      .map((record) => knowledgeCandidate(record, request, 0))
      .sort((left, right) => right.relevance - left.relevance || right.importance - left.importance)
      .slice(0, maximum);
  }

  async byIds(
    organizationId: string,
    datasourceId: string,
    knowledgeVersionId: string,
    ids: readonly string[],
  ): Promise<Map<string, DatabaseKnowledgeEntity>> {
    if (ids.length === 0) return new Map();
    const records = await this.knowledge.find({
      where: {
        active: true,
        datasourceId,
        id: In([...new Set(ids)]),
        knowledgeVersionId,
        organizationId,
      },
    });
    return new Map(records.map((record) => [record.id, record]));
  }
}

export function knowledgeCandidate(
  record: DatabaseKnowledgeEntity,
  request: AnalyzedDatabaseContextRequest,
  semanticSimilarity: number,
): DatabaseContextCandidate {
  const exactMatch = request.identifiers.some(
    (identifier) => normalizeIdentifier(record.subject).includes(normalizeIdentifier(identifier)),
  );
  return {
    authority: authorityFor(record.sourceType),
    columnName: null,
    confidence: record.confidenceScore,
    content: record.content,
    dedupeKey: `knowledge:${record.knowledgeType}:${normalizeIdentifier(record.subject)}`,
    exactMatch,
    id: `knowledge:${record.id}`,
    importance: record.importanceScore,
    kind: 'KNOWLEDGE',
    relevance: Math.max(lexicalRelevance(request.tokens, `${record.subject} ${record.content}`), exactMatch ? 1 : 0),
    relationshipName: null,
    semanticSimilarity,
    source: semanticSimilarity > 0 ? DatabaseContextSource.VectorKnowledge : DatabaseContextSource.Knowledge,
    tableName: tableNameFromSubject(record.subject),
    verified: record.verified,
  };
}

function authorityFor(source: DatabaseKnowledgeSourceType): DatabaseContextAuthority {
  switch (source) {
    case DatabaseKnowledgeSourceType.UserConfirmed:
      return DatabaseContextAuthority.UserConfirmed;
    case DatabaseKnowledgeSourceType.HybridVerified:
      return DatabaseContextAuthority.HybridVerified;
    case DatabaseKnowledgeSourceType.Specification:
      return DatabaseContextAuthority.VerifiedSpecification;
    case DatabaseKnowledgeSourceType.DatabaseSchema:
      return DatabaseContextAuthority.DatabaseSemantic;
    case DatabaseKnowledgeSourceType.Generated:
      return DatabaseContextAuthority.LlmDerived;
  }
}

function tableNameFromSubject(subject: string): string | null {
  const [tableName] = subject.split('.');
  const normalized = tableName?.trim();
  return normalized === undefined || normalized.length === 0 ? null : normalized;
}
