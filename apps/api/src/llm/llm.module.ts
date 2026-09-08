import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LlmDataPolicyService } from './llm-data-policy.service';
import { FallbackLlmProvider } from './fallback-llm.provider';
import { LlmModelConfigService } from './llm-model-config.service';
import { LLM_PROVIDER } from './llm-provider.interface';
import { LlmService } from './llm.service';
import { LlmUsageEntity } from './entities/llm-usage.entity';
import { LlmUsageService } from './llm-usage.service';
import { OpenRouterLlmProvider } from './openrouter-llm.provider';
import { OllamaLlmProvider } from './ollama-llm.provider';

@Module({
  imports: [TypeOrmModule.forFeature([LlmUsageEntity])],
  providers: [
    LlmDataPolicyService,
    LlmModelConfigService,
    LlmUsageService,
    OpenRouterLlmProvider,
    OllamaLlmProvider,
    FallbackLlmProvider,
    { provide: LLM_PROVIDER, useExisting: FallbackLlmProvider },
    LlmService,
  ],
  exports: [LLM_PROVIDER, LlmDataPolicyService, LlmService],
})
export class LlmModule {}
