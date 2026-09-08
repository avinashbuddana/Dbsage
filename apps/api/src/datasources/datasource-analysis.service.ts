import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  DatasourceSpecAnalysisReport,
  DatasourceSpecRequirementStatus,
} from '@schemaiq/types';
import type { DataSource } from 'typeorm';
import { z } from 'zod';

import { AuditEvent, AuditService } from '../audit/audit.service';
import { DatabaseConnectionManager } from '../database-connections/database-connection.manager';
import { LlmTask } from '../llm/enums/llm-task.enum';
import type { LlmMessage } from '../llm/llm-provider.interface';
import { LlmService } from '../llm/llm.service';
import type { DatasourceSpecChatDto } from './dto/datasource-analysis.dto';

const MYSQL_SYSTEM_DATABASES = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);
const MAX_SCHEMA_TABLES = 250;
const MAX_SCHEMA_COLUMNS = 2_000;
// Leave room in Ollama's 4k-token context for the prompt and structured response.
const MAX_SPECIFICATION_CONTEXT_CHARACTERS = 8_000;
const SPECIFICATION_CHUNK_CHARACTERS = 4_000;
const REQUIREMENT_EXTRACTION_CHUNK_CHARACTERS = 1_500;
const MAX_REQUIREMENT_EXTRACTION_CHUNKS = 12;
const COMPATIBILITY_SCORE_BY_STATUS: Readonly<Record<DatasourceSpecRequirementStatus, number>> = {
  MATCHED: 1,
  PARTIAL: 0.5,
  MISSING: 0,
};

const compatibilityReportSchema = z.object({
  assumptions: z.array(z.string().min(1).max(240)).max(10),
  requirements: z
    .array(
      z.object({
        evidence: z.string().min(1).max(480),
        requirement: z.string().min(1).max(240),
        status: z.enum(['MATCHED', 'PARTIAL', 'MISSING']),
      }),
    )
    .max(20),
  summary: z.string().min(1).max(1_200),
});

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
}

export interface SchemaForeignKey {
  constraintName: string;
  columnName: string;
  referencedTableName: string;
  referencedColumnName: string;
}

export interface SchemaTable {
  name: string;
  type: string;
  columns: SchemaColumn[];
  primaryKey: string[];
  uniqueConstraints: string[][];
  foreignKeys: SchemaForeignKey[];
}

export interface DatabaseSchemaSnapshot {
  databaseName: string;
  tables: SchemaTable[];
  truncated: boolean;
}

interface SpecChatResponse {
  databaseName: string;
  content: string;
}

interface SpecCompatibilityAnalysisResponse {
  databaseName: string;
  matchScore: number | null;
  report: DatasourceSpecAnalysisReport;
}

export function compatibilityScore(report: DatasourceSpecAnalysisReport): number | null {
  if (report.requirements.length === 0) return null;

  const total = report.requirements.reduce(
    (sum, requirement) => sum + COMPATIBILITY_SCORE_BY_STATUS[requirement.status],
    0,
  );
  return Math.round((total / report.requirements.length) * 100);
}

export function specificationContext(
  specification: string,
  terms: readonly string[],
): string {
  if (specification.length <= MAX_SPECIFICATION_CONTEXT_CHARACTERS) return specification;

  const searchTerms = new Set(
    terms
      .flatMap((term) => term.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? [])
      .filter((term) => term.length >= 3),
  );
  const chunks: { index: number; text: string; score: number }[] = [];
  for (let start = 0, index = 0; start < specification.length; index += 1) {
    let end = Math.min(start + SPECIFICATION_CHUNK_CHARACTERS, specification.length);
    const newline = specification.lastIndexOf('\n', end);
    if (newline > start + 1_024) end = newline + 1;
    const text = specification.slice(start, end);
    const words = new Set(text.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? []);
    const score = [...words].filter((word) => searchTerms.has(word)).length;
    chunks.push({ index, score, text });
    start = end;
  }

  // ponytail: relevance-only excerpts; replace with persisted, indexed chunks when long-lived specs are introduced.
  const selected = chunks
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .reduce<{ index: number; text: string; score: number }[]>((result, chunk) => {
      const length = result.reduce((total, entry) => total + entry.text.length, 0);
      return length + chunk.text.length <= MAX_SPECIFICATION_CONTEXT_CHARACTERS
        ? [...result, chunk]
        : result;
    }, [])
    .sort((left, right) => left.index - right.index);

  return selected.map((chunk) => chunk.text).join('\n');
}

export interface SpecificationExtractionChunk {
  index: number;
  lexicalScore: number;
  text: string;
}

