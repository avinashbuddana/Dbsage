import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DatabaseContextSource,
  DatasourceKnowledgeStaleness,
  DatasourceKnowledgeVersionStatus,
  type DatabaseContextOverviewResponse,
  type DatabaseContextPackage,
  type DatabaseContextTable,
} from '@schemaiq/types';
import type { Repository } from 'typeorm';

import { DatasourceEntity } from '../entities/datasource.entity';
import { DatasourceKnowledgeVersionEntity } from '../knowledge/entities/datasource-knowledge-version.entity';
import { CompatibilityFindingRetrievalService } from './compatibility-finding-retrieval.service';
import { ContextBudgetService } from './context-budget.service';
import { ContextDeduplicationService } from './context-deduplication.service';
import { ContextRerankingService } from './context-reranking.service';
import { DatabaseContextRequestAnalyzer } from './database-context-request-analyzer.service';
import { DatabaseMetadataRetrievalService } from './database-metadata-retrieval.service';
import type {
  DatabaseContextCandidate,
  DatabaseContextRequest,
  DatabaseContextState,
} from './database-context.types';
import { normalizeIdentifier } from './database-context.types';
import { KnowledgeRetrievalService, knowledgeCandidate } from './knowledge-retrieval.service';
import { RelationshipExpansionService } from './relationship-expansion.service';
import { VectorKnowledgeSearchService } from './vector-knowledge-search.service';
import { AppConfigService } from '../../config/app-config.service';

@Injectable()
export class DatabaseContextService {
  constructor(
    @InjectRepository(DatasourceEntity)
    private readonly datasources: Repository<DatasourceEntity>,
    @InjectRepository(DatasourceKnowledgeVersionEntity)
    private readonly knowledgeVersions: Repository<DatasourceKnowledgeVersionEntity>,
    private readonly metadata: DatabaseMetadataRetrievalService,
    private readonly requestAnalyzer: DatabaseContextRequestAnalyzer,
    private readonly knowledge: KnowledgeRetrievalService,
    private readonly vectorKnowledge: VectorKnowledgeSearchService,
    private readonly relationships: RelationshipExpansionService,
    private readonly findings: CompatibilityFindingRetrievalService,
    private readonly reranking: ContextRerankingService,
    private readonly deduplication: ContextDeduplicationService,
    private readonly budget: ContextBudgetService,
    private readonly config: AppConfigService,
  ) {}

  async build(
    organizationId: string,
    datasourceId: string,
    request: DatabaseContextRequest,
  ): Promise<DatabaseContextPackage> {
    const state = await this.getState(organizationId, datasourceId);
    const analyzedRequest = this.requestAnalyzer.analyze(request);
    const contextConfig = this.config.databaseContext;
    const metadataCandidates = this.metadata.retrieve(state.snapshot, analyzedRequest, contextConfig.maxTables);
    const roots = metadataCandidates
      .filter((candidate) => candidate.exactMatch)
      .map((candidate) => candidate.tableName)
      .filter((name): name is string => name !== null);
    const relationshipExpansion = this.relationships.expand(
      state.snapshot.schema.tables,
      roots.length > 0 ? roots : metadataCandidates.slice(0, 2).map((candidate) => candidate.tableName).filter((name): name is string => name !== null),
      analyzedRequest,
      contextConfig.maxRelationshipDepth,
      contextConfig.maxRelationships,
    );
    const knowledgeCandidates = await this.currentKnowledgeCandidates(
      organizationId,
      datasourceId,
      state,
      analyzedRequest,
    );
    const allCandidates = [
      ...metadataCandidates,
      ...relationshipExpansion.tables,
      ...relationshipExpansion.relationships,
      ...knowledgeCandidates,
    ];
    const reranked = this.reranking.rerank(allCandidates);
    const budgeted = this.budget.apply(
      this.deduplication.deduplicate(reranked),
      contextConfig.maxItems,
      contextConfig.maxEstimatedTokens,
      contextConfig.maxColumnsPerTable,
    );
    const omittedSources = state.knowledgeIsCurrent
      ? []
      : [
          DatabaseContextSource.Knowledge,
          DatabaseContextSource.VectorKnowledge,
          DatabaseContextSource.CompatibilityFinding,
        ];
    const tables = budgeted.candidates
      .map((candidate) => candidate.table)
      .filter((table): table is NonNullable<DatabaseContextCandidate['table']> => table !== undefined)
      .map((table) => this.toTable(table, analyzedRequest.requestedColumns))
      .filter((table, index, values) => values.findIndex((value) => value.name === table.name) === index);

    return {
      datasourceId,
      estimatedTokens: budgeted.estimatedTokens,
      items: budgeted.candidates.map((candidate) => ({
        authority: candidate.authority,
        columnName: candidate.columnName,
        confidence: candidate.confidence,
        content: candidate.content,
        exactMatch: candidate.exactMatch,
        id: candidate.id,
        kind: candidate.kind,
        relationshipName: candidate.relationshipName,
        score: Number((candidate.score ?? 0).toFixed(3)),
        source: candidate.source,
        tableName: candidate.tableName,
        verified: candidate.verified,
      })),
      knowledgeVersionId: state.knowledgeIsCurrent ? state.knowledgeVersion?.id ?? null : null,
      omittedSources,
      purpose: analyzedRequest.purpose,
      query: analyzedRequest.query,
      relationships: budgeted.candidates
        .flatMap((candidate) => (candidate.relationship ? [candidate.relationship] : []))
        .map(({ foreignKey, sourceTable }) => ({
          constraintName: foreignKey.constraintName,
          name: `${sourceTable.name}.${foreignKey.columnName} → ${foreignKey.referencedTableName}.${foreignKey.referencedColumnName}`,
          sourceColumn: foreignKey.columnName,
          sourceTable: sourceTable.name,
          targetColumn: foreignKey.referencedColumnName,
          targetTable: foreignKey.referencedTableName,
        })),
      schemaSnapshotId: state.snapshot.entity.id,
      staleness: state.knowledgeIsCurrent
        ? DatasourceKnowledgeStaleness.Current
        : DatasourceKnowledgeStaleness.SchemaChanged,
      tables,
      truncated: budgeted.truncated,
    };
  }

