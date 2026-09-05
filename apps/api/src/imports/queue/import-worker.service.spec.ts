import type { PinoLogger } from 'nestjs-pino';
import { Worker } from 'bullmq';

import type { AppConfigService } from '../../config/app-config.service';
import type { ImportsService } from '../imports.service';
import type { ImportProgress } from '../imports.types';
import { IMPORT_QUEUE_NAME } from './import-queue.types';
import type { ImportQueueService } from './import-queue.service';
import { ImportWorkerService } from './import-worker.service';

jest.mock('bullmq', () => ({ Worker: jest.fn() }));

const worker = { close: jest.fn(), on: jest.fn() };
const workerConstructor = Worker as unknown as jest.Mock<unknown, unknown[]>;

describe('ImportWorkerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    workerConstructor.mockReturnValue(worker);
  });

  it('uses bounded concurrency and passes only the import identifiers into application processing', async () => {
    const queue = { getConnection: jest.fn().mockResolvedValue({}) };
    let progressCallback: ((progress: ImportProgress) => Promise<void>) | undefined;
    const processQueued = jest.fn(
      (_organizationId: string, _importId: string, onProgress: (progress: ImportProgress) => Promise<void>) => {
        progressCallback = onProgress;
        return Promise.resolve();
      },
    );
    const imports = { processQueued };
    const logger = { error: jest.fn() };
    let errorHandler: ((error: Error) => void) | undefined;
    worker.on.mockImplementation((event: string, handler: (error: Error) => void) => {
      if (event === 'error') errorHandler = handler;
      return worker;
    });
    const service = new ImportWorkerService(
      queue as unknown as ImportQueueService,
      imports as unknown as ImportsService,
      { csvImport: { workerConcurrency: 2 } } as unknown as AppConfigService,
      logger as unknown as PinoLogger,
    );

    await service.onApplicationBootstrap();

    expect(workerConstructor).toHaveBeenCalledWith(
      IMPORT_QUEUE_NAME,
      expect.any(Function),
      expect.objectContaining({ concurrency: 2 }),
    );
    const workerCall = workerConstructor.mock.calls[0];
    if (!workerCall) throw new Error('Worker was not created');
    const processor = workerCall[1] as (job: {
      data: { importId: string; organizationId: string };
      updateProgress: jest.Mock;
    }) => Promise<void>;
    const job = {
      data: {
        importId: '00000000-0000-4000-8000-000000000001',
        organizationId: '00000000-0000-4000-8000-000000000002',
      },
      updateProgress: jest.fn(),
    };
    await processor(job);

    expect(imports.processQueued).toHaveBeenCalledWith(
      job.data.organizationId,
      job.data.importId,
      expect.any(Function),
    );
    if (!progressCallback) throw new Error('Progress callback was not provided');
    await progressCallback({ fileSizeBytes: 9, percent: 50, processedBytes: 4 });
    expect(job.updateProgress).toHaveBeenCalledWith({ fileSizeBytes: 9, percent: 50, processedBytes: 4 });
    if (!errorHandler) throw new Error('Worker error handler was not registered');
    errorHandler(new Error('Redis connection lost'));
    expect(logger.error).toHaveBeenCalledWith({ errorType: 'Error' }, 'CSV import worker error');
    await service.onApplicationShutdown();
    expect(worker.close).toHaveBeenCalledTimes(1);
  });
});
