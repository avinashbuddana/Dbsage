import { Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { VerifiedKnowledgeBuilderService } from '../verified-knowledge-builder.service';
import {
  DATASOURCE_KNOWLEDGE_BUILD_QUEUE_NAME,
  DatasourceKnowledgeBuildQueueJobName,
  type DatasourceKnowledgeBuildQueuePayload,
} from './datasource-knowledge-build-queue.types';
import { DatasourceKnowledgeBuildQueueService } from './datasource-knowledge-build-queue.service';

@Injectable()
export class DatasourceKnowledgeBuildWorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private worker: Worker<DatasourceKnowledgeBuildQueuePayload, void, DatasourceKnowledgeBuildQueueJobName> | undefined;

  constructor(
    private readonly queue: DatasourceKnowledgeBuildQueueService,
    private readonly builder: VerifiedKnowledgeBuilderService,
    @InjectPinoLogger(DatasourceKnowledgeBuildWorkerService.name) private readonly logger: PinoLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.worker = new Worker(
      DATASOURCE_KNOWLEDGE_BUILD_QUEUE_NAME,
      (job) => this.process(job),
      // ponytail: one worker keeps local embeddings and LLM calls bounded; raise only with measured provider capacity.
      { concurrency: 1, connection: await this.queue.getConnection() },
    );
    this.worker.on('error', (error: Error) => {
      this.logger.error({ errorType: error.name }, 'Datasource knowledge build worker error');
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }

  private async process(job: Job<DatasourceKnowledgeBuildQueuePayload, void, DatasourceKnowledgeBuildQueueJobName>): Promise<void> {
    const startedAt = Date.now();
    this.logger.info(
      { datasourceId: job.data.datasourceId, knowledgeVersionId: job.data.knowledgeVersionId },
      'Datasource verified knowledge build started',
    );
    try {
      await this.builder.build(job.data.organizationId, job.data.datasourceId, job.data.knowledgeVersionId);
      this.logger.info(
        {
          datasourceId: job.data.datasourceId,
          durationMs: Date.now() - startedAt,
          knowledgeVersionId: job.data.knowledgeVersionId,
        },
        'Datasource verified knowledge build completed',
      );
    } catch (error) {
      this.logger.error(
        {
          datasourceId: job.data.datasourceId,
          durationMs: Date.now() - startedAt,
          errorType: error instanceof Error ? error.name : 'UnknownError',
          knowledgeVersionId: job.data.knowledgeVersionId,
        },
        'Datasource verified knowledge build failed',
      );
      throw error;
    }
  }
}
