import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import type { LlmTask } from './enums/llm-task.enum';
import type { LlmPromptVersion } from './enums/llm-task.enum';
import { LlmUsageEntity } from './entities/llm-usage.entity';
import type { LlmProviderName } from './llm-provider.interface';

export interface LlmUsageRecord {
  organizationId: string;
  datasourceId?: string;
  specificationVersionId?: string;
  knowledgeVersionId?: string;
  task: LlmTask;
  promptVersion: LlmPromptVersion;
  provider: LlmProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  success: boolean;
}

@Injectable()
export class LlmUsageService {
  constructor(
    @InjectRepository(LlmUsageEntity)
    private readonly repository: Repository<LlmUsageEntity>,
  ) {}

  async record(record: LlmUsageRecord): Promise<void> {
    await this.repository.save(
      this.repository.create({
        ...record,
        datasourceId: record.datasourceId ?? null,
        knowledgeVersionId: record.knowledgeVersionId ?? null,
        specificationVersionId: record.specificationVersionId ?? null,
      }),
    );
  }
}
