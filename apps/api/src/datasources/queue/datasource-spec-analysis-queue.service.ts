import {
  Injectable,
  ServiceUnavailableException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Queue, createNodeRedisClient } from 'bullmq';
import { randomUUID } from 'node:crypto';

import { RedisService } from '../../redis/redis.service';
import {
  DATASOURCE_SPEC_ANALYSIS_QUEUE_NAME,
  DatasourceSpecAnalysisQueueJobName,
  type DatasourceSpecAnalysisQueuePayload,
} from './datasource-spec-analysis-queue.types';

const MAX_PENDING_ANALYSES = 25;
const JOB_RETENTION_SECONDS = 86_400;

@Injectable()
export class DatasourceSpecAnalysisQueueService implements OnApplicationBootstrap, OnApplicationShutdown {
  private connection: ReturnType<typeof createNodeRedisClient> | undefined;
  private queue:
    | Queue<DatasourceSpecAnalysisQueuePayload, void, DatasourceSpecAnalysisQueueJobName>
    | undefined;
  private startPromise: Promise<void> | undefined;

  constructor(private readonly redis: RedisService) {}

  onApplicationBootstrap(): Promise<void> {
    return this.start();
  }

  async enqueue(analysisId: string, organizationId: string): Promise<void> {
    await this.start();
    const queue = this.requireQueue();
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'prioritized');
    const pending =
      (counts.waiting ?? 0) +
      (counts.active ?? 0) +
      (counts.delayed ?? 0) +
      (counts.prioritized ?? 0);
    if (pending >= MAX_PENDING_ANALYSES) {
      throw new ServiceUnavailableException('Specification analysis queue is at capacity');
    }

    await queue.add(
      DatasourceSpecAnalysisQueueJobName.Analyze,
      { analysisId, organizationId },
      {
        jobId: randomUUID(),
        removeOnComplete: { age: JOB_RETENTION_SECONDS, count: MAX_PENDING_ANALYSES },
        removeOnFail: { age: JOB_RETENTION_SECONDS, count: MAX_PENDING_ANALYSES },
      },
    );
  }

  async getConnection(): Promise<ReturnType<typeof createNodeRedisClient>> {
    await this.start();
    if (!this.connection) {
      throw new ServiceUnavailableException('Specification analysis queue is unavailable');
    }
    return this.connection;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
  }

  private async start(): Promise<void> {
    if (this.queue) return;
    this.startPromise ??= this.initialize();
    await this.startPromise;
  }

  private async initialize(): Promise<void> {
    await this.redis.connect();
    this.connection = createNodeRedisClient(this.redis.getClient());
    this.queue = new Queue<
      DatasourceSpecAnalysisQueuePayload,
      void,
      DatasourceSpecAnalysisQueueJobName
    >(DATASOURCE_SPEC_ANALYSIS_QUEUE_NAME, { connection: this.connection });
  }

  private requireQueue(): Queue<
    DatasourceSpecAnalysisQueuePayload,
    void,
    DatasourceSpecAnalysisQueueJobName
  > {
    if (!this.queue) throw new ServiceUnavailableException('Specification analysis queue is unavailable');
    return this.queue;
  }
}