export function specificationExtractionChunkCandidates(
  specification: string,
  terms: readonly string[],
): SpecificationExtractionChunk[] {
  const searchTerms = new Set(
    terms
      .flatMap((term) => term.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? [])
      .filter((term) => term.length >= 3),
  );
  const chunks: SpecificationExtractionChunk[] = [];
  for (let start = 0, index = 0; start < specification.length; index += 1) {
    let end = Math.min(start + REQUIREMENT_EXTRACTION_CHUNK_CHARACTERS, specification.length);
    const newline = specification.lastIndexOf('\n', end);
    if (newline > start + 256) end = newline + 1;
    const text = specification.slice(start, end);
    const words = new Set(text.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? []);
    chunks.push({ index, lexicalScore: [...words].filter((word) => searchTerms.has(word)).length, text });
    start = end;
  }

  return chunks;
}

export function specificationExtractionChunks(
  specification: string,
  terms: readonly string[],
): string[] {
  const chunks = specificationExtractionChunkCandidates(specification, terms);
  if (chunks.length <= MAX_REQUIREMENT_EXTRACTION_CHUNKS) return chunks.map((chunk) => chunk.text);

  const [firstChunk, ...remainingChunks] = chunks;
  if (!firstChunk) return [];

  // ponytail: a bounded relevance pass keeps local models responsive; use persisted indexed chunks for larger specifications.
  return [firstChunk, ...remainingChunks.sort((left, right) => right.lexicalScore - left.lexicalScore || left.index - right.index).slice(0, MAX_REQUIREMENT_EXTRACTION_CHUNKS - 1)]
    .sort((left, right) => left.index - right.index)
    .map((chunk) => chunk.text);
}

@Injectable()
export class DatasourceAnalysisService {
  constructor(
    private readonly connections: DatabaseConnectionManager,
    private readonly llm: LlmService,
    private readonly audit: AuditService,
  ) {}

  listDatabases(organizationId: string, datasourceId: string): Promise<{ name: string }[]> {
    return this.connections.withDataSource(organizationId, datasourceId, async (dataSource) =>
      this.getDatabaseNames(dataSource).then((names) => names.map((name) => ({ name }))),
    );
  }

  async chat(
    organizationId: string,
    datasourceId: string,
    input: DatasourceSpecChatDto,
  ): Promise<SpecChatResponse> {
    const snapshot = await this.captureSchemaSnapshot(organizationId, datasourceId, input.databaseName);
    const response = await this.generateComparison(
      organizationId,
      datasourceId,
      snapshot,
      input.specification,
      input.messages,
    );
    await this.audit.record(organizationId, AuditEvent.DatasourceSpecChatRequested, {
      databaseName: snapshot.databaseName,
      datasourceId,
      schemaTruncated: snapshot.truncated,
      tableCount: snapshot.tables.length,
    });

    return { databaseName: snapshot.databaseName, content: response.content };
  }

  async analyzeSpecification(
    organizationId: string,
    datasourceId: string,
    databaseName: string,
    specification: string,
  ): Promise<SpecCompatibilityAnalysisResponse> {
    const snapshot = await this.captureSchemaSnapshot(organizationId, datasourceId, databaseName);
    const response = await this.llm.generateStructured({
      datasourceId,
      messages: this.comparisonMessages(
        snapshot,
        specification,
        [],
        'Extract up to 20 assessable data-model requirements. For each, classify it as MATCHED, PARTIAL, or MISSING using only schema evidence. Return a concise summary and explicit assumptions. Do not include database rows or mutation commands.',
      ),
      organizationId,
      schema: compatibilityReportSchema,
      schemaName: 'datasource_spec_compatibility_report',
      task: LlmTask.SpecSemanticMatching,
    });
    const report: DatasourceSpecAnalysisReport = response.data;
    return { databaseName: snapshot.databaseName, matchScore: compatibilityScore(report), report };
  }

  private generateComparison(
    organizationId: string,
    datasourceId: string,
    snapshot: DatabaseSchemaSnapshot,
    specification: string,
    messages: DatasourceSpecChatDto['messages'],
  ) {
    return this.llm.generateText({
      datasourceId,
      messages: this.comparisonMessages(
        snapshot,
        specification,
        messages,
        'Provide a concise compatibility report with covered requirements, gaps, and assumptions.',
      ),
      organizationId,
      task: LlmTask.SpecCompatibilityExplanation,
    });
  }

  private comparisonMessages(
    snapshot: DatabaseSchemaSnapshot,
    specification: string,
    messages: DatasourceSpecChatDto['messages'],
    defaultInstruction: string,
  ): LlmMessage[] {
    const compactSpecification = specificationContext(specification, [
      ...messages.map((message) => message.content),
      ...snapshot.tables.map((table) => table.name),
    ]);
    return [
      {
        role: 'system',
        content:
          'You are SchemaIQ. Compare the provided Markdown specification context with the selected database schema. The specification may be relevant excerpts from a larger file, so state uncertainty when needed. Use only the supplied inputs, identify matches, gaps, and assumptions, and never suggest mutating database commands.',
      },
      {
        role: 'user',
        content: `Specification context:\n${compactSpecification}\n\nSelected database schema:\n${JSON.stringify(snapshot)}`,
      },
      ...(messages.length > 0
        ? messages
        : [{ content: defaultInstruction, role: 'user' as const }]),
    ];
  }

