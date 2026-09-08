import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { z } from 'zod';

import { AppConfigService } from '../config/app-config.service';
import type { LlmPromptVersion } from './enums/llm-task.enum';
import type { LlmTaskConfiguration } from './llm-model-config.service';
import { LlmModelConfigService } from './llm-model-config.service';
import { LlmDataPolicyService } from './llm-data-policy.service';
import type {
  LlmMessage,
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

interface OpenRouterCompletion {
  content: string;
  model: string;
  toolArguments?: string;
  usage: Pick<LlmUsage, 'inputTokens' | 'outputTokens' | 'totalTokens'>;
}

interface StructuredOutputTool {
  definition: Record<string, unknown>;
  name: string;
}

interface OpenRouterRequestOptions {
  responseFormat?: Record<string, unknown>;
  structuredOutputTool?: StructuredOutputTool;
}

interface GeneratedLlmResponse<T> {
  data: T;
  provider: 'OPENROUTER';
  model: string;
  promptVersion: LlmPromptVersion;
  usage: LlmUsage;
}

interface OpenRouterResponsePayload {
  choices?: {
    message?: {
      content?: unknown;
      tool_calls?: { function?: { arguments?: unknown; name?: unknown }; type?: unknown }[];
    };
  }[];
  model?: unknown;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
  };
}

@Injectable()
export class OpenRouterLlmProvider implements LlmProvider {
  private activeRequests = 0;

  constructor(
    private readonly config: AppConfigService,
    private readonly modelConfig: LlmModelConfigService,
    private readonly usageService: LlmUsageService,
    private readonly dataPolicy: LlmDataPolicyService,
    @InjectPinoLogger(OpenRouterLlmProvider.name) private readonly logger: PinoLogger,
  ) {}

  async generateText(request: TextLlmRequest): Promise<TextLlmResponse> {
    const response = await this.generate(request, (completion) => completion.content);
    return { ...response, content: response.data };
  }

  async generateStructured<T>(
    request: StructuredLlmRequest<T>,
  ): Promise<StructuredLlmResponse<T>> {
    const responseFormat = this.config.llm.openRouterSupportsJsonSchema
      ? this.structuredResponseFormat(request)
      : undefined;
    const structuredOutputTool = responseFormat === undefined ? this.structuredOutputTool(request) : undefined;
    const response = await this.generate(request, (completion) => {
      const content = structuredOutputTool === undefined ? completion.content : completion.toolArguments;
      if (!content) {
        throw new LlmProviderError(
          'LLM_RESPONSE_INVALID',
          'The language model returned invalid structured output',
          true,
        );
      }
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
    }, { responseFormat, structuredOutputTool });
    return { ...response, data: response.data };
  }

