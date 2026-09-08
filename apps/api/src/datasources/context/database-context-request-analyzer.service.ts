import { Injectable } from '@nestjs/common';

import type { DatabaseContextRequest, AnalyzedDatabaseContextRequest } from './database-context.types';

const STOP_WORDS = new Set([
  'about',
  'and',
  'are',
  'database',
  'does',
  'explain',
  'for',
  'from',
  'how',
  'in',
  'is',
  'of',
  'show',
  'table',
  'the',
  'to',
  'what',
  'which',
  'with',
]);

@Injectable()
export class DatabaseContextRequestAnalyzer {
  analyze(request: DatabaseContextRequest): AnalyzedDatabaseContextRequest {
    const requestedTables = unique(request.requestedTables ?? []);
    const requestedColumns = unique(request.requestedColumns ?? []);
    const requestedConcepts = unique(request.requestedConcepts ?? []);
    const tokens = unique(
      request.query
        .match(/[A-Za-z][A-Za-z0-9_]*/g)
        ?.map((token) => token.trim())
        .filter((token) => token.length >= 2 && !STOP_WORDS.has(token.toLowerCase())) ?? [],
    );

    return {
      identifiers: unique([...requestedTables, ...requestedColumns, ...requestedConcepts, ...tokens]),
      purpose: request.purpose,
      query: request.query.trim(),
      requestedColumns,
      requestedConcepts,
      requestedTables,
      tokens,
    };
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}
