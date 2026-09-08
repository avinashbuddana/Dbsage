import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';
import type {
  LlmProvider,
  StructuredLlmRequest,
  StructuredLlmResponse,
  TextLlmRequest,
  TextLlmResponse,
} from './llm-provider.interface';
import { LlmProviderError } from './llm-provider.error';
import { OllamaLlmProvider } from './ollama-llm.provider';
import { OpenRouterLlmProvider } from './openrouter-llm.provider';

@Injectable()
export class FallbackLlmProvider implements LlmProvider {
  constructor(
    private readonly config: AppConfigService,
    private readonly openRouter: OpenRouterLlmProvider,
    private readonly ollama: OllamaLlmProvider,
  ) {}

  generateText(request: TextLlmRequest): Promise<TextLlmResponse> {
    return this.useOllamaFirst()
      ? this.withRetryableFallback(() => this.ollama.generateText(request), () =>
          this.openRouter.generateText(request),
        )
      : this.withRetryableFallback(
          () => this.openRouter.generateText(request),
          () => this.ollama.generateText(request),
          this.ollama.isConfigured(),
        );
  }

  generateStructured<T>(request: StructuredLlmRequest<T>): Promise<StructuredLlmResponse<T>> {
    return this.useOllamaFirst()
      ? this.withRetryableFallback(() => this.ollama.generateStructured(request), () =>
          this.openRouter.generateStructured(request),
        )
      : this.withRetryableFallback(
          () => this.openRouter.generateStructured(request),
          () => this.ollama.generateStructured(request),
          this.ollama.isConfigured(),
        );
  }

  private useOllamaFirst(): boolean {
    return this.config.llm.provider === 'ollama';
  }

  private async withRetryableFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    fallbackAvailable = true,
  ): Promise<T> {
    try {
      return await primary();
    } catch (error) {
      if (!(error instanceof LlmProviderError) || !error.retryable || !fallbackAvailable) {
        throw error;
      }
      return fallback();
    }
  }
}
