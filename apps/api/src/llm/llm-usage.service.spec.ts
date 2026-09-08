import type { Repository } from 'typeorm';

import { LlmPromptVersion, LlmTask } from './enums/llm-task.enum';
import type { LlmUsageEntity } from './entities/llm-usage.entity';
import { LlmUsageService } from './llm-usage.service';

describe('LlmUsageService', () => {
  it('persists traceability metadata and never requires prompt content', async () => {
    const create = jest.fn((value: Partial<LlmUsageEntity>): Partial<LlmUsageEntity> => value);
    const save = jest.fn().mockResolvedValue(undefined);
    const service = new LlmUsageService({ create, save } as unknown as Repository<LlmUsageEntity>);

    await service.record({
      organizationId: 'de6c61b0-5734-4579-96e3-641698e97a36',
      task: LlmTask.SpecRequirementExtraction,
      promptVersion: LlmPromptVersion.SpecRequirementExtractionV1,
      provider: 'OPENROUTER',
      model: 'nvidia/nemotron-3.5-lightning',
      inputTokens: 8,
      outputTokens: 4,
      totalTokens: 12,
      latencyMs: 72,
      success: true,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ datasourceId: null, specificationVersionId: null }),
    );
    const [[saved]] = save.mock.calls as unknown as [[Record<string, unknown>]];
    expect(saved).not.toHaveProperty('messages');
    expect(saved).not.toHaveProperty('prompt');
  });
});
