import type {
  DatabaseContextAuthority,
  DatabaseContextItemKind,
  DatabaseContextPurpose,
  DatabaseContextSource,
} from '@schemaiq/types';

import type { DatabaseSchemaSnapshot, SchemaForeignKey, SchemaTable } from '../datasource-analysis.service';
import type { DatasourceKnowledgeVersionEntity } from '../knowledge/entities/datasource-knowledge-version.entity';
import type { DatasourceSchemaSnapshotEntity } from '../knowledge/entities/datasource-schema-snapshot.entity';

export interface DatabaseContextRequest {
  query: string;
  purpose: DatabaseContextPurpose;
  requestedTables?: string[];
  requestedColumns?: string[];
  requestedConcepts?: string[];
}

export interface AnalyzedDatabaseContextRequest extends Required<Pick<DatabaseContextRequest, 'query' | 'purpose'>> {
  identifiers: string[];
  requestedColumns: string[];
  requestedConcepts: string[];
  requestedTables: string[];
  tokens: string[];
}

export interface PersistedSchemaSnapshot {
  entity: DatasourceSchemaSnapshotEntity;
  schema: DatabaseSchemaSnapshot;
}

export interface DatabaseContextState {
  snapshot: PersistedSchemaSnapshot;
  knowledgeVersion: DatasourceKnowledgeVersionEntity | null;
  knowledgeIsCurrent: boolean;
}

export interface DatabaseContextCandidate {
  id: string;
  kind: DatabaseContextItemKind;
  source: DatabaseContextSource;
  authority: DatabaseContextAuthority;
  confidence: number;
  importance: number;
  exactMatch: boolean;
  relevance: number;
  semanticSimilarity: number;
  verified: boolean;
  table?: SchemaTable;
  relationship?: { sourceTable: SchemaTable; foreignKey: SchemaForeignKey };
  tableName: string | null;
  columnName: string | null;
  relationshipName: string | null;
  content: string | null;
  dedupeKey: string;
  score?: number;
}

export interface RelationshipExpansion {
  relationships: DatabaseContextCandidate[];
  tables: DatabaseContextCandidate[];
}

export function normalizeIdentifier(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/s$/, '');
}

export function lexicalRelevance(tokens: readonly string[], value: string): number {
  if (tokens.length === 0) return 0;
  const normalizedValue = normalizeIdentifier(value);
  const matching = tokens.filter((token) => {
    const normalized = normalizeIdentifier(token);
    return normalized.length >= 3 && (normalizedValue.includes(normalized) || normalized.includes(normalizedValue));
  });
  return matching.length / tokens.length;
}
