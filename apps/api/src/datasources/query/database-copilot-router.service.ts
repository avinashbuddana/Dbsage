import { HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DatabaseContextPurpose,
  DatabaseCopilotIntent,
  GeneratedQueryStatus,
  type SqlGenerationResult,
} from '@schemaiq/types';
import type { Repository } from 'typeorm';

import { DatabaseAnalyzerService } from '../context/database-analyzer.service';
import { DatabaseContextService } from '../context/database-context.service';
import { GeneratedQueryEntity } from './generated-query.entity';
import { DatabaseIntentClassifierService, type DatabaseIntentClassification } from './database-intent-classifier.service';
import { NaturalLanguageQueryPlannerService } from './natural-language-query-planner.service';
import { QueryGenerationError } from './query-generation.error';
import { SensitiveColumnPolicyService } from './sensitive-column-policy.service';
import { SqlSafetyPolicyService } from './sql-ast-validation.service';
import { SqlCompilerService, SqlDialect } from './sql-compiler.service';
import { SqlQueryPlanValidationService } from './sql-query-plan-validation.service';

export type DatabaseCopilotResponse =
  | SqlGenerationResult
  | {
      supported: true;
      intent: DatabaseCopilotIntent;
      confidence: number;
      analysis: Awaited<ReturnType<DatabaseAnalyzerService['analyze']>>;
    };

@Injectable()
export class DatabaseCopilotRouterService {
  constructor(
    private readonly classifier: DatabaseIntentClassifierService,
    private readonly context: DatabaseContextService,
    private readonly analyzer: DatabaseAnalyzerService,
    private readonly planner: NaturalLanguageQueryPlannerService,
    private readonly planValidation: SqlQueryPlanValidationService,
    private readonly compiler: SqlCompilerService,
    private readonly safety: SqlSafetyPolicyService,
    private readonly sensitiveColumns: SensitiveColumnPolicyService,
    @InjectRepository(GeneratedQueryEntity)
    private readonly generatedQueries: Repository<GeneratedQueryEntity>,
  ) {}

  classify(organizationId: string, datasourceId: string, question: string): Promise<DatabaseIntentClassification> {
    return this.classifier.classify(organizationId, datasourceId, question);
  }

  async generate(
    organizationId: string,
    datasourceId: string,
    question: string,
  ): Promise<DatabaseCopilotResponse> {
    const intent = await this.classify(organizationId, datasourceId, question);
    if (intent.intent === DatabaseCopilotIntent.UnsupportedMutation) {
      return this.unsupported(intent, question, 'QUERY_MUTATION_NOT_ALLOWED');
    }
    if (this.isAnalysisIntent(intent.intent)) {
      const analysis = await this.analyzer.analyze(organizationId, datasourceId, {
        purpose: this.analysisPurpose(intent.intent),
        query: question,
      });
      return { analysis, confidence: intent.confidence, intent: intent.intent, supported: true };
    }
    if (![DatabaseCopilotIntent.DataQuery, DatabaseCopilotIntent.AggregationQuery].includes(intent.intent)) {
      return this.unsupported(intent, question, 'QUERY_INTENT_UNSUPPORTED');
    }
    if (this.sensitiveColumns.questionRequestsBlockedColumn(question)) {
      return this.unsupported(intent, question, 'QUERY_SENSITIVE_COLUMN_BLOCKED');
    }
    if (this.sensitiveColumns.questionRequestsSystemSchema(question)) {
      return this.unsupported(intent, question, 'QUERY_SYSTEM_SCHEMA_BLOCKED');
    }

    try {
      let state = await this.context.getState(organizationId, datasourceId);
      const clarificationCandidates = this.ambiguityCandidates(question, state.snapshot.schema.tables.map((table) => table.name));
      if (clarificationCandidates.length > 1) {
        return {
          ...this.unsupported(intent, question, 'QUERY_NEEDS_CLARIFICATION'),
          clarificationCandidates,
        };
      }
      const packageContext = await this.context.build(organizationId, datasourceId, {
        purpose: DatabaseContextPurpose.FutureSqlGeneration,
        query: question,
      });
      if (packageContext.tables.length === 0) {
        throw new QueryGenerationError('QUERY_CONTEXT_INSUFFICIENT', 'No relevant persisted schema metadata was available');
      }
      state = await this.context.getState(organizationId, datasourceId);
      if (packageContext.schemaSnapshotId !== state.snapshot.entity.id) {
        throw new QueryGenerationError('QUERY_SCHEMA_SNAPSHOT_REQUIRED', 'Schema changed while query context was being prepared');
      }
      const planned = await this.planner.plan(organizationId, datasourceId, question, packageContext, state);
      const validated = this.planValidation.validate(planned.plan, state);
      const compiled = this.compiler.compile(SqlDialect.MySql, validated.plan);
      this.safety.validateCompiledSql(compiled.sql);
      const confidence = Number(((intent.confidence + planned.confidence + 1) / 3).toFixed(3));
      const queryPlan = redactPlan(validated.plan);
      const entity = await this.generatedQueries.save(
        this.generatedQueries.create({
          confidence,
          datasourceId,
          generatedSql: compiled.sql,
          intent: intent.intent,
          knowledgeVersionId: validated.plan.knowledgeVersionId,
          model: planned.model,
          organizationId,
          parameterMetadata: compiled.parameters.map((parameter) => ({ type: parameter.type })),
          promptVersion: planned.promptVersion,
          provider: planned.provider,
          queryPlan,
          question: redactQuestion(question),
          schemaSnapshotId: validated.plan.schemaSnapshotId,
          status: GeneratedQueryStatus.Validated,
          userId: null,
          validationStatus: GeneratedQueryStatus.Validated,
        }),
      );
      return {
        clarificationCandidates: [],
        columns: validated.columns,
        confidence,
        id: entity.id,
        intent: intent.intent,
        knowledgeVersionId: validated.plan.knowledgeVersionId,
        parameters: compiled.parameters.map((parameter) => ({ type: parameter.type })),
        queryPlan,
        question: redactQuestion(question),
        reason: null,
        safety: { defaultLimitApplied: validated.plan.defaultLimitApplied, readOnly: true, validated: true },
        schemaSnapshotId: validated.plan.schemaSnapshotId,
        sql: compiled.sql,
        status: GeneratedQueryStatus.Validated,
        supported: true,
        tables: validated.tables,
        warnings: [...new Set([...planned.warnings, ...validated.warnings])],
      };
    } catch (error) {
      if (error instanceof QueryGenerationError) return this.unsupported(intent, question, error.code);
      if (error instanceof HttpException) throw error;
      return this.unsupported(intent, question, 'QUERY_GENERATION_FAILED');
    }
  }

