import type { PinoLogger } from 'nestjs-pino';
import type { Repository } from 'typeorm';

import type { AppConfigService } from '../config/app-config.service';
import { DataImportEntity } from './entities/data-import.entity';
import { DataImportStatus } from './enums/data-import-status.enum';
import { ImportFileCleanupService } from './import-file-cleanup.service';
import type { ImportFileStorage } from './storage/import-file-storage.interface';

describe('ImportFileCleanupService', () => {
  it('deletes only terminal import files selected by a bounded repository query', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([
        Object.assign(new DataImportEntity(), {
          id: '00000000-0000-4000-8000-000000000001',
          storedFileReference: '00000000-0000-4000-8000-000000000002.csv',
        }),
      ]),
      update: jest.fn(),
    };
    const storage = { delete: jest.fn() };
    const cleanup = new ImportFileCleanupService(
      repository as unknown as Repository<DataImportEntity>,
      storage as unknown as ImportFileStorage,
      { csvImport: { cleanupIntervalMs: 60_000, retentionHours: 24 } } as unknown as AppConfigService,
      { error: jest.fn() } as unknown as PinoLogger,
    );

    await cleanup.cleanupExpired();

    expect(repository.find).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002.csv');
    expect(repository.update).toHaveBeenCalledTimes(1);
  });

  it('never includes in-flight statuses in the cleanup policy', () => {
    expect(ImportFileCleanupService.expirableStatuses).toEqual([
      DataImportStatus.Completed,
      DataImportStatus.Failed,
      DataImportStatus.Cancelled,
    ]);
  });

  it('uses one unref cleanup timer, clears it at shutdown, and safely logs cleanup failures', async () => {
    const repository = { find: jest.fn().mockRejectedValue(new Error('storage unavailable')), update: jest.fn() };
    const logger = { error: jest.fn() };
    const cleanup = new ImportFileCleanupService(
      repository as unknown as Repository<DataImportEntity>,
      { delete: jest.fn() } as unknown as ImportFileStorage,
      { csvImport: { cleanupIntervalMs: 60_000, retentionHours: 24 } } as unknown as AppConfigService,
      logger as unknown as PinoLogger,
    );
    const timer = { unref: jest.fn() } as unknown as NodeJS.Timeout;
    const setIntervalSpy = jest.spyOn(global, 'setInterval').mockReturnValue(timer);
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval').mockImplementation(() => undefined);

    cleanup.onApplicationBootstrap();
    await (cleanup as unknown as { runSafely(): Promise<void> }).runSafely();
    cleanup.onApplicationShutdown();

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    expect((timer as unknown as { unref: jest.Mock }).unref).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith({ errorType: 'Error' }, 'CSV import cleanup failed');
    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
