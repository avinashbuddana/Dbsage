import { Injectable } from '@nestjs/common';
import { DatabaseContextAuthority } from '@schemaiq/types';

import type { DatabaseContextCandidate } from './database-context.types';

const AUTHORITY_SCORE: Readonly<Record<DatabaseContextAuthority, number>> = {
  [DatabaseContextAuthority.ActualSchema]: 100,
  [DatabaseContextAuthority.UserConfirmed]: 90,
  [DatabaseContextAuthority.HybridVerified]: 80,
  [DatabaseContextAuthority.VerifiedSpecification]: 70,
  [DatabaseContextAuthority.DatabaseSemantic]: 60,
  [DatabaseContextAuthority.LlmDerived]: 50,
  [DatabaseContextAuthority.Inferred]: 30,
};

@Injectable()
export class ContextRerankingService {
  rerank(candidates: readonly DatabaseContextCandidate[]): DatabaseContextCandidate[] {
    return candidates
      .map((candidate) => ({
        ...candidate,
        score:
          AUTHORITY_SCORE[candidate.authority] * 10 +
          (candidate.exactMatch ? 25 : 0) +
          candidate.semanticSimilarity * 20 +
          candidate.relevance * 15 +
          candidate.confidence * 8 +
          candidate.importance * 0.05,
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.id.localeCompare(right.id),
      );
  }
}
