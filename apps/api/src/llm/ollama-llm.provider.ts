import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { z } from 'zod';

import { AppConfigService } from '../config/app-config.service';
import type { LlmPromptVersion } from './enums/llm-task.enum';
import { LlmDataPolicyService } from './llm-data-policy.service';
import { LlmModelConfigService } from './llm-model-config.service';
import type {
  LlmProvider,
  LlmRequestContext,
  LlmUsage,
  StructuredLlmRequest,
  StructuredLlmResponse,
  TextLlmRequest,
  TextLlmResponse,
} from './llm-provider.interface';
import { LlmProviderError } from './llm-provider.error';
import { LlmUsageService } from './llm-usage.service';

interface OllamaResponsePayload {
  eval_count?: unknown;
  message?: { content?: unknown };
  model?: unknown;
  prompt_eval_count?: unknown;
}

interface GeneratedOllamaResponse<T> {
  data: T;
  model: string;
  promptVersion: LlmPromptVersion;
  provider: 'OLLAMA';
  usage: LlmUsage;
}

@Injectable()
export class OllamaLlmProvider implements LlmProvider {
  private activeRequests = 0;

  constructor(
    private readonly config: AppConfigService,
    private readonly modelConfig: LlmModelConfigService,
    private readonly usageService: LlmUsageService,
    private readonly dataPolicy: LlmDataPolicyService,
    @InjectPinoLogger(OllamaLlmProvider.name) private readonly logger: PinoLogger,
  ) {}

  isConfigured(): boolean {
    return this.config.ollama.model !== undefined;
  }

  async generateText(request: TextLlmRequest): Promise<TextLlmResponse> {
    const response = await this.generate(request, (content) => content);
    return { ...response, content: response.data };
  }

