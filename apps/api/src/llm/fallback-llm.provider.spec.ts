import type { AppConfigService } from '../config/app-config.service';
import { LlmTask } from './enums/llm-task.enum';
import { FallbackLlmProvider } from './fallback-llm.provider';
import { LlmProviderError } from './llm-provider.error';

const request = {
  organizationId: 'organization-id',
  task: LlmTask.SpecCompatibilityExplanation,
  messages: [{ content: 'Analyze the schema.', role: 'user' as const }],
};

function setup({
  configured = true,
  provider = 'openrouter',
}: { configured?: boolean; provider?: 'ollama' | 'openrouter' } = {}) {
  const config = { llm: { provider } } as AppConfigService;
  const openRouter = { generateStructured: jest.fn(), generateText: jest.fn() };
  const ollama = {
    generateStructured: jest.fn(),
    generateText: jest.fn(),
    isConfigured: jest.fn(() => configured),
  };
  return {
    ollama,
    openRouter,
    provider: new FallbackLlmProvider(config, openRouter as never, ollama as never),
  };
}

describe('FallbackLlmProvider', () => {
  it('uses local Ollama after a retryable OpenRouter failure', async () => {
    const { ollama, openRouter, provider } = setup();
    openRouter.generateText.mockRejectedValue(
      new LlmProviderError('LLM_PROVIDER_UNAVAILABLE', 'OpenRouter is unavailable', true),
    );
    ollama.generateText.mockResolvedValue({ content: 'Local result', provider: 'OLLAMA' });

    await expect(provider.generateText(request)).resolves.toEqual({ content: 'Local result', provider: 'OLLAMA' });
    expect(ollama.generateText).toHaveBeenCalledWith(request);
  });

  it('does not send a rejected prompt to Ollama', async () => {
    const { ollama, openRouter, provider } = setup();
    openRouter.generateText.mockRejectedValue(
      new LlmProviderError('LLM_PROMPT_REJECTED', 'Prompt rejected', false),
    );

    await expect(provider.generateText(request)).rejects.toMatchObject({ code: 'LLM_PROMPT_REJECTED' });
    expect(ollama.generateText).not.toHaveBeenCalled();
  });

  it('uses configured Ollama first when it is selected', async () => {
    const { ollama, openRouter, provider } = setup({ provider: 'ollama' });
    ollama.generateText.mockResolvedValue({ content: 'Local result', provider: 'OLLAMA' });

    await expect(provider.generateText(request)).resolves.toEqual({
      content: 'Local result',
      provider: 'OLLAMA',
    });

    expect(openRouter.generateText).not.toHaveBeenCalled();
  });

  it('uses OpenRouter after a retryable selected-Ollama failure', async () => {
    const { ollama, openRouter, provider } = setup({ provider: 'ollama' });
    ollama.generateText.mockRejectedValue(
      new LlmProviderError('LLM_PROVIDER_UNAVAILABLE', 'Local model is unavailable', true),
    );
    openRouter.generateText.mockResolvedValue({ content: 'Cloud result', provider: 'OPENROUTER' });

    await expect(provider.generateText(request)).resolves.toEqual({
      content: 'Cloud result',
      provider: 'OPENROUTER',
    });
  });
});
