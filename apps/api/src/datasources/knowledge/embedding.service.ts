import { Inject, Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { LlmDataPolicyService } from '../../llm/llm-data-policy.service';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from './embedding-provider.interface';

@Injectable()
export class EmbeddingService {
  constructor(
    @Inject(EMBEDDING_PROVIDER) private readonly provider: EmbeddingProvider,
    private readonly config: AppConfigService,
    private readonly dataPolicy: LlmDataPolicyService,
  ) {}

  get model(): string {
    return this.provider.model;
  }

  get dimensions(): number {
    return this.config.embedding.dimensions;
  }

  async embed(inputs: readonly string[]): Promise<number[][]> {
    this.dataPolicy.assertSafeMessages(inputs.map((content) => ({ content, role: 'user' as const })));
    const batches = chunk(inputs, this.config.embedding.maxBatchSize);
    const results = await mapBounded(batches, this.config.embedding.maxConcurrency, (batch) => this.provider.embed(batch));
    const embeddings = results.flat();
    if (embeddings.some((embedding) => embedding.length !== this.config.embedding.dimensions)) {
      throw new Error('Embedding dimensions do not match EMBEDDING_DIMENSIONS');
    }
    return embeddings;
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}

async function mapBounded<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      if (item !== undefined) results[index] = await mapper(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
