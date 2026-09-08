import { Injectable } from '@nestjs/common';
import { SqlQueryOperation } from '@schemaiq/types';

import { AppConfigService } from '../../config/app-config.service';
import type { SchemaTable } from '../datasource-analysis.service';
import type { DatabaseContextState } from '../context/database-context.types';
import { QueryGenerationError } from './query-generation.error';
import { SensitiveColumnPolicyService } from './sensitive-column-policy.service';
import type {
  SqlColumnReference,
  SqlFilterExpression,
  SqlQueryPlan,
} from './sql-query.types';

export interface ValidatedSqlQueryPlan {
  plan: SqlQueryPlan;
  tables: string[];
  columns: string[];
  warnings: string[];
}

@Injectable()
export class SqlQueryPlanValidationService {
  constructor(
    private readonly config: AppConfigService,
    private readonly sensitiveColumns: SensitiveColumnPolicyService,
  ) {}

  validate(plan: SqlQueryPlan, state: DatabaseContextState): ValidatedSqlQueryPlan {
    if (!plan.schemaSnapshotId || plan.schemaSnapshotId !== state.snapshot.entity.id) {
      throw new QueryGenerationError('QUERY_SCHEMA_SNAPSHOT_REQUIRED', 'Query plan is not tied to the current schema snapshot');
    }
    const tablesByName = new Map(state.snapshot.schema.tables.map((table) => [table.name.toLowerCase(), table]));
    const from = this.table(tablesByName, plan.from.table);
    const aliases = new Map<string, SchemaTable>([[plan.from.alias, from]]);
    const joins = plan.joins.map((join) => {
      if (aliases.has(join.alias)) {
        throw new QueryGenerationError('QUERY_INVALID_JOIN', 'Every joined table requires a unique alias');
      }
      const table = this.table(tablesByName, join.table);
      aliases.set(join.alias, table);
      return { ...join, table: table.name };
    });
    if (aliases.size > this.config.sql.maxTables || joins.length > this.config.sql.maxJoins) {
      throw new QueryGenerationError('QUERY_COMPLEXITY_EXCEEDED', 'Query exceeds the configured table or join limit');
    }
    for (const join of joins) this.validateJoin(join, aliases);

    const warnings = new Set<string>();
    const columns = new Set<string>();
    const resolveReference = <T extends SqlColumnReference>(reference: T): T => {
      const table = aliases.get(reference.tableAlias);
      if (!table) throw new QueryGenerationError('QUERY_UNKNOWN_TABLE', `Unknown table alias: ${reference.tableAlias}`);
      const column = table.columns.find((candidate) => candidate.name.toLowerCase() === reference.column.toLowerCase());
      if (!column) throw new QueryGenerationError('QUERY_UNKNOWN_COLUMN', `Unknown column: ${reference.column}`);
      const classification = this.sensitiveColumns.classify(column.name);
      if (classification === 'BLOCKED') {
        throw new QueryGenerationError('QUERY_SENSITIVE_COLUMN_BLOCKED', 'Credential and secret columns cannot be queried');
      }
      if (classification === 'POTENTIALLY_SENSITIVE') warnings.add('POTENTIALLY_SENSITIVE_COLUMN_INCLUDED');
      columns.add(`${table.name}.${column.name}`);
      return { ...reference, column: column.name };
    };

    const select = plan.select.map((field) => resolveReference(field));
    if (plan.operation === SqlQueryOperation.Select && select.some((field) => field.type === 'AGGREGATE')) {
      throw new QueryGenerationError('QUERY_INVALID_AGGREGATION', 'SELECT plans cannot include aggregate expressions');
    }
    if (plan.operation === SqlQueryOperation.Aggregate && !select.some((field) => field.type === 'AGGREGATE')) {
      throw new QueryGenerationError('QUERY_INVALID_AGGREGATION', 'Aggregate plans require aggregate expressions');
    }
    if (plan.groupBy.length > this.config.sql.maxGroupByColumns || plan.orderBy.length > this.config.sql.maxOrderByColumns) {
      throw new QueryGenerationError('QUERY_COMPLEXITY_EXCEEDED', 'Query exceeds the configured grouping or ordering limit');
    }

    const filter = this.validateFilter(plan.filter, resolveReference, aliases, 1);
    const having = this.validateFilter(plan.having, resolveReference, aliases, 1);
    const groupBy = plan.groupBy.map((field) => resolveReference(field));
    const orderBy = plan.orderBy.map((field) => resolveReference(field));
    if (plan.distinct && !this.config.sql.allowDistinct) {
      throw new QueryGenerationError('QUERY_COMPLEXITY_EXCEEDED', 'DISTINCT is disabled by SQL safety policy');
    }
    if (plan.offset !== null && plan.limit === null) {
      throw new QueryGenerationError('QUERY_COMPLEXITY_EXCEEDED', 'An offset requires a bounded limit');
    }
    if (plan.offset !== null && plan.offset > this.config.sql.maxOffset) {
      throw new QueryGenerationError('QUERY_COMPLEXITY_EXCEEDED', 'Offset exceeds the configured maximum');
    }
    if (plan.limit !== null && plan.limit > this.config.sql.maxLimit) {
      throw new QueryGenerationError('QUERY_COMPLEXITY_EXCEEDED', 'Limit exceeds the configured maximum');
    }
    const defaultLimitApplied = plan.operation === SqlQueryOperation.Select && plan.limit === null;
    const limit = defaultLimitApplied ? this.config.sql.defaultLimit : plan.limit;
    if (defaultLimitApplied) warnings.add('DEFAULT_LIMIT_APPLIED');

    return {
      columns: [...columns].sort(),
      plan: { ...plan, from: { ...plan.from, table: from.name }, joins, select, filter, having, groupBy, orderBy, limit, defaultLimitApplied },
      tables: [...aliases.values()].map((table) => table.name),
      warnings: [...warnings],
    };
  }

