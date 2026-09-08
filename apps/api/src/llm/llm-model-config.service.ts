import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';
import { LlmPromptVersion, LlmTask } from './enums/llm-task.enum';

export interface LlmTaskConfiguration {
  model: string;
  fallbackModels: readonly string[];
  temperature: number;
  maxOutputTokens: number;
  promptVersion: LlmPromptVersion;
}

const PROMPT_VERSION_BY_TASK: Readonly<Record<LlmTask, LlmPromptVersion>> = {
  [LlmTask.SpecSectionClassification]: LlmPromptVersion.SpecSectionClassificationV1,
  [LlmTask.SpecRequirementExtraction]: LlmPromptVersion.SpecRequirementExtractionV1,
  [LlmTask.SpecExpectedModelBuilding]: LlmPromptVersion.SpecExpectedModelBuildingV1,
  [LlmTask.SpecEntityMatching]: LlmPromptVersion.SpecEntityMatchingV1,
  [LlmTask.SpecSemanticMatching]: LlmPromptVersion.SpecSemanticMatchingV1,
  [LlmTask.SpecCompatibilityExplanation]: LlmPromptVersion.SpecCompatibilityExplanationV1,
  [LlmTask.VerifiedKnowledgeGeneration]: LlmPromptVersion.VerifiedKnowledgeGenerationV1,
  [LlmTask.DomainSummaryGeneration]: LlmPromptVersion.DomainSummaryGenerationV1,
  [LlmTask.DatabaseContextAnalysis]: LlmPromptVersion.DatabaseContextAnalysisV1,
  [LlmTask.DatabaseIntentClassification]: LlmPromptVersion.DatabaseIntentClassificationV1,
  [LlmTask.NaturalLanguageQueryPlanning]: LlmPromptVersion.NaturalLanguageQueryPlanningV1,
};

@Injectable()
export class LlmModelConfigService {
  constructor(private readonly config: AppConfigService) {}

  getModelForTask(task: LlmTask): string {
    return this.getTaskConfiguration(task).model;
  }

  getTaskConfiguration(task: LlmTask): LlmTaskConfiguration {
    return {
      model: this.config.llm.openRouterModel,
      fallbackModels: this.config.llm.fallbackModels,
      temperature: this.config.llm.temperature,
      maxOutputTokens: this.config.llm.maxOutputTokens,
      promptVersion: PROMPT_VERSION_BY_TASK[task],
    };
  }
}
