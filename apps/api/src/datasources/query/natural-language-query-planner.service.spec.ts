import {
  DatabaseContextPurpose,
  DatasourceKnowledgeStaleness,
  SqlFilterOperator,
  SqlQueryOperation,
  type DatabaseContextPackage,
} from '@schemaiq/types';

import type { DatabaseContextState } from '../context/database-context.types';
import { NaturalLanguageQueryPlannerService } from './natural-language-query-planner.service';

describe('NaturalLanguageQueryPlannerService', () => {
  it('sends only the bounded context package and resolves relative time in application code', async () => {
    const llm = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          distinct: false,
          filter: {
            column: 'created_at',
            operator: SqlFilterOperator.Between,
            tableAlias: 'p',
            type: 'CONDITION',
            values: [
              { type: 'DATETIME', value: '2000-01-01T00:00:00.000Z' },
              { type: 'DATETIME', value: '2000-01-02T00:00:00.000Z' },
            ],
          },
          from: { alias: 'p', table: 'payment_transactions' },
          groupBy: [],
          having: null,
          joins: [],
          limit: 20,
          offset: null,
          operation: SqlQueryOperation.Select,
          orderBy: [],
          select: [{ column: 'id', tableAlias: 'p', type: 'COLUMN' }],
        },
        model: 'local-model',
        promptVersion: 'NL_QUERY_PLANNER_V1',
        provider: 'OLLAMA',
      }),
    };
    const planner = new NaturalLanguageQueryPlannerService(llm as never, { classify: () => 'NONE' } as never);
    const context = {
      datasourceId: 'datasource',
      estimatedTokens: 20,
      items: [],
      knowledgeVersionId: null,
      omittedSources: [],
      purpose: DatabaseContextPurpose.FutureSqlGeneration,
      query: 'Show payments from the last 7 days',
      relationships: [],
      schemaSnapshotId: 'snapshot',
      staleness: DatasourceKnowledgeStaleness.Current,
      tables: [{ columns: [{ name: 'id', nullable: false, type: 'bigint' }, { name: 'created_at', nullable: false, type: 'datetime' }], name: 'payment_transactions', primaryKey: ['id'], type: 'BASE TABLE', uniqueConstraints: [] }],
      truncated: false,
    } as DatabaseContextPackage;
    const state = {
      knowledgeIsCurrent: true,
      knowledgeVersion: null,
      snapshot: {
        entity: { id: 'snapshot' },
        schema: {
          databaseName: 'customer',
          tables: [{ columns: [], foreignKeys: [], name: 'hidden_table', primaryKey: [], type: 'BASE TABLE', uniqueConstraints: [] }],
          truncated: false,
        },
      },
    } as unknown as DatabaseContextState;

    const result = await planner.plan('org', 'datasource', context.query, context, state);
    const calls = llm.generateStructured.mock.calls as unknown as [{ messages: { content: string }[] }][];
    const request = calls[0]?.[0];

    expect(request?.messages[1]?.content).toContain('payment_transactions');
    expect(request?.messages[1]?.content).not.toContain('hidden_table');
    if (result.plan.filter?.type !== 'CONDITION' || !result.plan.filter.values) fail('Expected a time filter');
    const [start, end] = result.plan.filter.values;
    expect(start).toMatchObject({ type: 'DATETIME' });
    expect(end).toMatchObject({ type: 'DATETIME' });
    expect(start?.type === 'DATETIME' ? start.value : '').not.toMatch(/^2000-/);
    expect(end?.type === 'DATETIME' ? end.value : '').not.toMatch(/^2000-/);
  });
});
