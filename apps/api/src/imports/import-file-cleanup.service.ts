import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, In, type Repository } from 'typeorm';

import { AppConfigService } from '../config/app-config.service';
import { DataImportEntity } from './entities/data-import.entity';
import { DataImportStatus } from './enums/data-import-status.enum';
import { IMPORT_FILE_STORAGE, type ImportFileStorage } from './storage/import-file-storage.interface';

@Injectable()
export class ImportFileCleanupService implements OnApplicationBootstrap, OnApplicationShutdown {
  static readonly expirableStatuses = [
    DataImportStatus.Completed,
    DataImportStatus.Failed,
    DataImportStatus.Cancelled,
  ] as const;

  private timer: NodeJS.Timeout | undefined;

  constructor(
    @InjectRepository(DataImportEntity)
    private readonly repository: Repository<DataImportEntity>,
    @Inject(IMPORT_FILE_STORAGE) private readonly storage: ImportFileStorage,
    private readonly config: AppConfigService,
    @InjectPinoLogger(ImportFileCleanupService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    void this.runSafely();
    this.timer = setInterval(() => void this.runSafely(), this.config.csvImport.cleanupIntervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async cleanupExpired(): Promise<void> {
    const cutoff = new Date(Date.now() - this.config.csvImport.retentionHours * 3_600_000);
    const expired = await this.repository.find({
      take: 100,
      where: {
        fileDeletedAt: IsNull(),
        status: In(ImportFileCleanupService.expirableStatuses),
        updatedAt: LessThan(cutoff),
      },
    });
    for (const importEntity of expired) {
      await this.storage.delete(importEntity.storedFileReference);
      await this.repository.update({ id: importEntity.id }, { fileDeletedAt: new Date() });
    }
  }

  private async runSafely(): Promise<void> {
    try {
      await this.cleanupExpired();
    } catch (error) {
      const errorType = error instanceof Error ? error.name : 'UnknownError';
      this.logger.error({ errorType }, 'CSV import cleanup failed');
    }
  }
}
