import { z } from 'zod';

import type { AppConfigService } from '../config/app-config.service';
import { LlmTask } from './enums/llm-task.enum';
import { LlmDataPolicyService } from './llm-data-policy.service';
import { LlmModelConfigService } from './llm-model-config.service';
import type { LlmUsageService } from './llm-usage.service';
import { OllamaLlmProvider } from './ollama-llm.provider';

function response(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

function setup(model?: string, maxRetries = 0) {
  const config = {
    llm: {
      openRouterModel: 'nvidia/nemotron-3.5-lightning',
      fallbackModels: [],
      maxConcurrency: 2,
      maxOutputTokens: 2_048,
      maxRetries,
      temperature: 0.1,
    },
    ollama: { baseUrl: 'http://127.0.0.1:11434', model, timeoutMs: 120_000 },
  } as unknown as AppConfigService;
  const usageRecord = jest.fn().mockResolvedValue(undefined);
  const provider = new OllamaLlmProvider(
    config,
    new LlmModelConfigService(config),
    { record: usageRecord } as unknown as LlmUsageService,
    new LlmDataPolicyService(),
    { info: jest.fn(), warn: jest.fn() } as never,
  );
  return { provider, usageRecord };
}

describe('OllamaLlmProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses the local chat endpoint and records only token telemetry', async () => {
    const { provider, usageRecord } = setup('qwen3:8b');
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        eval_count: 7,
        message: { content: 'The schema has an orders table.' },
        model: 'qwen3:8b',
        prompt_eval_count: 13,
      }),
    );

    await expect(
      provider.generateText({
        organizationId: 'organization-id',
        task: LlmTask.SpecCompatibilityExplanation,
        messages: [{ content: 'Analyze the schema.', role: 'user' }],
      }),
    ).resolves.toMatchObject({
      content: 'The schema has an orders table.',
      model: 'qwen3:8b',
      provider: 'OLLAMA',
      usage: { inputTokens: 13, outputTokens: 7, totalTokens: 20 },
    });

    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    expect(JSON.parse(options.body as string)).toMatchObject({
      model: 'qwen3:8b',
      options: { num_predict: 2_048, temperature: 0.1 },
      stream: false,
    });
    expect(usageRecord).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'OLLAMA', success: true, totalTokens: 20 }),
    );
  });

  it('passes a JSON schema to local Ollama for structured work', async () => {
    const { provider } = setup('qwen3:8b');
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({ message: { content: '{"table":"orders"}' }, model: 'qwen3:8b' }),
    );

    await expect(
      provider.generateStructured({
        organizationId: 'organization-id',
        schema: z.object({ table: z.string() }),
        schemaName: 'table_name',
        task: LlmTask.SpecRequirementExtraction,
        messages: [{ content: 'Extract the table.', role: 'user' }],
      }),
    ).resolves.toMatchObject({ data: { table: 'orders' }, provider: 'OLLAMA' });

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = z.object({ format: z.object({ type: z.string() }), think: z.literal(false) }).parse(JSON.parse(options.body as string));
    expect(body.format).toMatchObject({ type: 'object' });
  });

  it.each([
    ['invalid structured output', () => Promise.resolve(response({ message: { content: 'not JSON' }, model: 'qwen3:8b' }))],
    ['timeout', () => {
      const error = new Error('timed out');
      Object.defineProperty(error, 'name', { value: 'TimeoutError' });
      return Promise.reject(error);
    }],
    ['unavailable', () => Promise.resolve(response({}, 500))],
  ])('does not retry local %s failures before fallback can run', async (_name, nextResponse) => {
    const { provider } = setup('qwen3:8b', 2);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(nextResponse);

    await expect(
      provider.generateStructured({
        organizationId: 'organization-id',
        schema: z.object({ table: z.string() }),
        schemaName: 'table_name',
        task: LlmTask.NaturalLanguageQueryPlanning,
        messages: [{ content: 'Plan a query.', role: 'user' }],
      }),
    ).rejects.toMatchObject({
      code: _name === 'timeout' ? 'LLM_TIMEOUT' : _name === 'unavailable' ? 'LLM_PROVIDER_UNAVAILABLE' : 'LLM_RESPONSE_INVALID',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not claim availability when no local model is configured', () => {
    expect(setup().provider.isConfigured()).toBe(false);
  });
});
