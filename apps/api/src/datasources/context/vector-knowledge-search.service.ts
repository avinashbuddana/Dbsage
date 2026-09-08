import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { AppConfigService } from '../../config/app-config.service';
import { EmbeddingService } from '../knowledge/embedding.service';
import { KnowledgeChunkEntity } from '../knowledge/entities/knowledge-chunk.entity';

export interface VectorKnowledgeHit {
  knowledgeId: string;
  similarity: number;
}

@Injectable()
export class VectorKnowledgeSearchService {
  constructor(
    @InjectRepository(KnowledgeChunkEntity)
    private readonly chunks: Repository<KnowledgeChunkEntity>,
    private readonly embeddings: EmbeddingService,
    private readonly config: AppConfigService,
  ) {}

  async search(
    organizationId: string,
    datasourceId: string,
    knowledgeVersionId: string,
    query: string,
    maximum: number,
  ): Promise<VectorKnowledgeHit[]> {
    try {
      const [embedding] = await this.embeddings.embed([query]);
      if (!embedding || embedding.some((value) => !Number.isFinite(value))) return [];
      const vector = `[${embedding.join(',')}]`;
      const { entities, raw } = await this.chunks
        .createQueryBuilder('chunk')
        .addSelect('1 - (chunk.embedding <=> CAST(:embedding AS vector))', 'semantic_score')
        .where('chunk.organizationId = :organizationId', { organizationId })
        .andWhere('chunk.datasourceId = :datasourceId', { datasourceId })
        .andWhere('chunk.knowledgeVersionId = :knowledgeVersionId', { knowledgeVersionId })
        .andWhere('chunk.active = true')
        .andWhere('chunk.embedding IS NOT NULL')
        .andWhere('chunk.embeddingDimensions = :dimensions', { dimensions: this.embeddings.dimensions })
        .orderBy('chunk.embedding <=> CAST(:embedding AS vector)', 'ASC')
        .setParameter('embedding', vector)
        .take(maximum)
        .getRawAndEntities();
      return entities
        .map((chunk, index) => ({
          knowledgeId: chunk.knowledgeId,
          similarity: semanticScore(raw[index]),
        }))
        .filter((hit) => Number.isFinite(hit.similarity) && hit.similarity >= this.config.databaseContext.minVectorSimilarity);
    } catch {
      // A failed embedding request must not prevent exact schema retrieval.
      return [];
    }
  }
}

function semanticScore(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null || !('semantic_score' in raw)) return 0;
  const value = raw.semantic_score;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const score = Number(value);
  return Number.isFinite(score) ? score : 0;
}