  private async generate<T>(
    request: LlmRequestContext,
    parse: (completion: OpenRouterCompletion) => T,
    options: OpenRouterRequestOptions = {},
  ): Promise<GeneratedLlmResponse<T>> {
    this.dataPolicy.assertSafeMessages(request.messages);
    this.acquireRequestSlot();

    try {
      const taskConfig = this.modelConfig.getTaskConfiguration(request.task);
      let lastError: LlmProviderError | undefined;

      for (let attempt = 0; attempt <= this.config.llm.maxRetries; attempt += 1) {
        const startedAt = Date.now();
        let completion: OpenRouterCompletion | undefined;
        let success = false;

        try {
          this.logger.info({ attempt: attempt + 1, task: request.task }, 'OpenRouter LLM request started');
          completion = await this.requestCompletion(request.messages, taskConfig, options);
          const data = parse(completion);
          success = true;
          this.logger.info(
            { attempt: attempt + 1, durationMs: Date.now() - startedAt, task: request.task },
            'OpenRouter LLM request completed',
          );
          return {
            data,
            provider: 'OPENROUTER' as const,
            model: completion.model,
            promptVersion: taskConfig.promptVersion,
            usage: { ...completion.usage, latencyMs: Date.now() - startedAt },
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
            'OpenRouter LLM request failed',
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
            provider: 'OPENROUTER',
            model: completion?.model ?? taskConfig.model,
            ...usage,
            latencyMs: Date.now() - startedAt,
            success,
          });
        }

        if (!this.shouldRetry(lastError) || attempt === this.config.llm.maxRetries) break;
      }

      throw lastError ?? new LlmProviderError('LLM_PROVIDER_UNAVAILABLE', 'LLM request failed', true);
    } finally {
      this.activeRequests -= 1;
    }
  }

  private acquireRequestSlot(): void {
    if (this.activeRequests >= this.config.llm.maxConcurrency) {
      throw new LlmProviderError(
        'LLM_CONCURRENCY_LIMIT',
        'LLM request capacity is temporarily exhausted',
        false,
      );
    }

    this.activeRequests += 1;
  }

  private async requestCompletion(
    messages: readonly LlmMessage[],
    taskConfig: LlmTaskConfiguration,
    options: OpenRouterRequestOptions,
  ): Promise<OpenRouterCompletion> {
    let response: Response;
    try {
      response = await fetch(this.chatCompletionsUrl(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.requireApiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(taskConfig.fallbackModels.length === 0
            ? { model: taskConfig.model }
            : { models: [taskConfig.model, ...taskConfig.fallbackModels] }),
          messages,
          temperature: taskConfig.temperature,
          max_completion_tokens: taskConfig.maxOutputTokens,
          stream: false,
          ...(options.responseFormat === undefined ? {} : { response_format: options.responseFormat }),
          ...(options.structuredOutputTool === undefined
            ? {}
            : {
                parallel_tool_calls: false,
                tool_choice: { type: 'function', function: { name: options.structuredOutputTool.name } },
                tools: [options.structuredOutputTool.definition],
              }),
        }),
        signal: AbortSignal.timeout(this.config.llm.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new LlmProviderError('LLM_TIMEOUT', 'LLM request timed out', true);
      }
      this.logger.warn(
        { errorName: error instanceof Error ? error.name : 'UNKNOWN' },
        'OpenRouter LLM request could not reach the provider',
      );
      throw new LlmProviderError('LLM_PROVIDER_UNAVAILABLE', 'LLM provider is unavailable', true);
    }

    if (!response.ok) {
      this.logger.warn({ httpStatus: response.status }, 'OpenRouter LLM request received a non-success response');
      throw this.errorForStatus(response.status);
    }

    let payload: OpenRouterResponsePayload;
    try {
      payload = (await response.json()) as OpenRouterResponsePayload;
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new LlmProviderError('LLM_TIMEOUT', 'LLM request timed out', true);
      }
      throw new LlmProviderError('LLM_RESPONSE_INVALID', 'LLM provider returned an invalid response', true);
    }

    const message = payload.choices?.[0]?.message;
    const content = message?.content;
    const toolArguments = options.structuredOutputTool === undefined
      ? undefined
      : message?.tool_calls?.find(
          (toolCall) =>
            toolCall.type === 'function' && toolCall.function?.name === options.structuredOutputTool?.name,
        )?.function?.arguments;
    if (
      (typeof content !== 'string' || content.length === 0) &&
      (typeof toolArguments !== 'string' || toolArguments.length === 0)
    ) {
      throw new LlmProviderError('LLM_RESPONSE_INVALID', 'LLM provider returned an invalid response', true);
    }

    const inputTokens = tokenCount(payload.usage?.prompt_tokens);
    const outputTokens = tokenCount(payload.usage?.completion_tokens);
    return {
      content: typeof content === 'string' ? content : '',
      model: typeof payload.model === 'string' ? payload.model : taskConfig.model,
      toolArguments: typeof toolArguments === 'string' ? toolArguments : undefined,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: tokenCount(payload.usage?.total_tokens) || inputTokens + outputTokens,
      },
    };
  }

  private structuredResponseFormat<T>(request: StructuredLlmRequest<T>): Record<string, unknown> {
    return {
      type: 'json_schema',
      json_schema: {
        name: request.schemaName,
        strict: true,
        schema: z.toJSONSchema(request.schema),
      },
    };
  }

  private structuredOutputTool<T>(request: StructuredLlmRequest<T>): StructuredOutputTool {
    return {
      name: request.schemaName,
      definition: {
        type: 'function',
        function: {
          name: request.schemaName,
          description: 'Return the structured response. This function is not executed.',
          parameters: z.toJSONSchema(request.schema),
        },
      },
    };
  }

  private shouldRetry(error: LlmProviderError): boolean {
    return error.retryable && !['LLM_PROVIDER_UNAVAILABLE', 'LLM_RESPONSE_INVALID', 'LLM_TIMEOUT'].includes(error.code);
  }

  private chatCompletionsUrl(): string {
    return `${this.config.llm.baseUrl.replace(/\/$/, '')}/chat/completions`;
  }

  private requireApiKey(): string {
    const apiKey = this.config.llm.apiKey;
    if (!apiKey) {
      throw new LlmProviderError('LLM_PROVIDER_UNAVAILABLE', 'OpenRouter is not configured', false);
    }
    return apiKey;
  }

  private errorForStatus(status: number): LlmProviderError {
    if (status === 401 || status === 403) {
      return new LlmProviderError('LLM_AUTHENTICATION_FAILED', 'LLM provider authentication failed', false);
    }
    if (status === 429) {
      return new LlmProviderError('LLM_RATE_LIMITED', 'LLM provider rate limit reached', true);
    }
    if (status >= 500) {
      return new LlmProviderError('LLM_PROVIDER_UNAVAILABLE', 'LLM provider is unavailable', true);
    }
    return new LlmProviderError('LLM_PROVIDER_REJECTED', 'LLM provider rejected the request', false);
  }

  private normalizeError(error: unknown): LlmProviderError {
    if (error instanceof LlmProviderError) return error;
    return new LlmProviderError('LLM_PROVIDER_UNAVAILABLE', 'LLM provider is unavailable', true);
  }
}

function tokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
