import type { AppConfigService } from '../config/app-config.service';
import { LlmPromptVersion, LlmTask } from './enums/llm-task.enum';
import { LlmModelConfigService } from './llm-model-config.service';

describe('LlmModelConfigService', () => {
  const service = new LlmModelConfigService({
    llm: {
      openRouterModel: 'nvidia/nemotron-3.5-lightning',
      fallbackModels: [],
      maxOutputTokens: 2_048,
      temperature: 0.1,
    },
  } as unknown as AppConfigService);

  it.each([
    [LlmTask.SpecSectionClassification, LlmPromptVersion.SpecSectionClassificationV1],
    [LlmTask.SpecRequirementExtraction, LlmPromptVersion.SpecRequirementExtractionV1],
    [LlmTask.SpecExpectedModelBuilding, LlmPromptVersion.SpecExpectedModelBuildingV1],
    [LlmTask.SpecEntityMatching, LlmPromptVersion.SpecEntityMatchingV1],
    [LlmTask.SpecSemanticMatching, LlmPromptVersion.SpecSemanticMatchingV1],
    [LlmTask.SpecCompatibilityExplanation, LlmPromptVersion.SpecCompatibilityExplanationV1],
    [LlmTask.VerifiedKnowledgeGeneration, LlmPromptVersion.VerifiedKnowledgeGenerationV1],
    [LlmTask.DomainSummaryGeneration, LlmPromptVersion.DomainSummaryGenerationV1],
    [LlmTask.DatabaseContextAnalysis, LlmPromptVersion.DatabaseContextAnalysisV1],
    [LlmTask.DatabaseIntentClassification, LlmPromptVersion.DatabaseIntentClassificationV1],
    [LlmTask.NaturalLanguageQueryPlanning, LlmPromptVersion.NaturalLanguageQueryPlanningV1],
  ])('resolves %s without leaking a model name into the caller', (task, promptVersion) => {
    const configuration = service.getTaskConfiguration(task);

    expect(configuration).toEqual({
      fallbackModels: [],
      maxOutputTokens: 2_048,
      model: 'nvidia/nemotron-3.5-lightning',
      promptVersion,
      temperature: 0.1,
    });
    expect(service.getModelForTask(task)).toBe('nvidia/nemotron-3.5-lightning');
  });
});
