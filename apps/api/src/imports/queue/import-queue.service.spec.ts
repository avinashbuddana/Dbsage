import { ServiceUnavailableException } from '@nestjs/common';
import { Queue, createNodeRedisClient } from 'bullmq';

import type { AppConfigService } from '../../config/app-config.service';
import type { RedisService } from '../../redis/redis.service';
import { ImportQueueJobName } from './import-queue.types';
import { ImportQueueService } from './import-queue.service';

jest.mock('bullmq', () => ({ Queue: jest.fn(), createNodeRedisClient: jest.fn() }));

const queue = {
  add: jest.fn(),
  close: jest.fn(),
  getJob: jest.fn(),
  getJobCounts: jest.fn(),
};
const QueueConstructor = Queue as unknown as jest.Mock<unknown, unknown[]>;
const createNodeRedisClientMock = createNodeRedisClient as unknown as jest.Mock;

function setup(maxActiveJobs = 2) {
  const redis = { connect: jest.fn(), getClient: jest.fn().mockReturnValue({}) };
  const service = new ImportQueueService(
    redis as unknown as RedisService,
    {
      csvImport: { maxActiveJobs, retentionHours: 24 },
    } as unknown as AppConfigService,
  );
  return { redis, service };
}

describe('ImportQueueService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    QueueConstructor.mockReturnValue(queue);
    createNodeRedisClientMock.mockReturnValue({});
    queue.getJobCounts.mockResolvedValue({ active: 0, delayed: 0, prioritized: 0, waiting: 0 });
  });

  it('creates one queue from the shared Redis client and enqueues identifier-only jobs', async () => {
    const { redis, service } = setup();

    await service.onApplicationBootstrap();
    const jobId = await service.enqueue('import-id', 'organization-id');

    expect(redis.connect).toHaveBeenCalledTimes(1);
    expect(QueueConstructor).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      ImportQueueJobName.Process,
      { importId: 'import-id', organizationId: 'organization-id' },
      {
        jobId,
        removeOnComplete: { age: 86_400, count: 2 },
        removeOnFail: { age: 86_400, count: 2 },
      },
    );
  });

  it('rejects queue flooding before adding another job', async () => {
    const { service } = setup(2);
    queue.getJobCounts.mockResolvedValue({ active: 1, delayed: 0, prioritized: 0, waiting: 1 });

    await expect(service.enqueue('import-id', 'organization-id')).rejects.toThrow(ServiceUnavailableException);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('removes a queued job when cancelled and closes the queue on shutdown', async () => {
    const { service } = setup();
    const job = { remove: jest.fn() };
    queue.getJob.mockResolvedValue(job);

    await service.cancel('job-id');
    await service.onApplicationShutdown();

    expect(queue.getJob).toHaveBeenCalledWith('job-id');
    expect(job.remove).toHaveBeenCalledTimes(1);
    expect(queue.close).toHaveBeenCalledTimes(1);
  });
});
