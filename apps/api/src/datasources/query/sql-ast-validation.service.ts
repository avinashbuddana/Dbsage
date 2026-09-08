import { Injectable } from '@nestjs/common';
import { Parser } from 'node-sql-parser';

import { AppConfigService } from '../../config/app-config.service';
import { QueryGenerationError } from './query-generation.error';

const SYSTEM_SCHEMAS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);
const DANGEROUS_FUNCTIONS = new Set(['LOAD_FILE', 'BENCHMARK', 'SLEEP', 'GET_LOCK', 'RELEASE_LOCK']);
const DANGEROUS_SQL = /\b(?:into\s+(?:out|dump)file|load\s+data)\b/i;
const COMMENT_SQL = /(?:\/\*|--|#)/;

@Injectable()
export class SqlAstValidationService {
  private readonly parser = new Parser();

  constructor(private readonly config: AppConfigService) {}

  validate(sql: string): void {
    let parsed: unknown;
    try {
      parsed = this.parser.astify(sql, { database: 'MySQL' });
    } catch {
      throw new QueryGenerationError('QUERY_AST_INVALID', 'Generated SQL could not be parsed');
    }
    const statements = Array.isArray(parsed) ? parsed : [parsed];
    if (statements.length !== 1) throw new QueryGenerationError('QUERY_MULTIPLE_STATEMENTS', 'Only one SQL statement is allowed');
    const statement = statements[0] as Record<string, unknown>;
    if (statement.type !== 'select') throw new QueryGenerationError('QUERY_NOT_READ_ONLY', 'Only SELECT SQL is allowed');
    if (COMMENT_SQL.test(sql) || DANGEROUS_SQL.test(sql)) {
      throw new QueryGenerationError('QUERY_AST_INVALID', 'Comments and dangerous MySQL file operations are not allowed');
    }
    if (statement.locking_read !== null && statement.locking_read !== undefined) {
      throw new QueryGenerationError('QUERY_NOT_READ_ONLY', 'Locking SELECT statements are not allowed');
    }
    if (!this.config.sql.allowCtes && statement.with !== null && statement.with !== undefined) {
      throw new QueryGenerationError('QUERY_COMPLEXITY_EXCEEDED', 'CTEs are disabled by SQL safety policy');
    }
    if (this.hasSystemSchema(statement)) {
      throw new QueryGenerationError('QUERY_SYSTEM_SCHEMA_BLOCKED', 'Generated SQL violates the read-only safety policy');
    }
    if (this.hasSelectInto(statement) || this.hasStarProjection(statement)) {
      throw new QueryGenerationError('QUERY_AST_INVALID', 'Generated SQL uses a forbidden projection or SELECT INTO clause');
    }
    if (this.disallowedFunction(statement)) {
      throw new QueryGenerationError('QUERY_AST_INVALID', 'Generated SQL uses a function outside the allowlist');
    }
    if (this.hasNestedSelect(statement)) {
      throw new QueryGenerationError('QUERY_COMPLEXITY_EXCEEDED', 'Subqueries are disabled by SQL safety policy');
    }
  }

  private hasSystemSchema(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some((item) => this.hasSystemSchema(item));
    const record = value as Record<string, unknown>;
    if (typeof record.db === 'string' && SYSTEM_SCHEMAS.has(record.db.toLowerCase())) return true;
    return Object.values(record).some((item) => this.hasSystemSchema(item));
  }

  private hasSelectInto(statement: Record<string, unknown>): boolean {
    const into = statement.into as { position?: unknown } | null | undefined;
    return into?.position !== null && into?.position !== undefined;
  }

  private hasStarProjection(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some((item) => this.hasStarProjection(item));
    const record = value as Record<string, unknown>;
    if (record.type === 'column_ref' && record.column === '*') return true;
    return Object.values(record).some((item) => this.hasStarProjection(item));
  }

  private disallowedFunction(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    if (Array.isArray(value)) {
      for (const item of value) {
        const functionName = this.disallowedFunction(item);
        if (functionName) return functionName;
      }
      return null;
    }
    const record = value as Record<string, unknown>;
    const name = record.name as { name?: { value?: string }[] } | undefined;
    if (record.type === 'function') {
      const functionName = name?.name?.map((part) => part.value?.toUpperCase() ?? '').join('.') ?? 'UNKNOWN';
      return DANGEROUS_FUNCTIONS.has(functionName) ? functionName : 'UNSUPPORTED_FUNCTION';
    }
    for (const item of Object.values(record)) {
      const functionName = this.disallowedFunction(item);
      if (functionName) return functionName;
    }
    return null;
  }

  private hasNestedSelect(value: unknown, isRoot = true): boolean {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some((item) => this.hasNestedSelect(item, false));
    const record = value as Record<string, unknown>;
    if (!isRoot && record.type === 'select') return true;
    return Object.values(record).some((item) => this.hasNestedSelect(item, false));
  }
}

@Injectable()
export class SqlSafetyPolicyService {
  constructor(private readonly ast: SqlAstValidationService) {}

  validateCompiledSql(sql: string): void {
    this.ast.validate(sql);
  }
}