  async captureSchemaSnapshot(
    organizationId: string,
    datasourceId: string,
    databaseName: string,
  ): Promise<DatabaseSchemaSnapshot> {
    return this.connections.withDataSource(organizationId, datasourceId, async (dataSource) => {
      const names = await this.getDatabaseNames(dataSource);
      if (!names.includes(databaseName)) {
        throw new BadRequestException('The selected database is not available to this data source');
      }

      const tableRows = (await dataSource.query(
        `SELECT TABLE_NAME AS tableName, TABLE_TYPE AS tableType
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME
         LIMIT ${String(MAX_SCHEMA_TABLES)}`,
        [databaseName],
      )) as unknown;
      const columnRows = (await dataSource.query(
        `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, COLUMN_TYPE AS columnType, IS_NULLABLE AS isNullable
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME, ORDINAL_POSITION
         LIMIT ${String(MAX_SCHEMA_COLUMNS)}`,
        [databaseName],
      )) as unknown;
      const constraintRows = (await dataSource.query(
        `SELECT tc.TABLE_NAME AS tableName, tc.CONSTRAINT_NAME AS constraintName,
                tc.CONSTRAINT_TYPE AS constraintType, kcu.COLUMN_NAME AS columnName,
                kcu.REFERENCED_TABLE_NAME AS referencedTableName,
                kcu.REFERENCED_COLUMN_NAME AS referencedColumnName
         FROM information_schema.TABLE_CONSTRAINTS tc
         LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
           ON tc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
          AND tc.TABLE_NAME = kcu.TABLE_NAME
          AND tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
         WHERE tc.TABLE_SCHEMA = ?
           AND tc.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
         ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
         LIMIT ${String(MAX_SCHEMA_COLUMNS)}`,
        [databaseName],
      )) as unknown;
      const tables = this.toTables(tableRows, columnRows, constraintRows);

      return {
        databaseName,
        tables,
        truncated:
          this.toRows(tableRows).length === MAX_SCHEMA_TABLES ||
          this.toRows(columnRows).length === MAX_SCHEMA_COLUMNS ||
          this.toRows(constraintRows).length === MAX_SCHEMA_COLUMNS,
      };
    });
  }

  private async getDatabaseNames(dataSource: DataSource): Promise<string[]> {
    const rows = (await dataSource.query('SHOW DATABASES')) as unknown;
    return this.toRows(rows)
      .map((row) => row.Database)
      .filter((name): name is string => typeof name === 'string' && !MYSQL_SYSTEM_DATABASES.has(name))
      .sort((left, right) => left.localeCompare(right));
  }

  private toTables(tableRows: unknown, columnRows: unknown, constraintRows: unknown): SchemaTable[] {
    const tables = new Map<string, SchemaTable>();
    for (const row of this.toRows(tableRows)) {
      if (typeof row.tableName !== 'string' || typeof row.tableType !== 'string') continue;
      tables.set(row.tableName, {
        columns: [],
        foreignKeys: [],
        name: row.tableName,
        primaryKey: [],
        type: row.tableType,
        uniqueConstraints: [],
      });
    }
    for (const row of this.toRows(columnRows)) {
      if (
        typeof row.tableName !== 'string' ||
        typeof row.columnName !== 'string' ||
        typeof row.columnType !== 'string'
      ) {
        continue;
      }
      const table = tables.get(row.tableName);
      if (!table) continue;
      table.columns.push({
        name: row.columnName,
        nullable: row.isNullable === 'YES',
        type: row.columnType,
      });
    }
    const uniqueColumns = new Map<string, string[]>();
    for (const row of this.toRows(constraintRows)) {
      if (
        typeof row.tableName !== 'string' ||
        typeof row.constraintName !== 'string' ||
        typeof row.constraintType !== 'string' ||
        typeof row.columnName !== 'string'
      ) {
        continue;
      }
      const table = tables.get(row.tableName);
      if (!table) continue;
      if (row.constraintType === 'PRIMARY KEY') {
        table.primaryKey.push(row.columnName);
      } else if (row.constraintType === 'UNIQUE') {
        const key = `${row.tableName}\u0000${row.constraintName}`;
        uniqueColumns.set(key, [...(uniqueColumns.get(key) ?? []), row.columnName]);
      } else if (
        row.constraintType === 'FOREIGN KEY' &&
        typeof row.referencedTableName === 'string' &&
        typeof row.referencedColumnName === 'string'
      ) {
        table.foreignKeys.push({
          columnName: row.columnName,
          constraintName: row.constraintName,
          referencedColumnName: row.referencedColumnName,
          referencedTableName: row.referencedTableName,
        });
      }
    }
    for (const [key, columns] of uniqueColumns) {
      const [tableName] = key.split('\u0000');
      if (tableName) tables.get(tableName)?.uniqueConstraints.push(columns);
    }
    return [...tables.values()];
  }

  private toRows(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
      ? value.filter(
          (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
        )
      : [];
  }
}