  async validateGenerated(
    organizationId: string,
    datasourceId: string,
    queryId: string,
  ): Promise<{ id: string; status: GeneratedQueryStatus; schemaSnapshotId: string }> {
    const query = await this.generatedQueries.findOne({ where: { datasourceId, id: queryId, organizationId } });
    if (!query) throw new QueryGenerationError('QUERY_SCHEMA_SNAPSHOT_REQUIRED', 'Generated query was not found');
    const state = await this.context.getState(organizationId, datasourceId);
    const status = query.schemaSnapshotId === state.snapshot.entity.id ? GeneratedQueryStatus.Validated : GeneratedQueryStatus.Stale;
    if (query.status !== status) await this.generatedQueries.update(query.id, { status, validationStatus: status });
    return { id: query.id, schemaSnapshotId: query.schemaSnapshotId, status };
  }

  private isAnalysisIntent(intent: DatabaseCopilotIntent): boolean {
    return [
      DatabaseCopilotIntent.SchemaQuestion,
      DatabaseCopilotIntent.BusinessMeaning,
      DatabaseCopilotIntent.RelationshipAnalysis,
      DatabaseCopilotIntent.SpecCompliance,
      DatabaseCopilotIntent.DatabaseOverview,
    ].includes(intent);
  }

  private analysisPurpose(intent: DatabaseCopilotIntent): DatabaseContextPurpose {
    if (intent === DatabaseCopilotIntent.SpecCompliance) return DatabaseContextPurpose.CompatibilityInvestigation;
    if (intent === DatabaseCopilotIntent.BusinessMeaning || intent === DatabaseCopilotIntent.DatabaseOverview) {
      return DatabaseContextPurpose.DatabaseExplanation;
    }
    return DatabaseContextPurpose.SchemaQuestion;
  }

  private unsupported(
    intent: DatabaseIntentClassification,
    question: string,
    reason: string,
  ): SqlGenerationResult {
    return {
      clarificationCandidates: [],
      columns: [],
      confidence: intent.confidence,
      id: null,
      intent: intent.intent,
      knowledgeVersionId: null,
      parameters: [],
      queryPlan: null,
      question: redactQuestion(question),
      reason,
      safety: { defaultLimitApplied: false, readOnly: true, validated: false },
      schemaSnapshotId: null,
      sql: null,
      status: reason === 'QUERY_NEEDS_CLARIFICATION' ? GeneratedQueryStatus.NeedsClarification : GeneratedQueryStatus.Rejected,
      supported: false,
      tables: [],
      warnings: [],
    };
  }

  private ambiguityCandidates(question: string, tables: readonly string[]): string[] {
    const explicitlyNamedTables = tables.filter((table) =>
      new RegExp(`(?:^|[^a-z0-9_])${escapeRegExp(table.toLowerCase())}(?=$|[^a-z0-9_])`).test(question.toLowerCase()),
    );
    if (explicitlyNamedTables.length === 1) return [];

    const tokens = [...new Set((question.toLowerCase().match(/[a-z][a-z0-9_]*/g) ?? []).map((token) => token.replace(/s$/, '')).filter((token) => token.length >= 4 && !['show', 'list', 'find', 'with', 'from', 'where', 'recent', 'latest'].includes(token)))];
    const candidates = tables
      .map((table) => ({
        score: tokens.filter((token) => table.toLowerCase().replace(/s\b/g, '').includes(token)).length,
        table,
      }))
      .filter((candidate) => candidate.score > 0);
    const score = Math.max(0, ...candidates.map((candidate) => candidate.score));
    return score === 1 ? candidates.filter((candidate) => candidate.score === score).map((candidate) => candidate.table).sort() : [];
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactPlan(plan: object): Record<string, unknown> {
  const redact = (value: unknown, key?: string): unknown => {
    if (Array.isArray(value)) return value.map((item) => redact(item));
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    if (key === 'value' && typeof record.type === 'string') return { redacted: true, type: record.type };
    return Object.fromEntries(Object.entries(record).map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey)]));
  };
  return redact(plan) as Record<string, unknown>;
}

function redactQuestion(question: string): string {
  return question.replace(/\b(password|secret|token|api[_ -]?key)\b\s*(?:=|:|is)\s*\S+/gi, '$1 [redacted]');
}
