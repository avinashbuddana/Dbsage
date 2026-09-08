import { z } from 'zod';

import type { AppConfigService } from '../config/app-config.service';
import { LlmTask } from './enums/llm-task.enum';
import { LlmDataPolicyService } from './llm-data-policy.service';
import { LlmModelConfigService } from './llm-model-config.service';
import type { LlmUsageService } from './llm-usage.service';
import { OpenRouterLlmProvider } from './openrouter-llm.provider';

const request = {
  organizationId: 'de6c61b0-5734-4579-96e3-641698e97a36',
  task: LlmTask.SpecRequirementExtraction,
  messages: [{ role: 'user' as const, content: 'Extract the customer entity.' }],
};

function response(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

function setup(overrides: Partial<AppConfigService['llm']> = {}) {
  const config = {
    llm: {
      apiKey: 'test-openrouter-api-key',
      baseUrl: 'https://openrouter.example/api/v1',
      openRouterModel: 'nvidia/nemotron-3.5-lightning',
      openRouterSupportsJsonSchema: true,
      fallbackModels: [],
      maxConcurrency: 2,
      maxOutputTokens: 2_048,
      maxRetries: 0,
      provider: 'openrouter',
      reasoningModel: 'nvidia/nemotron-3-super-120b-a12b',
      temperature: 0.1,
      timeoutMs: 30_000,
      ...overrides,
    },
  } as unknown as AppConfigService;
  const usageRecord = jest.fn().mockResolvedValue(undefined);
  const usageService = { record: usageRecord } as unknown as LlmUsageService;
  const provider = new OpenRouterLlmProvider(
    config,
    new LlmModelConfigService(config),
    usageService,
    new LlmDataPolicyService(),
    { info: jest.fn(), warn: jest.fn() } as never,
  );
  const fetchSpy = jest.spyOn(globalThis, 'fetch');

  return { fetchSpy, provider, usageRecord };
}

describe('OpenRouterLlmProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses strict JSON schema, captures actual token usage, and keeps the model in configuration', async () => {
    const { fetchSpy, provider, usageRecord } = setup();
    fetchSpy.mockResolvedValue(
      response({
        choices: [{ message: { content: '{"entity":"Customer"}' } }],
        model: 'nvidia/nemotron-3.5-lightning',
        usage: { completion_tokens: 11, prompt_tokens: 19, total_tokens: 30 },
      }),
    );

    const result = await provider.generateStructured({
      ...request,
      schemaName: 'specification_extraction',
      schema: z.object({ entity: z.string() }),
    });

    expect(result).toMatchObject({
      data: { entity: 'Customer' },
      model: 'nvidia/nemotron-3.5-lightning',
      provider: 'OPENROUTER',
      usage: { inputTokens: 19, outputTokens: 11, totalTokens: 30 },
    });
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(url).toBe('https://openrouter.example/api/v1/chat/completions');
    expect(body).toMatchObject({
      max_completion_tokens: 2_048,
      model: 'nvidia/nemotron-3.5-lightning',
      temperature: 0.1,
    });
    expect(body).not.toHaveProperty('provider');
    expect(body.response_format).toMatchObject({
      json_schema: { name: 'specification_extraction', strict: true },
      type: 'json_schema',
    });
    expect(usageRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 19,
        outputTokens: 11,
        promptVersion: 'SPEC_REQUIREMENT_EXTRACTION_V1',
        success: true,
        totalTokens: 30,
      }),
    );
  });

  it('does not retry invalid structured output', async () => {
    const { fetchSpy, provider, usageRecord } = setup({ maxRetries: 1 });
    fetchSpy
      .mockResolvedValueOnce(
        response({
          choices: [{ message: { content: '{"wrong":true}' } }],
          usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
        }),
      );
    await expect(
      provider.generateStructured({
        ...request,
        schemaName: 'specification_extraction',
        schema: z.object({ entity: z.string() }),
      }),
    ).rejects.toMatchObject({ code: 'LLM_RESPONSE_INVALID' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(usageRecord).toHaveBeenCalledWith(expect.objectContaining({ success: false, totalTokens: 2 }));
  });

  it('forces a schema-bearing tool call when the configured endpoint does not support response_format', async () => {
    const { fetchSpy, provider } = setup({ openRouterSupportsJsonSchema: false });
    fetchSpy.mockResolvedValue(
      response({
        choices: [
          {
            message: {
              tool_calls: [
                {
                  type: 'function',
                  function: { name: 'specification_extraction', arguments: '{"entity":"Customer"}' },
                },
              ],
            },
          },
        ],
        usage: {},
      }),
    );

    await expect(
      provider.generateStructured({
        ...request,
        schemaName: 'specification_extraction',
        schema: z.object({ entity: z.string() }),
      }),
    ).resolves.toMatchObject({ data: { entity: 'Customer' } });

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      parallel_tool_calls?: boolean;
      tool_choice?: { function?: { name?: string }; type?: string };
      tools?: { function?: { name?: string; parameters?: unknown }; type?: string }[];
    };
    expect(body).not.toHaveProperty('response_format');
    expect(body).toMatchObject({
      parallel_tool_calls: false,
      tool_choice: { type: 'function', function: { name: 'specification_extraction' } },
      tools: [
        {
          type: 'function',
          function: { name: 'specification_extraction' },
        },
      ],
    });
    expect(typeof body.tools?.[0]?.function?.parameters).toBe('object');
  });

  it('normalizes provider failures without exposing the provider response', async () => {
    const { fetchSpy, provider, usageRecord } = setup();
    fetchSpy.mockResolvedValue(response({ error: { message: 'secret upstream detail' } }, 401));

    await expect(provider.generateText(request)).rejects.toMatchObject({
      code: 'LLM_AUTHENTICATION_FAILED',
      message: 'LLM provider authentication failed',
    });
    expect(usageRecord).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, totalTokens: 0 }),
    );
  });

  it('blocks obvious secret material before it can reach OpenRouter', async () => {
    const { fetchSpy, provider } = setup();

    await expect(
      provider.generateText({
        ...request,
        messages: [{ role: 'user', content: 'database password: never-send-this' }],
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'LLM_PROMPT_REJECTED' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails fast at configured concurrency rather than queuing unbounded prompts', async () => {
    const { fetchSpy, provider } = setup({ maxConcurrency: 1 });
    let resolveResponse: ((value: Response) => void) | undefined;
    fetchSpy.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );

    const first = provider.generateText(request);
    await expect(provider.generateText(request)).rejects.toMatchObject({
      code: 'LLM_CONCURRENCY_LIMIT',
    });

    resolveResponse?.(
      response({ choices: [{ message: { content: 'done' } }], usage: {} }),
    );
    await expect(first).resolves.toMatchObject({ content: 'done' });
  });

  it('sends only explicitly configured fallback models in priority order', async () => {
    const { fetchSpy, provider } = setup({ fallbackModels: ['qwen/qwen3.5'] });
    fetchSpy.mockResolvedValue(response({ choices: [{ message: { content: 'done' } }], usage: {} }));

    await provider.generateText(request);

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toMatchObject({
      models: ['nvidia/nemotron-3.5-lightning', 'qwen/qwen3.5'],
    });
  });
});
