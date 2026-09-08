import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { DatasourceSpecAnalysisService } from '../datasource-spec-analysis.service';
import {
  DATASOURCE_SPEC_ANALYSIS_QUEUE_NAME,
  DatasourceSpecAnalysisQueueJobName,
  type DatasourceSpecAnalysisQueuePayload,
} from './datasource-spec-analysis-queue.types';
import { DatasourceSpecAnalysisQueueService } from './datasource-spec-analysis-queue.service';

@Injectable()
export class DatasourceSpecAnalysisWorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private worker:
    | Worker<DatasourceSpecAnalysisQueuePayload, void, DatasourceSpecAnalysisQueueJobName>
    | undefined;

  constructor(
    private readonly queue: DatasourceSpecAnalysisQueueService,
    private readonly analyses: DatasourceSpecAnalysisService,
    @InjectPinoLogger(DatasourceSpecAnalysisWorkerService.name) private readonly logger: PinoLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const connection = await this.queue.getConnection();
    this.worker = new Worker<
      DatasourceSpecAnalysisQueuePayload,
      void,
      DatasourceSpecAnalysisQueueJobName
    >(
      DATASOURCE_SPEC_ANALYSIS_QUEUE_NAME,
      (job) => this.process(job),
      // ponytail: one worker bounds long-running LLM work; split workers only when provider capacity grows.
      { concurrency: 1, connection },
    );
    this.worker.on('error', (error: Error) => {
      this.logger.error({ errorType: error.name }, 'Datasource specification analysis worker error');
    });
    const recovered = await this.analyses.requeueStalledAnalyses();
    if (recovered > 0) {
      this.logger.warn(
        { recoveredAnalysisCount: recovered },
        'Requeued stalled datasource specification analyses',
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }

  private async process(
    job: Job<DatasourceSpecAnalysisQueuePayload, void, DatasourceSpecAnalysisQueueJobName>,
  ): Promise<void> {
    const startedAt = Date.now();
    this.logger.info({ analysisId: job.data.analysisId }, 'Datasource specification analysis job started');
    try {
      await this.analyses.processQueued(job.data.organizationId, job.data.analysisId);
      this.logger.info(
        { analysisId: job.data.analysisId, durationMs: Date.now() - startedAt },
        'Datasource specification analysis job completed',
      );
    } catch (error) {
      this.logger.error(
        {
          analysisId: job.data.analysisId,
          durationMs: Date.now() - startedAt,
          errorType: error instanceof Error ? error.name : 'UnknownError',
        },
        'Datasource specification analysis job failed',
      );
      throw error;
    }
  }
}
