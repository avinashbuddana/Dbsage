import {
  Injectable,
  ServiceUnavailableException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Queue, createNodeRedisClient } from 'bullmq';
import { randomUUID } from 'node:crypto';

import { RedisService } from '../../../redis/redis.service';
import {
  DATASOURCE_KNOWLEDGE_BUILD_QUEUE_NAME,
  DatasourceKnowledgeBuildQueueJobName,
  type DatasourceKnowledgeBuildQueuePayload,
} from './datasource-knowledge-build-queue.types';

const MAX_PENDING_BUILDS = 25;

@Injectable()
export class DatasourceKnowledgeBuildQueueService implements OnApplicationBootstrap, OnApplicationShutdown {
  private connection: ReturnType<typeof createNodeRedisClient> | undefined;
  private queue: Queue<DatasourceKnowledgeBuildQueuePayload, void, DatasourceKnowledgeBuildQueueJobName> | undefined;
  private startPromise: Promise<void> | undefined;

  constructor(private readonly redis: RedisService) {}

  onApplicationBootstrap(): Promise<void> {
    return this.start();
  }

  async enqueue(payload: DatasourceKnowledgeBuildQueuePayload): Promise<void> {
    await this.start();
    const queue = this.requireQueue();
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'prioritized');
    const pending = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0) + (counts.prioritized ?? 0);
    if (pending >= MAX_PENDING_BUILDS) {
      throw new ServiceUnavailableException('Knowledge build queue is at capacity');
    }
    await queue.add(DatasourceKnowledgeBuildQueueJobName.Build, payload, {
      jobId: randomUUID(),
      removeOnComplete: { age: 86_400, count: MAX_PENDING_BUILDS },
      removeOnFail: { age: 86_400, count: MAX_PENDING_BUILDS },
    });
  }

  async getConnection(): Promise<ReturnType<typeof createNodeRedisClient>> {
    await this.start();
    if (!this.connection) throw new ServiceUnavailableException('Knowledge build queue is unavailable');
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
    this.queue = new Queue(DATASOURCE_KNOWLEDGE_BUILD_QUEUE_NAME, { connection: this.connection });
  }

  private requireQueue(): Queue<DatasourceKnowledgeBuildQueuePayload, void, DatasourceKnowledgeBuildQueueJobName> {
    if (!this.queue) throw new ServiceUnavailableException('Knowledge build queue is unavailable');
    return this.queue;
  }
}