  private table(tables: Map<string, SchemaTable>, requestedName: string): SchemaTable {
    const table = tables.get(requestedName.toLowerCase());
    if (!table) throw new QueryGenerationError('QUERY_UNKNOWN_TABLE', `Unknown table: ${requestedName}`);
    return table;
  }

  private validateJoin(
    join: SqlQueryPlan['joins'][number],
    aliases: ReadonlyMap<string, SchemaTable>,
  ): void {
    const leftTable = aliases.get(join.on.leftAlias);
    const rightTable = aliases.get(join.on.rightAlias);
    if (!leftTable || !rightTable || join.on.leftAlias === join.on.rightAlias) {
      throw new QueryGenerationError('QUERY_INVALID_JOIN', 'Join references unknown or identical aliases');
    }
    const leftColumn = leftTable.columns.find((column) => column.name.toLowerCase() === join.on.leftColumn.toLowerCase());
    const rightColumn = rightTable.columns.find((column) => column.name.toLowerCase() === join.on.rightColumn.toLowerCase());
    if (!leftColumn || !rightColumn) throw new QueryGenerationError('QUERY_UNKNOWN_COLUMN', 'Join references an unknown column');
    const valid = this.hasForeignKey(leftTable, leftColumn.name, rightTable, rightColumn.name) || this.hasForeignKey(rightTable, rightColumn.name, leftTable, leftColumn.name);
    if (!valid) throw new QueryGenerationError('QUERY_INVALID_JOIN', 'Join is not backed by a schema foreign key');
    join.on.leftColumn = leftColumn.name;
    join.on.rightColumn = rightColumn.name;
  }

  private hasForeignKey(source: SchemaTable, sourceColumn: string, target: SchemaTable, targetColumn: string): boolean {
    return source.foreignKeys.some(
      (foreignKey) =>
        foreignKey.columnName.toLowerCase() === sourceColumn.toLowerCase() &&
        foreignKey.referencedTableName.toLowerCase() === target.name.toLowerCase() &&
        foreignKey.referencedColumnName.toLowerCase() === targetColumn.toLowerCase(),
    );
  }

  private validateFilter(
    filter: SqlFilterExpression | null,
    resolveReference: <T extends SqlColumnReference>(reference: T) => T,
    aliases: ReadonlyMap<string, SchemaTable>,
    depth: number,
  ): SqlFilterExpression | null {
    if (filter === null) return null;
    if (depth > this.config.sql.maxFilterDepth) {
      throw new QueryGenerationError('QUERY_COMPLEXITY_EXCEEDED', 'Filter nesting exceeds the configured maximum');
    }
    if (filter.type === 'CONDITION') {
      const values = [...(filter.values ?? []), ...(filter.value ? [filter.value] : [])];
      if (values.some((value) => value.type === 'DATE' || value.type === 'DATETIME')) {
        const table = aliases.get(filter.tableAlias);
        const column = table?.columns.find((candidate) => candidate.name.toLowerCase() === filter.column.toLowerCase());
        if (!column || !/(date|time)/i.test(column.type)) {
          throw new QueryGenerationError('QUERY_CONTEXT_INSUFFICIENT', 'Relative time filters require a date or timestamp column');
        }
      }
      return resolveReference(filter);
    }
    return {
      ...filter,
      conditions: filter.conditions.map((condition) => {
        const validated = this.validateFilter(condition, resolveReference, aliases, depth + 1);
        if (validated === null) throw new QueryGenerationError('QUERY_AST_INVALID', 'Filter group cannot contain an empty condition');
        return validated;
      }),
    };
  }
}
