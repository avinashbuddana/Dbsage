import { Injectable } from '@nestjs/common';

import type { DatabaseContextCandidate } from './database-context.types';

export interface BudgetedContextCandidates {
  candidates: DatabaseContextCandidate[];
  estimatedTokens: number;
  truncated: boolean;
}

@Injectable()
export class ContextBudgetService {
  apply(
    candidates: readonly DatabaseContextCandidate[],
    maximumItems: number,
    maximumEstimatedTokens: number,
    maximumColumnsPerTable: number,
  ): BudgetedContextCandidates {
    const selected: DatabaseContextCandidate[] = [];
    let estimatedTokens = 0;
    for (const candidate of candidates) {
      if (selected.length >= maximumItems) break;
      const candidateTokens = estimateTokens(candidate, maximumColumnsPerTable);
      if (selected.length > 0 && estimatedTokens + candidateTokens > maximumEstimatedTokens) continue;
      selected.push(candidate);
      estimatedTokens += candidateTokens;
    }
    return {
      candidates: selected,
      estimatedTokens,
      truncated: selected.length < candidates.length,
    };
  }
}

function estimateTokens(candidate: DatabaseContextCandidate, maximumColumnsPerTable: number): number {
  const tableText = candidate.table
    ? `${candidate.table.name} ${candidate.table.columns
        .slice(0, maximumColumnsPerTable)
        .map((column) => `${column.name} ${column.type}`)
        .join(' ')}`
    : '';
  const relationshipText = candidate.relationship
    ? `${candidate.relationship.sourceTable.name} ${candidate.relationship.foreignKey.constraintName}`
    : '';
  return Math.max(1, Math.ceil(`${tableText} ${relationshipText} ${candidate.content ?? ''}`.length / 4));
}
