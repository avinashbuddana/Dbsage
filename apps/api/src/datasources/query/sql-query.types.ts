import {
  SqlAggregate,
  SqlFilterOperator,
  SqlJoinType,
  SqlQueryOperation,
} from '@schemaiq/types';
import { z } from 'zod';

export type SqlLiteral =
  | { type: 'STRING'; value: string }
  | { type: 'NUMBER'; value: number }
  | { type: 'BOOLEAN'; value: boolean }
  | { type: 'DATE'; value: string }
  | { type: 'DATETIME'; value: string }
  | { type: 'NULL' };

export interface SqlColumnReference {
  tableAlias: string;
  column: string;
}

export interface SqlFilterCondition extends SqlColumnReference {
  type: 'CONDITION';
  operator: SqlFilterOperator;
  value?: SqlLiteral;
  values?: SqlLiteral[];
}

export interface SqlFilterGroup {
  type: 'GROUP';
  operator: 'AND' | 'OR';
  conditions: SqlFilterExpression[];
}

export type SqlFilterExpression = SqlFilterCondition | SqlFilterGroup;

export interface SqlSelectColumn extends SqlColumnReference {
  type: 'COLUMN';
  alias?: string;
}

export interface SqlSelectAggregate extends SqlColumnReference {
  type: 'AGGREGATE';
  aggregate: SqlAggregate;
  alias?: string;
}

export interface SqlQueryJoin {
  type: SqlJoinType;
  table: string;
  alias: string;
  on: {
    leftAlias: string;
    leftColumn: string;
    rightAlias: string;
    rightColumn: string;
  };
}

export interface SqlQueryPlanDraft {
  operation: SqlQueryOperation;
  from: { table: string; alias: string };
  select: (SqlSelectColumn | SqlSelectAggregate)[];
  joins: SqlQueryJoin[];
  filter: SqlFilterExpression | null;
  groupBy: SqlColumnReference[];
  having: SqlFilterExpression | null;
  orderBy: (SqlColumnReference & { direction: 'ASC' | 'DESC' })[];
  limit: number | null;
  offset: number | null;
  distinct: boolean;
}

export interface SqlQueryPlan extends SqlQueryPlanDraft {
  schemaSnapshotId: string;
  knowledgeVersionId: string | null;
  defaultLimitApplied: boolean;
}

export interface CompiledSqlQuery {
  sql: string;
  parameters: SqlLiteral[];
}

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z][A-Za-z0-9_]*$/);
const literalSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('STRING'), value: z.string().max(512) }).strict(),
  z.object({ type: z.literal('NUMBER'), value: z.number() }).strict(),
  z.object({ type: z.literal('BOOLEAN'), value: z.boolean() }).strict(),
  z.object({ type: z.literal('DATE'), value: z.iso.date() }).strict(),
  z.object({ type: z.literal('DATETIME'), value: z.iso.datetime({ offset: true }) }).strict(),
  z.object({ type: z.literal('NULL') }).strict(),
]);

const conditionSchema = z
  .object({
    type: z.literal('CONDITION'),
    tableAlias: identifier,
    column: identifier,
    operator: z.enum(SqlFilterOperator),
    value: literalSchema.optional(),
    values: z.array(literalSchema).min(1).max(100).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const valueCount = value.values?.length ?? 0;
    if ([SqlFilterOperator.IsNull, SqlFilterOperator.IsNotNull].includes(value.operator)) {
      if (value.value !== undefined || valueCount > 0) {
        context.addIssue({ code: 'custom', message: 'NULL operators cannot have values' });
      }
      return;
    }
    if ([SqlFilterOperator.In, SqlFilterOperator.NotIn].includes(value.operator) && valueCount === 0) {
      context.addIssue({ code: 'custom', message: 'IN operators require values' });
    }
    if (value.operator === SqlFilterOperator.Between && valueCount !== 2) {
      context.addIssue({ code: 'custom', message: 'BETWEEN requires exactly two values' });
    }
    if (![SqlFilterOperator.In, SqlFilterOperator.NotIn, SqlFilterOperator.Between].includes(value.operator) && value.value === undefined) {
      context.addIssue({ code: 'custom', message: 'The operator requires one value' });
    }
  });

const filterSchema: z.ZodType<SqlFilterExpression> = z.lazy(() =>
  z.discriminatedUnion('type', [
    conditionSchema,
    z
      .object({
        type: z.literal('GROUP'),
        operator: z.enum(['AND', 'OR']),
        conditions: z.array(filterSchema).min(2).max(12),
      })
      .strict(),
  ]),
);

const columnReferenceSchema = z.object({ tableAlias: identifier, column: identifier }).strict();

export const sqlQueryPlanDraftSchema: z.ZodType<SqlQueryPlanDraft> = z
  .object({
    operation: z.enum(SqlQueryOperation),
    from: z.object({ table: identifier, alias: identifier }).strict(),
    select: z
      .array(
        z.discriminatedUnion('type', [
          columnReferenceSchema.extend({ type: z.literal('COLUMN'), alias: identifier.optional() }).strict(),
          columnReferenceSchema
            .extend({ type: z.literal('AGGREGATE'), aggregate: z.enum(SqlAggregate), alias: identifier.optional() })
            .strict(),
        ]),
      )
      .min(1)
      .max(24),
    joins: z
      .array(
        z
          .object({
            type: z.enum(SqlJoinType),
            table: identifier,
            alias: identifier,
            on: z
              .object({
                leftAlias: identifier,
                leftColumn: identifier,
                rightAlias: identifier,
                rightColumn: identifier,
              })
              .strict(),
          })
          .strict(),
      )
      .max(8),
    filter: filterSchema.nullable(),
    groupBy: z.array(columnReferenceSchema).max(12),
    having: filterSchema.nullable(),
    orderBy: z.array(columnReferenceSchema.extend({ direction: z.enum(['ASC', 'DESC']) }).strict()).max(12),
    limit: z.number().int().positive().max(1_000_000).nullable(),
    offset: z.number().int().min(0).max(10_000_000).nullable(),
    distinct: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.operation === SqlQueryOperation.Aggregate && !value.select.some((field) => field.type === 'AGGREGATE')) {
      context.addIssue({ code: 'custom', message: 'Aggregate queries require an aggregate projection' });
    }
  });
