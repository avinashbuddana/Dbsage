import { Injectable } from '@nestjs/common';

import type { DatabaseContextCandidate } from './database-context.types';

@Injectable()
export class ContextDeduplicationService {
  deduplicate(candidates: readonly DatabaseContextCandidate[]): DatabaseContextCandidate[] {
    const strongestByKey = new Map<string, DatabaseContextCandidate>();
    for (const candidate of candidates) {
      const current = strongestByKey.get(candidate.dedupeKey);
      if (!current || (candidate.score ?? 0) > (current.score ?? 0)) strongestByKey.set(candidate.dedupeKey, candidate);
    }
    return [...strongestByKey.values()].sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
  }
}