  async generateStructured<T>(
    request: StructuredLlmRequest<T>,
  ): Promise<StructuredLlmResponse<T>> {
    const response = await this.generate(request, (content) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new LlmProviderError(
          'LLM_RESPONSE_INVALID',
          'The language model returned invalid structured output',
          true,
        );
      }
      const result = request.schema.safeParse(parsed);
      if (!result.success) {
        throw new LlmProviderError(
          'LLM_RESPONSE_INVALID',
          'The language model returned invalid structured output',
          true,
        );
      }
      return result.data;
    }, z.toJSONSchema(request.schema));
    return { ...response, data: response.data };
  }

  private async generate<T>(
    request: LlmRequestContext,
    parse: (content: string) => T,
    format?: Record<string, unknown>,
  ): Promise<GeneratedOllamaResponse<T>> {
    if (!this.isConfigured()) {
      throw new LlmProviderError('LLM_PROVIDER_UNAVAILABLE', 'Local language model is not configured', true);
    }
    this.dataPolicy.assertSafeMessages(request.messages);
    if (this.activeRequests >= this.config.llm.maxConcurrency) {
      throw new LlmProviderError(
        'LLM_CONCURRENCY_LIMIT',
        'LLM request capacity is temporarily exhausted',
        false,
      );
    }

    this.activeRequests += 1;
    const taskConfig = this.modelConfig.getTaskConfiguration(request.task);
    try {
      let lastError: LlmProviderError | undefined;
      for (let attempt = 0; attempt <= this.config.llm.maxRetries; attempt += 1) {
        const startedAt = Date.now();
        let completion: { content: string; model: string; usage: Omit<LlmUsage, 'latencyMs'> } | undefined;
        let success = false;
        try {
          this.logger.info({ attempt: attempt + 1, task: request.task }, 'Ollama LLM request started');
          completion = await this.requestCompletion(request.messages, taskConfig.temperature, taskConfig.maxOutputTokens, format);
          const usage = { ...completion.usage, latencyMs: Date.now() - startedAt };
          const data = parse(completion.content);
          success = true;
          this.logger.info(
            { attempt: attempt + 1, durationMs: usage.latencyMs, task: request.task },
            'Ollama LLM request completed',
          );
          return {
            data,
            model: completion.model,
            promptVersion: taskConfig.promptVersion,
            provider: 'OLLAMA',
            usage,
          };
        } catch (error) {
          lastError = this.normalizeError(error);
          this.logger.warn(
            {
              attempt: attempt + 1,
              durationMs: Date.now() - startedAt,
              errorCode: lastError.code,
              task: request.task,
            },
            'Ollama LLM request failed',
          );
        } finally {
          const usage = completion?.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
          await this.usageService.record({
            organizationId: request.organizationId,
            datasourceId: request.datasourceId,
            knowledgeVersionId: request.knowledgeVersionId,
            specificationVersionId: request.specificationVersionId,
            task: request.task,
            promptVersion: taskConfig.promptVersion,
            provider: 'OLLAMA',
            model: completion?.model ?? this.requireModel(),
            ...usage,
            latencyMs: Date.now() - startedAt,
            success,
          });
        }
        if (!this.shouldRetryLocally(lastError) || attempt === this.config.llm.maxRetries) break;
      }
      throw lastError ?? new LlmProviderError('LLM_PROVIDER_UNAVAILABLE', 'Local language model is unavailable', true);
    } finally {
      this.activeRequests -= 1;
    }
  }

  private async requestCompletion(
    messages: TextLlmRequest['messages'],
    temperature: number,
    maxOutputTokens: number,
    format?: Record<string, unknown>,
  ): Promise<{ content: string; model: string; usage: Omit<LlmUsage, 'latencyMs'> }> {
    let response: Response;
    try {
      response = await fetch(`${this.config.ollama.baseUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.requireModel(),
          messages,
          stream: false,
          options: { num_predict: maxOutputTokens, temperature },
          ...(format === undefined ? {} : { format, think: false }),
        }),
        signal: AbortSignal.timeout(this.config.ollama.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new LlmProviderError('LLM_TIMEOUT', 'Local language model request timed out', true);
      }
      this.logger.warn(
        { errorName: error instanceof Error ? error.name : 'UNKNOWN' },
        'Ollama LLM request could not reach the local service',
      );
      throw new LlmProviderError('LLM_PROVIDER_UNAVAILABLE', 'Local language model is unavailable', true);
    }

    if (!response.ok) {
      this.logger.warn({ httpStatus: response.status }, 'Ollama LLM request received a non-success response');
      if (response.status === 404 || response.status === 429 || response.status >= 500) {
        throw new LlmProviderError('LLM_PROVIDER_UNAVAILABLE', 'Local language model is unavailable', true);
      }
      throw new LlmProviderError('LLM_PROVIDER_REJECTED', 'Local language model rejected the request', false);
    }

    let payload: OllamaResponsePayload;
    try {
      payload = (await response.json()) as OllamaResponsePayload;
    } catch {
      throw new LlmProviderError('LLM_RESPONSE_INVALID', 'Local language model returned an invalid response', true);
    }
    const content = payload.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      throw new LlmProviderError('LLM_RESPONSE_INVALID', 'Local language model returned an invalid response', true);
    }
    const inputTokens = tokenCount(payload.prompt_eval_count);
    const outputTokens = tokenCount(payload.eval_count);
    return {
      content,
      model: typeof payload.model === 'string' ? payload.model : this.requireModel(),
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
    };
  }

  private requireModel(): string {
    const model = this.config.ollama.model;
    if (!model) throw new LlmProviderError('LLM_PROVIDER_UNAVAILABLE', 'Local language model is not configured', true);
    return model;
  }

  private shouldRetryLocally(error: LlmProviderError): boolean {
    return error.retryable && !['LLM_PROVIDER_UNAVAILABLE', 'LLM_RESPONSE_INVALID', 'LLM_TIMEOUT'].includes(error.code);
  }

  private normalizeError(error: unknown): LlmProviderError {
    return error instanceof LlmProviderError
      ? error
      : new LlmProviderError('LLM_PROVIDER_UNAVAILABLE', 'Local language model is unavailable', true);
  }
}

function tokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
