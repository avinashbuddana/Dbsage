import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { LlmProviderError } from '../../llm/llm-provider.error';
import type { EmbeddingProvider } from './embedding-provider.interface';

interface OllamaEmbeddingPayload {
  embeddings?: unknown;
}

@Injectable()
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private activeRequests = 0;

  constructor(private readonly config: AppConfigService) {}

  get model(): string {
    const model = this.config.ollama.embeddingModel;
    if (!model) throw new LlmProviderError('LLM_PROVIDER_UNAVAILABLE', 'Ollama embeddings are not configured', false);
    return model;
  }

  async embed(inputs: readonly string[]): Promise<number[][]> {
    if (inputs.length === 0) return [];
    if (inputs.length > this.config.embedding.maxBatchSize) {
      throw new LlmProviderError('LLM_PROVIDER_REJECTED', 'Embedding batch is too large', false);
    }
    if (this.activeRequests >= this.config.embedding.maxConcurrency) {
      throw new LlmProviderError('LLM_CONCURRENCY_LIMIT', 'Embedding capacity is temporarily exhausted', false);
    }
    this.activeRequests += 1;
    try {
      let lastError: LlmProviderError | undefined;
      for (let attempt = 0; attempt <= this.config.llm.maxRetries; attempt += 1) {
        try {
          return await this.request(inputs);
        } catch (error) {
          lastError = normalizeError(error);
          if (!lastError.retryable || attempt === this.config.llm.maxRetries) throw lastError;
        }
      }
      throw lastError ?? new LlmProviderError('LLM_PROVIDER_UNAVAILABLE', 'Embedding provider is unavailable', true);
    } finally {
      this.activeRequests -= 1;
    }
  }

  private async request(inputs: readonly string[]): Promise<number[][]> {
    let response: Response;
    try {
      response = await fetch(`${this.config.ollama.baseUrl.replace(/\/$/, '')}/api/embed`, {
        body: JSON.stringify({ input: inputs, model: this.model }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(this.config.embedding.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new LlmProviderError('LLM_TIMEOUT', 'Embedding request timed out', true);
      }
      throw new LlmProviderError('LLM_PROVIDER_UNAVAILABLE', 'Embedding provider is unavailable', true);
    }
    if (!response.ok) {
      throw new LlmProviderError(
        response.status >= 500 || response.status === 429 ? 'LLM_PROVIDER_UNAVAILABLE' : 'LLM_PROVIDER_REJECTED',
        'Embedding provider rejected the request',
        response.status >= 500 || response.status === 429,
      );
    }
    let payload: OllamaEmbeddingPayload;
    try {
      payload = (await response.json()) as OllamaEmbeddingPayload;
    } catch {
      throw new LlmProviderError('LLM_RESPONSE_INVALID', 'Embedding provider returned an invalid response', true);
    }
    if (!Array.isArray(payload.embeddings) || payload.embeddings.length !== inputs.length) {
      throw new LlmProviderError('LLM_RESPONSE_INVALID', 'Embedding provider returned an invalid response', true);
    }
    return payload.embeddings.map((embedding) => {
      if (!Array.isArray(embedding) || embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
        throw new LlmProviderError('LLM_RESPONSE_INVALID', 'Embedding provider returned an invalid vector', true);
      }
      return embedding as number[];
    });
  }
}

function normalizeError(error: unknown): LlmProviderError {
  return error instanceof LlmProviderError
    ? error
    : new LlmProviderError('LLM_PROVIDER_UNAVAILABLE', 'Embedding provider is unavailable', true);
}
