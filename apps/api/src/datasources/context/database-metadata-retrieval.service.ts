import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DatabaseContextAuthority,
  DatabaseContextSource,
} from '@schemaiq/types';
import type { Repository } from 'typeorm';

import type { DatabaseSchemaSnapshot, SchemaTable } from '../datasource-analysis.service';
import { DatasourceSchemaSnapshotEntity } from '../knowledge/entities/datasource-schema-snapshot.entity';
import type {
  AnalyzedDatabaseContextRequest,
  DatabaseContextCandidate,
  PersistedSchemaSnapshot,
} from './database-context.types';
import { lexicalRelevance, normalizeIdentifier } from './database-context.types';

@Injectable()
export class DatabaseMetadataRetrievalService {
  constructor(
    @InjectRepository(DatasourceSchemaSnapshotEntity)
    private readonly snapshots: Repository<DatasourceSchemaSnapshotEntity>,
  ) {}

  async latestSnapshot(organizationId: string, datasourceId: string): Promise<PersistedSchemaSnapshot> {
    const entity = await this.snapshots.findOne({
      order: { completedAt: 'DESC', createdAt: 'DESC' },
      where: { datasourceId, organizationId },
    });
    if (!entity) throw new NotFoundException('No persisted schema snapshot is available for this datasource');

    const schema = toSchemaSnapshot(entity.schema);
    if (!schema) throw new NotFoundException('The persisted schema snapshot is invalid');
    return { entity, schema };
  }

  retrieve(
    snapshot: PersistedSchemaSnapshot,
    request: AnalyzedDatabaseContextRequest,
    maximumTables: number,
  ): DatabaseContextCandidate[] {
    const requestedIdentifiers = new Set(request.identifiers.map(normalizeIdentifier));
    const tables = snapshot.schema.tables
      .map((table) => {
        const exactTable = requestedIdentifiers.has(normalizeIdentifier(table.name));
        const exactColumns = table.columns.filter((column) => requestedIdentifiers.has(normalizeIdentifier(column.name)));
        const relevance = Math.max(
          lexicalRelevance(request.tokens, table.name),
          ...table.columns.map((column) => lexicalRelevance(request.tokens, column.name)),
        );
        return { exactColumns, exactTable, relevance, table };
      })
      .sort(
        (left, right) =>
          Number(right.exactTable || right.exactColumns.length > 0) -
            Number(left.exactTable || left.exactColumns.length > 0) ||
          right.relevance - left.relevance ||
          left.table.name.localeCompare(right.table.name),
      )
      .slice(0, maximumTables);

    return tables.map(({ exactColumns, exactTable, relevance, table }) =>
      schemaTableCandidate(table, exactTable || exactColumns.length > 0, relevance),
    );
  }
}

export function schemaTableCandidate(
  table: SchemaTable,
  exactMatch: boolean,
  relevance: number,
): DatabaseContextCandidate {
  return {
    authority: DatabaseContextAuthority.ActualSchema,
    columnName: null,
    confidence: 1,
    content: null,
    dedupeKey: `table:${normalizeIdentifier(table.name)}`,
    exactMatch,
    id: `schema:table:${table.name}`,
    importance: 100,
    kind: 'TABLE',
    relevance,
    relationshipName: null,
    semanticSimilarity: 0,
    source: DatabaseContextSource.SchemaSnapshot,
    table,
    tableName: table.name,
    verified: true,
  };
}

function toSchemaSnapshot(value: Record<string, unknown>): DatabaseSchemaSnapshot | null {
  if (!Array.isArray(value.tables) || typeof value.databaseName !== 'string' || typeof value.truncated !== 'boolean') {
    return null;
  }
  const tables = value.tables.filter(isSchemaTable);
  return tables.length === value.tables.length ? { databaseName: value.databaseName, tables, truncated: value.truncated } : null;
}

function isSchemaTable(value: unknown): value is SchemaTable {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.type === 'string' &&
    Array.isArray(candidate.columns) &&
    candidate.columns.every(
      (column) =>
        typeof column === 'object' &&
        column !== null &&
        typeof (column as Record<string, unknown>).name === 'string' &&
        typeof (column as Record<string, unknown>).type === 'string' &&
        typeof (column as Record<string, unknown>).nullable === 'boolean',
    ) &&
    Array.isArray(candidate.primaryKey) &&
    candidate.primaryKey.every((column) => typeof column === 'string') &&
    Array.isArray(candidate.uniqueConstraints) &&
    candidate.uniqueConstraints.every(
      (constraint) => Array.isArray(constraint) && constraint.every((column) => typeof column === 'string'),
    ) &&
    Array.isArray(candidate.foreignKeys) &&
    candidate.foreignKeys.every(
      (foreignKey) =>
        typeof foreignKey === 'object' &&
        foreignKey !== null &&
        ['constraintName', 'columnName', 'referencedTableName', 'referencedColumnName'].every(
          (key) => typeof (foreignKey as Record<string, unknown>)[key] === 'string',
        ),
    )
  );
}
