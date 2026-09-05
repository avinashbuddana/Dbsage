import {
  Injectable,
  ServiceUnavailableException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Queue, createNodeRedisClient } from 'bullmq';
import { randomUUID } from 'node:crypto';

import { AppConfigService } from '../../config/app-config.service';
import { RedisService } from '../../redis/redis.service';
import { IMPORT_QUEUE_NAME, ImportQueueJobName, type ImportQueuePayload } from './import-queue.types';

@Injectable()
export class ImportQueueService implements OnApplicationBootstrap, OnApplicationShutdown {
  private connection: ReturnType<typeof createNodeRedisClient> | undefined;
  private queue: Queue<ImportQueuePayload, void, ImportQueueJobName> | undefined;
  private startPromise: Promise<void> | undefined;

  constructor(
    private readonly redis: RedisService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): Promise<void> {
    return this.start();
  }

  async enqueue(importId: string, organizationId: string): Promise<string> {
    await this.start();
    const queue = this.requireQueue();
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'prioritized');
    const pending =
      (counts.waiting ?? 0) +
      (counts.active ?? 0) +
      (counts.delayed ?? 0) +
      (counts.prioritized ?? 0);
    if (pending >= this.config.csvImport.maxActiveJobs) {
      throw new ServiceUnavailableException('CSV import queue is at capacity');
    }

    const jobId = randomUUID();
    await queue.add(
      ImportQueueJobName.Process,
      { importId, organizationId },
      {
        jobId,
        removeOnComplete: {
          age: this.config.csvImport.retentionHours * 3_600,
          count: this.config.csvImport.maxActiveJobs,
        },
        removeOnFail: {
          age: this.config.csvImport.retentionHours * 3_600,
          count: this.config.csvImport.maxActiveJobs,
        },
      },
    );
    return jobId;
  }

  async cancel(jobId: string | null): Promise<void> {
    if (!jobId) return;
    await this.start();
    const job = await this.requireQueue().getJob(jobId);
    if (job) await job.remove();
  }

  async getConnection(): Promise<ReturnType<typeof createNodeRedisClient>> {
    await this.start();
    if (!this.connection) throw new ServiceUnavailableException('CSV import queue is unavailable');
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
    this.queue = new Queue<ImportQueuePayload, void, ImportQueueJobName>(IMPORT_QUEUE_NAME, {
      connection: this.connection,
    });
  }

  private requireQueue(): Queue<ImportQueuePayload, void, ImportQueueJobName> {
    if (!this.queue) throw new ServiceUnavailableException('CSV import queue is unavailable');
    return this.queue;
  }
}
