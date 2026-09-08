import { Injectable } from '@nestjs/common';
import {
  DatabaseContextAuthority,
  DatabaseContextSource,
} from '@schemaiq/types';

import type { SchemaTable } from '../datasource-analysis.service';
import type {
  AnalyzedDatabaseContextRequest,
  DatabaseContextCandidate,
  RelationshipExpansion,
} from './database-context.types';
import { lexicalRelevance, normalizeIdentifier } from './database-context.types';
import { schemaTableCandidate } from './database-metadata-retrieval.service';

@Injectable()
export class RelationshipExpansionService {
  expand(
    tables: readonly SchemaTable[],
    rootTableNames: readonly string[],
    request: AnalyzedDatabaseContextRequest,
    depth: number,
    maximumRelationships: number,
  ): RelationshipExpansion {
    const tableByName = new Map(tables.map((table) => [table.name, table]));
    const selected = new Set(rootTableNames.filter((name) => tableByName.has(name)));
    const expandedTables = new Map<string, DatabaseContextCandidate>();
    const relationships = new Map<string, DatabaseContextCandidate>();
    let frontier = new Set(selected);

    for (let currentDepth = 0; currentDepth < depth && frontier.size > 0; currentDepth += 1) {
      const next = new Set<string>();
      for (const table of tables) {
        for (const foreignKey of table.foreignKeys) {
          const touchesFrontier = frontier.has(table.name) || frontier.has(foreignKey.referencedTableName);
          if (!touchesFrontier || relationships.size >= maximumRelationships) continue;
          const targetTable = tableByName.get(foreignKey.referencedTableName);
          if (!targetTable) continue;
          const relationshipName = `${table.name}.${foreignKey.columnName} → ${targetTable.name}.${foreignKey.referencedColumnName}`;
          relationships.set(foreignKey.constraintName, {
            authority: DatabaseContextAuthority.ActualSchema,
            columnName: foreignKey.columnName,
            confidence: 1,
            content: null,
            dedupeKey: `relationship:${normalizeIdentifier(table.name)}:${normalizeIdentifier(foreignKey.constraintName)}`,
            exactMatch: request.identifiers.some(
              (identifier) => normalizeIdentifier(relationshipName).includes(normalizeIdentifier(identifier)),
            ),
            id: `schema:relationship:${table.name}:${foreignKey.constraintName}`,
            importance: 100,
            kind: 'RELATIONSHIP',
            relevance: lexicalRelevance(request.tokens, relationshipName),
            relationship: { foreignKey, sourceTable: table },
            relationshipName,
            semanticSimilarity: 0,
            source: DatabaseContextSource.SchemaSnapshot,
            tableName: table.name,
            verified: true,
          });
          if (!selected.has(table.name)) {
            expandedTables.set(table.name, schemaTableCandidate(table, false, lexicalRelevance(request.tokens, table.name)));
            next.add(table.name);
          }
          if (!selected.has(targetTable.name)) {
            expandedTables.set(targetTable.name, schemaTableCandidate(targetTable, false, lexicalRelevance(request.tokens, targetTable.name)));
            next.add(targetTable.name);
          }
        }
      }
      frontier = next;
    }

    return { relationships: [...relationships.values()], tables: [...expandedTables.values()] };
  }
}
