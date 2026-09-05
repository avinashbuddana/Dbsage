import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';
import { ImportsService } from '../imports.service';
import type { ImportProgress } from '../imports.types';
import { IMPORT_QUEUE_NAME, ImportQueueJobName, type ImportQueuePayload } from './import-queue.types';
import { ImportQueueService } from './import-queue.service';

@Injectable()
export class ImportWorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private worker: Worker<ImportQueuePayload, void, ImportQueueJobName> | undefined;

  constructor(
    private readonly queue: ImportQueueService,
    private readonly imports: ImportsService,
    private readonly config: AppConfigService,
    @InjectPinoLogger(ImportWorkerService.name) private readonly logger: PinoLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const connection = await this.queue.getConnection();
    this.worker = new Worker<ImportQueuePayload, void, ImportQueueJobName>(
      IMPORT_QUEUE_NAME,
      (job) => this.process(job),
      { concurrency: this.config.csvImport.workerConcurrency, connection },
    );
    this.worker.on('error', (error: Error) => {
      this.logger.error({ errorType: error.name }, 'CSV import worker error');
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }

  private process(job: Job<ImportQueuePayload, void, ImportQueueJobName>): Promise<void> {
    return this.imports.processQueued(job.data.organizationId, job.data.importId, (progress) =>
      this.updateProgress(job, progress),
    );
  }

  private updateProgress(
    job: Job<ImportQueuePayload, void, ImportQueueJobName>,
    progress: ImportProgress,
  ): Promise<void> {
    return job.updateProgress(progress);
  }
}
