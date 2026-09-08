import { SqlAggregate, SqlFilterOperator, SqlJoinType, SqlQueryOperation } from '@schemaiq/types';

import type { AppConfigService } from '../../config/app-config.service';
import type { DatabaseContextState } from '../context/database-context.types';
import type { QueryGenerationError } from './query-generation.error';
import { SensitiveColumnPolicyService } from './sensitive-column-policy.service';
import { SqlAstValidationService } from './sql-ast-validation.service';
import { MySqlSqlCompiler } from './sql-compiler.service';
import { SqlQueryPlanValidationService } from './sql-query-plan-validation.service';
import type { SqlQueryPlan } from './sql-query.types';

const state: DatabaseContextState = {
  knowledgeIsCurrent: true,
  knowledgeVersion: null,
  snapshot: {
    entity: { id: 'snapshot-1' } as never,
    schema: {
      databaseName: 'customer',
      truncated: false,
      tables: [
        {
          columns: [
            { name: 'id', nullable: false, type: 'bigint' },
            { name: 'order_id', nullable: false, type: 'bigint' },
            { name: 'payment_state', nullable: false, type: 'varchar' },
            { name: 'created_at', nullable: false, type: 'datetime' },
            { name: 'password_hash', nullable: true, type: 'varchar' },
          ],
          foreignKeys: [
            { columnName: 'order_id', constraintName: 'fk_payment_order', referencedColumnName: 'id', referencedTableName: 'orders' },
          ],
          name: 'payment_transactions',
          primaryKey: ['id'],
          type: 'BASE TABLE',
          uniqueConstraints: [],
        },
        {
          columns: [
            { name: 'id', nullable: false, type: 'bigint' },
            { name: 'created_at', nullable: false, type: 'datetime' },
          ],
          foreignKeys: [],
          name: 'orders',
          primaryKey: ['id'],
          type: 'BASE TABLE',
          uniqueConstraints: [],
        },
      ],
    },
  },
};

const config = {
  sql: {
    allowCtes: false,
    allowDistinct: true,
    defaultLimit: 100,
    maxFilterDepth: 3,
    maxGroupByColumns: 5,
    maxJoins: 3,
    maxLimit: 1_000,
    maxOffset: 10_000,
    maxOrderByColumns: 5,
    maxSubqueryDepth: 0,
    maxTables: 4,
  },
} as AppConfigService;

function plan(overrides: Partial<SqlQueryPlan> = {}): SqlQueryPlan {
  return {
    defaultLimitApplied: false,
    distinct: false,
    filter: {
      column: 'payment_state',
      operator: SqlFilterOperator.Eq,
      tableAlias: 'p',
      type: 'CONDITION',
      value: { type: 'STRING', value: 'failed' },
    },
    from: { alias: 'p', table: 'payment_transactions' },
    groupBy: [],
    having: null,
    joins: [],
    knowledgeVersionId: null,
    limit: null,
    offset: null,
    operation: SqlQueryOperation.Select,
    orderBy: [{ column: 'created_at', direction: 'DESC', tableAlias: 'p' }],
    schemaSnapshotId: 'snapshot-1',
    select: [
      { column: 'id', tableAlias: 'p', type: 'COLUMN' },
      { column: 'payment_state', tableAlias: 'p', type: 'COLUMN' },
    ],
    ...overrides,
  };
}

describe('safe SQL planning primitives', () => {
  const sensitive = new SensitiveColumnPolicyService();
  const validator = new SqlQueryPlanValidationService(config, sensitive);
  const compiler = new MySqlSqlCompiler();
  const ast = new SqlAstValidationService(config);

  it('validates and compiles a parameterized bounded SELECT', () => {
    const validated = validator.validate(plan(), state);
    const compiled = compiler.compile(validated.plan);

    expect(validated.plan.defaultLimitApplied).toBe(true);
    expect(compiled.sql).toContain('`p`.`payment_state` = ?');
    expect(compiled.sql).toContain('LIMIT ?');
    expect(compiled.parameters).toEqual([{ type: 'STRING', value: 'failed' }, { type: 'NUMBER', value: 100 }]);
    expect(() => {
      ast.validate(compiled.sql);
    }).not.toThrow();
  });

  it('allows a bounded aggregate and a real foreign-key join', () => {
    const aggregate = plan({
      filter: null,
      joins: [{ alias: 'o', on: { leftAlias: 'p', leftColumn: 'order_id', rightAlias: 'o', rightColumn: 'id' }, table: 'orders', type: SqlJoinType.Left }],
      operation: SqlQueryOperation.Aggregate,
      orderBy: [],
      select: [{ aggregate: SqlAggregate.Count, alias: 'payment_count', column: 'id', tableAlias: 'p', type: 'AGGREGATE' }],
    });

    const compiled = compiler.compile(validator.validate(aggregate, state).plan);
    expect(compiled.sql).toContain('COUNT(`p`.`id`) AS `payment_count`');
    expect(compiled.sql).toContain('LEFT JOIN `orders` AS `o`');
  });

  it.each([
    ['hallucinated table', plan({ from: { alias: 'p', table: 'payments_archive' } }), 'QUERY_UNKNOWN_TABLE'],
    ['hallucinated column', plan({ select: [{ column: 'social_security_number', tableAlias: 'p', type: 'COLUMN' }] }), 'QUERY_UNKNOWN_COLUMN'],
    ['secret column', plan({ select: [{ column: 'password_hash', tableAlias: 'p', type: 'COLUMN' }] }), 'QUERY_SENSITIVE_COLUMN_BLOCKED'],
    ['invalid join', plan({ joins: [{ alias: 'o', on: { leftAlias: 'p', leftColumn: 'order_id', rightAlias: 'o', rightColumn: 'created_at' }, table: 'orders', type: SqlJoinType.Inner }] }), 'QUERY_INVALID_JOIN'],
  ])('rejects %s', (_name, queryPlan, code) => {
    expectCode(() => {
      validator.validate(queryPlan, state);
    }, code);
  });

  it('rejects excessive limits and stale snapshots', () => {
    expect(() => validator.validate(plan({ limit: 100_000 }), state)).toThrow('Limit exceeds');
    expect(() => validator.validate(plan({ schemaSnapshotId: 'old-snapshot' }), state)).toThrow('schema snapshot');
  });

  it.each([
    ['SELECT 1; DELETE FROM users;', 'QUERY_MULTIPLE_STATEMENTS'],
    ['SELECT * FROM mysql.user', 'QUERY_SYSTEM_SCHEMA_BLOCKED'],
    ['SELECT * FROM payments', 'QUERY_AST_INVALID'],
    ['SELECT LOAD_FILE(\'/tmp/input\')', 'QUERY_AST_INVALID'],
    ['SELECT SLEEP(1)', 'QUERY_AST_INVALID'],
    ['SELECT 1 INTO OUTFILE \'/tmp/out\'', 'QUERY_AST_INVALID'],
    ['SELECT 1 FOR UPDATE', 'QUERY_NOT_READ_ONLY'],
  ])('rejects unsafe AST SQL: %s', (sql, code) => {
    expectCode(() => {
      ast.validate(sql);
    }, code);
  });
});

function expectCode(action: () => void, code: string): void {
  try {
    action();
    fail('Expected SQL safety rejection');
  } catch (error) {
    expect((error as QueryGenerationError).code).toBe(code);
  }
}
