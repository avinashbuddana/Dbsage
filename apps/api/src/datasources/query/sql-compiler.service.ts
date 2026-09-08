import { Injectable } from '@nestjs/common';
import { SqlAggregate, SqlFilterOperator } from '@schemaiq/types';

import type {
  CompiledSqlQuery,
  SqlFilterExpression,
  SqlLiteral,
  SqlQueryPlan,
  SqlSelectAggregate,
} from './sql-query.types';

export enum SqlDialect {
  MySql = 'MYSQL',
  PostgreSql = 'POSTGRESQL',
  MsSql = 'MSSQL',
}

export interface SqlCompiler {
  compile(plan: SqlQueryPlan): CompiledSqlQuery;
}

@Injectable()
export class MySqlSqlCompiler implements SqlCompiler {
  compile(plan: SqlQueryPlan): CompiledSqlQuery {
    const parameters: SqlLiteral[] = [];
    const parameter = (value: SqlLiteral): string => {
      parameters.push(value);
      return '?';
    };
    const field = (tableAlias: string, column: string): string => `${this.identifier(tableAlias)}.${this.identifier(column)}`;
    const select = plan.select
      .map((item) => {
        const expression = item.type === 'COLUMN' ? field(item.tableAlias, item.column) : this.aggregate(item, field);
        return item.alias ? `${expression} AS ${this.identifier(item.alias)}` : expression;
      })
      .join(', ');
    const distinct = plan.distinct ? 'DISTINCT ' : '';
    const joins = plan.joins
      .map(
        (join) =>
          ` ${join.type} JOIN ${this.identifier(join.table)} AS ${this.identifier(join.alias)} ON ${field(join.on.leftAlias, join.on.leftColumn)} = ${field(join.on.rightAlias, join.on.rightColumn)}`,
      )
      .join('');
    const where = this.filter(plan.filter, field, parameter);
    const groupBy = plan.groupBy.length === 0 ? '' : ` GROUP BY ${plan.groupBy.map((item) => field(item.tableAlias, item.column)).join(', ')}`;
    const having = this.filter(plan.having, field, parameter, ' HAVING ');
    const orderBy = plan.orderBy.length === 0 ? '' : ` ORDER BY ${plan.orderBy.map((item) => `${field(item.tableAlias, item.column)} ${item.direction}`).join(', ')}`;
    const limit = plan.limit === null ? '' : ` LIMIT ${parameter({ type: 'NUMBER', value: plan.limit })}`;
    const offset = plan.offset === null ? '' : ` OFFSET ${parameter({ type: 'NUMBER', value: plan.offset })}`;
    return {
      parameters,
      sql: `SELECT ${distinct}${select} FROM ${this.identifier(plan.from.table)} AS ${this.identifier(plan.from.alias)}${joins}${where}${groupBy}${having}${orderBy}${limit}${offset}`,
    };
  }

  private aggregate(field: SqlSelectAggregate, quote: (tableAlias: string, column: string) => string): string {
    const column = quote(field.tableAlias, field.column);
    switch (field.aggregate) {
      case SqlAggregate.Count:
        return `COUNT(${column})`;
      case SqlAggregate.CountDistinct:
        return `COUNT(DISTINCT ${column})`;
      case SqlAggregate.Sum:
        return `SUM(${column})`;
      case SqlAggregate.Avg:
        return `AVG(${column})`;
      case SqlAggregate.Min:
        return `MIN(${column})`;
      case SqlAggregate.Max:
        return `MAX(${column})`;
    }
  }

  private filter(
    filter: SqlFilterExpression | null,
    field: (tableAlias: string, column: string) => string,
    parameter: (value: SqlLiteral) => string,
    prefix = ' WHERE ',
  ): string {
    if (!filter) return '';
    const expression = (value: SqlFilterExpression): string => {
      if (value.type === 'GROUP') return `(${value.conditions.map(expression).join(` ${value.operator} `)})`;
      const column = field(value.tableAlias, value.column);
      if (value.operator === SqlFilterOperator.IsNull) return `${column} IS NULL`;
      if (value.operator === SqlFilterOperator.IsNotNull) return `${column} IS NOT NULL`;
      if (value.operator === SqlFilterOperator.In || value.operator === SqlFilterOperator.NotIn) {
        return `${column} ${value.operator === SqlFilterOperator.In ? 'IN' : 'NOT IN'} (${(value.values ?? []).map(parameter).join(', ')})`;
      }
      if (value.operator === SqlFilterOperator.Between) {
        const values = value.values ?? [];
        const [start, end] = values;
        if (!start || !end) throw new Error('Compiler received an incomplete BETWEEN filter');
        return `${column} BETWEEN ${parameter(start)} AND ${parameter(end)}`;
      }
      const operator: Readonly<Record<Exclude<SqlFilterOperator, SqlFilterOperator.In | SqlFilterOperator.NotIn | SqlFilterOperator.Between | SqlFilterOperator.IsNull | SqlFilterOperator.IsNotNull>, string>> = {
        [SqlFilterOperator.Eq]: '=',
        [SqlFilterOperator.Neq]: '<>',
        [SqlFilterOperator.Gt]: '>',
        [SqlFilterOperator.Gte]: '>=',
        [SqlFilterOperator.Lt]: '<',
        [SqlFilterOperator.Lte]: '<=',
        [SqlFilterOperator.Like]: 'LIKE',
      };
      if (value.value === undefined) throw new Error('Compiler received a filter without a value');
      return `${column} ${operator[value.operator]} ${parameter(value.value)}`;
    };
    return `${prefix}${expression(filter)}`;
  }

  private identifier(value: string): string {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) throw new Error('Compiler received an unsafe identifier');
    return `\`${value}\``;
  }
}

@Injectable()
export class SqlCompilerService {
  constructor(private readonly mysql: MySqlSqlCompiler) {}

  compile(dialect: SqlDialect, plan: SqlQueryPlan): CompiledSqlQuery {
    if (dialect !== SqlDialect.MySql) throw new Error(`Unsupported SQL dialect: ${dialect}`);
    return this.mysql.compile(plan);
  }
}
