import {
  DatabaseContextAuthority,
  DatabaseContextPurpose,
  DatabaseContextSource,
  DatasourceKnowledgeStaleness,
} from '@schemaiq/types';

import { DatabaseContextService } from './database-context.service';
import type { CompatibilityFindingRetrievalService } from './compatibility-finding-retrieval.service';
import type { AppConfigService } from '../../config/app-config.service';
import { schemaTableCandidate } from './database-metadata-retrieval.service';
import type { DatabaseContextCandidate, DatabaseContextRequest } from './database-context.types';
import type { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import type { VectorKnowledgeSearchService } from './vector-knowledge-search.service';

const orders = {
  columns: [
    { name: 'id', nullable: false, type: 'bigint' },
    { name: 'customer_id', nullable: false, type: 'bigint' },
  ],
  foreignKeys: [
    {
      columnName: 'customer_id',
      constraintName: 'fk_orders_customer',
      referencedColumnName: 'id',
      referencedTableName: 'customers',
    },
  ],
  name: 'orders',
  primaryKey: ['id'],
  type: 'BASE TABLE',
  uniqueConstraints: [],
};

const customers = {
  columns: [{ name: 'id', nullable: false, type: 'bigint' }],
  foreignKeys: [],
  name: 'customers',
  primaryKey: ['id'],
  type: 'BASE TABLE',
  uniqueConstraints: [],
};

function setup(schemaSnapshotId = 'snapshot-id') {
  const datasources = { findOne: jest.fn().mockResolvedValue({ id: 'datasource-id' }) };
  const knowledgeVersions = {
    findOne: jest.fn().mockResolvedValue({
      compatibilityCheckId: 'check-id',
      id: 'knowledge-id',
      schemaSnapshotId,
    }),
  };
  const metadata = {
    latestSnapshot: jest.fn().mockResolvedValue({
      entity: { id: 'snapshot-id' },
      schema: { databaseName: 'commerce', tables: [orders, customers], truncated: false },
    }),
    retrieve: jest.fn().mockReturnValue([schemaTableCandidate(orders, true, 1)]),
  };
  const requestAnalyzer = {
    analyze: jest.fn((request: DatabaseContextRequest) => ({
      identifiers: ['Order'],
      purpose: request.purpose,
      query: request.query,
      requestedColumns: [],
      requestedConcepts: [],
      requestedTables: [],
      tokens: ['order'],
    })),
  };
  const knowledge = {
    byIds: jest.fn().mockResolvedValue(new Map()),
    retrieve: jest.fn().mockResolvedValue([
      {
        authority: DatabaseContextAuthority.HybridVerified,
        columnName: null,
        confidence: 1,
        content: 'Orders implement verified checkout requirements.',
        dedupeKey: 'knowledge:orders',
        exactMatch: true,
        id: 'knowledge:orders',
        importance: 100,
        kind: 'KNOWLEDGE',
        relevance: 1,
        relationshipName: null,
        semanticSimilarity: 0,
        source: DatabaseContextSource.Knowledge,
        tableName: 'orders',
        verified: true,
      },
    ]),
  };
  const vectorKnowledge = { search: jest.fn().mockResolvedValue([]) };
  const relationships = { expand: jest.fn().mockReturnValue({ relationships: [], tables: [] }) };
  const findings = { retrieve: jest.fn().mockResolvedValue([]) };
  const reranking = {
    rerank: jest.fn((candidates: DatabaseContextCandidate[]) =>
      candidates
        .map((candidate) => ({ ...candidate, score: candidate.authority === DatabaseContextAuthority.ActualSchema ? 1_000 : 800 }))
        .sort((left, right) => right.score - left.score),
    ),
  };
  const deduplication = { deduplicate: jest.fn((candidates: DatabaseContextCandidate[]) => candidates) };
  const budget = {
    apply: jest.fn((candidates: DatabaseContextCandidate[]) => ({ candidates, estimatedTokens: 20, truncated: false })),
  };
  const config = {
    databaseContext: {
      maxColumnsPerTable: 12,
      maxEstimatedTokens: 1_000,
      maxFindings: 10,
      maxItems: 30,
      maxKnowledge: 16,
      maxRelationshipDepth: 1,
      maxRelationships: 16,
      maxTables: 8,
    },
  };
  return {
    findings,
    knowledge,
    service: new DatabaseContextService(
      datasources as never,
      knowledgeVersions as never,
      metadata as never,
      requestAnalyzer,
      knowledge as unknown as KnowledgeRetrievalService,
      vectorKnowledge as unknown as VectorKnowledgeSearchService,
      relationships,
      findings as unknown as CompatibilityFindingRetrievalService,
      reranking,
      deduplication,
      budget,
      config as unknown as AppConfigService,
    ),
    vectorKnowledge,
  };
}

describe('DatabaseContextService', () => {
  it('keeps persisted schema facts ahead of verified semantic knowledge', async () => {
    const { service } = setup();

    const context = await service.build('organization-id', 'datasource-id', {
      purpose: DatabaseContextPurpose.SchemaQuestion,
      query: 'Explain Order customer_id',
    });

    expect(context.staleness).toBe(DatasourceKnowledgeStaleness.Current);
    expect(context.items[0]).toMatchObject({
      authority: DatabaseContextAuthority.ActualSchema,
      id: 'schema:table:orders',
      source: DatabaseContextSource.SchemaSnapshot,
    });
    expect(context.tables).toEqual([expect.objectContaining({ name: 'orders' })]);
  });

  it('does not combine stale knowledge with a newer persisted schema snapshot', async () => {
    const { findings, knowledge, service, vectorKnowledge } = setup('older-snapshot-id');

    const context = await service.build('organization-id', 'datasource-id', {
      purpose: DatabaseContextPurpose.CompatibilityInvestigation,
      query: 'What is the Order model?',
    });

    expect(context.staleness).toBe(DatasourceKnowledgeStaleness.SchemaChanged);
    expect(context.knowledgeVersionId).toBeNull();
    expect(context.omittedSources).toEqual([
      DatabaseContextSource.Knowledge,
      DatabaseContextSource.VectorKnowledge,
      DatabaseContextSource.CompatibilityFinding,
    ]);
    expect(knowledge.retrieve).not.toHaveBeenCalled();
    expect(vectorKnowledge.search).not.toHaveBeenCalled();
    expect(findings.retrieve).not.toHaveBeenCalled();
  });
});