  async overview(organizationId: string, datasourceId: string): Promise<DatabaseContextOverviewResponse> {
    const state = await this.getState(organizationId, datasourceId);
    const relationshipCount = state.snapshot.schema.tables.reduce(
      (total, table) => total + table.foreignKeys.length,
      0,
    );
    return {
      datasourceId,
      knowledgeVersionId: state.knowledgeIsCurrent ? state.knowledgeVersion?.id ?? null : null,
      relationshipCount,
      schemaSnapshotId: state.snapshot.entity.id,
      staleness: state.knowledgeIsCurrent
        ? DatasourceKnowledgeStaleness.Current
        : DatasourceKnowledgeStaleness.SchemaChanged,
      tableCount: state.snapshot.schema.tables.length,
      truncatedSchema: state.snapshot.schema.truncated,
    };
  }

  async getState(organizationId: string, datasourceId: string): Promise<DatabaseContextState> {
    const datasource = await this.datasources.findOne({ where: { id: datasourceId, organizationId } });
    if (!datasource) throw new NotFoundException('Datasource was not found');
    const [snapshot, knowledgeVersion] = await Promise.all([
      this.metadata.latestSnapshot(organizationId, datasourceId),
      this.knowledgeVersions.findOne({
        order: { activatedAt: 'DESC', createdAt: 'DESC' },
        where: { datasourceId, organizationId, status: DatasourceKnowledgeVersionStatus.Active },
      }),
    ]);
    return {
      knowledgeIsCurrent: knowledgeVersion?.schemaSnapshotId === snapshot.entity.id,
      knowledgeVersion: knowledgeVersion ?? null,
      snapshot,
    };
  }

  private async currentKnowledgeCandidates(
    organizationId: string,
    datasourceId: string,
    state: DatabaseContextState,
    request: ReturnType<DatabaseContextRequestAnalyzer['analyze']>,
  ): Promise<DatabaseContextCandidate[]> {
    if (!state.knowledgeVersion || !state.knowledgeIsCurrent) return [];
    const maximum = this.config.databaseContext.maxKnowledge;
    const [structured, vectorHits, findings] = await Promise.all([
      this.knowledge.retrieve(organizationId, datasourceId, state.knowledgeVersion.id, request, maximum),
      this.vectorKnowledge.search(organizationId, datasourceId, state.knowledgeVersion.id, request.query, maximum),
      this.findings.retrieve(
        organizationId,
        datasourceId,
        state.knowledgeVersion.compatibilityCheckId,
        request,
        this.config.databaseContext.maxFindings,
      ),
    ]);
    const hitByKnowledgeId = new Map<string, number>();
    for (const hit of vectorHits) {
      hitByKnowledgeId.set(hit.knowledgeId, Math.max(hit.similarity, hitByKnowledgeId.get(hit.knowledgeId) ?? 0));
    }
    const vectorRecords = await this.knowledge.byIds(
      organizationId,
      datasourceId,
      state.knowledgeVersion.id,
      [...hitByKnowledgeId.keys()],
    );
    const semantic = [...vectorRecords.values()].map((record) =>
      knowledgeCandidate(record, request, hitByKnowledgeId.get(record.id) ?? 0),
    );
    return [...structured, ...semantic, ...findings];
  }

  private toTable(table: NonNullable<DatabaseContextCandidate['table']>, requestedColumns: readonly string[]): DatabaseContextTable {
    const requested = new Set(requestedColumns.map(normalizeIdentifier));
    const columns = table.columns
      .slice()
      .sort(
        (left, right) =>
          Number(requested.has(normalizeIdentifier(right.name))) - Number(requested.has(normalizeIdentifier(left.name))) ||
          left.name.localeCompare(right.name),
      )
      .slice(0, this.config.databaseContext.maxColumnsPerTable)
      .map((column) => ({ name: column.name, nullable: column.nullable, type: column.type }));
    return {
      columns,
      name: table.name,
      primaryKey: table.primaryKey,
      type: table.type,
      uniqueConstraints: table.uniqueConstraints,
    };
  }
}
