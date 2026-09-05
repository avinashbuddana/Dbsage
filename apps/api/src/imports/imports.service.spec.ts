import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Repository } from 'typeorm';

import type { AuditService } from '../audit/audit.service';
import type { AppConfigService } from '../config/app-config.service';
import { DataImportEntity } from './entities/data-import.entity';
import { DataImportProcessingMode } from './enums/data-import-processing-mode.enum';
import { DataImportStatus } from './enums/data-import-status.enum';
import type { CsvImportProcessor } from './processors/csv-import.processor';
import type { ImportQueueService } from './queue/import-queue.service';
import type { ImportFileStorage } from './storage/import-file-storage.interface';
import { ImportsService } from './imports.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const importId = '00000000-0000-4000-8000-000000000002';

function entity(overrides: Partial<DataImportEntity> = {}): DataImportEntity {
  return Object.assign(new DataImportEntity(), {
    columnMapping: {},
    completedAt: null,
    createdAt: new Date('2026-09-05T00:00:00Z'),
    createdByUserId: null,
    delimiter: ',',
    errorCode: null,
    errorMessage: null,
    failedRows: '0',
    fileDeletedAt: null,
    fileSizeBytes: '4',
    hasHeader: true,
    id: importId,
    mimeType: 'text/csv',
    organizationId,
    originalFileName: 'records.csv',
    processedBytes: '0',
    processedRows: '0',
    processingMode: DataImportProcessingMode.Synchronous,
    progressPercent: 0,
    queueJobId: null,
    startedAt: null,
    status: DataImportStatus.Uploaded,
    storedFileReference: '00000000-0000-4000-8000-000000000003.csv',
    successfulRows: '0',
    targetSchema: 'public',
    targetTable: 'customer_records',
    totalRows: null,
    updatedAt: new Date('2026-09-05T00:00:00Z'),
    ...overrides,
  });
}

function setup() {
  const repository = {
    count: jest.fn(),
    create: jest.fn((value: Partial<DataImportEntity>) => entity(value)),
    createQueryBuilder: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((value: DataImportEntity) => Promise.resolve(value)),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const processor = {
    prepare: jest.fn().mockResolvedValue({
      columnMapping: { name: 'name' },
      copyCommand: 'COPY "public"."customer_records" ("name") FROM STDIN',
    }),
    process: jest.fn().mockResolvedValue({ processedBytes: 9, rowCount: 1 }),
  };
  const storage = { delete: jest.fn(), exists: jest.fn().mockResolvedValue(true) };
  const queue = { cancel: jest.fn(), enqueue: jest.fn().mockResolvedValue('queue-job-id') };
  const audit = { record: jest.fn() };
  const service = new ImportsService(
    repository as unknown as Repository<DataImportEntity>,
    processor as unknown as CsvImportProcessor,
    storage as unknown as ImportFileStorage,
    queue as unknown as ImportQueueService,
    audit as unknown as AuditService,
    {
      csvImport: {
        allowedDelimiters: [',', ';', '|'],
        maxColumns: 200,
        maxFileSizeBytes: 1_073_741_824,
        maxHeaderLength: 256,
        queueThresholdBytes: 5,
      },
    } as unknown as AppConfigService,
  );
  return { audit, processor, queue, repository, service, storage };
}

describe('ImportsService', () => {
  const input = { columnMapping: {}, delimiter: ',', targetSchema: 'public', targetTable: 'customer_records' };
  const file = {
    fileReference: '00000000-0000-4000-8000-000000000003.csv',
    mimeType: 'text/csv',
    originalFileName: 'records.csv',
    sizeBytes: 4,
  };

  it('processes a small validated import synchronously through COPY', async () => {
    const { processor, queue, service } = setup();

    const result = await service.create(organizationId, input, file);

    expect(result.status).toBe(DataImportStatus.Completed);
    expect(result.processingMode).toBe(DataImportProcessingMode.Synchronous);
    expect(processor.process).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('queues a large import with only its IDs and never processes it in the request', async () => {
    const { processor, queue, service } = setup();

    const result = await service.create(organizationId, input, { ...file, sizeBytes: 6 });

    expect(result.status).toBe(DataImportStatus.Queued);
    expect(result.processingMode).toBe(DataImportProcessingMode.Queued);
    expect(queue.enqueue).toHaveBeenCalledWith(importId, organizationId);
    expect(processor.process).not.toHaveBeenCalled();
  });

  it('does not overwrite a worker claim while attaching a queued job ID', async () => {
    const { repository, service } = setup();
    repository.update.mockResolvedValue({ affected: 0 });
    repository.findOne.mockResolvedValue(entity({ status: DataImportStatus.Processing }));

    const result = await service.create(organizationId, input, { ...file, sizeBytes: 6 });

    expect(result.status).toBe(DataImportStatus.Processing);
    expect(repository.save).not.toHaveBeenCalledWith(expect.objectContaining({ queueJobId: 'queue-job-id' }));
  });

  it('does not process an import when another worker already claimed it', async () => {
    const { processor, repository, service } = setup();
    repository.update.mockResolvedValue({ affected: 0 });

    await service.processQueued(organizationId, importId);

    expect(processor.process).not.toHaveBeenCalled();
  });

  it('processes a claimed queued import and persists progress through COPY', async () => {
    const { audit, processor, repository, service } = setup();
    repository.findOne.mockResolvedValue(entity({ status: DataImportStatus.Queued }));
    processor.process.mockImplementation(
      async (_import: DataImportEntity, _prepared: unknown, onProgress: (bytes: number) => Promise<void>) => {
        await onProgress(1_048_576);
        return { processedBytes: 9, rowCount: 1 };
      },
    );

    await service.processQueued(organizationId, importId);

    expect(processor.process).toHaveBeenCalledTimes(1);
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: DataImportStatus.Processing }),
      expect.objectContaining({ processedBytes: '1048576' }),
    );
    expect(audit.record).toHaveBeenCalledWith(organizationId, expect.anything(), { importId });
  });

  it('records a safe database error when a queued import fails', async () => {
    const { processor, repository, service } = setup();
    repository.findOne.mockResolvedValue(entity({ status: DataImportStatus.Queued }));
    processor.prepare.mockRejectedValue({ code: '23505' });

    await expect(service.processQueued(organizationId, importId)).rejects.toThrow('CSV import failed');

    expect(repository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        errorCode: 'IMPORT_DUPLICATE_VALUE',
        status: DataImportStatus.Failed,
      }),
    );
  });

  it.each([
    ['22P02', 'IMPORT_POSTGRES_TYPE_ERROR'],
    ['23503', 'IMPORT_FOREIGN_KEY_VIOLATION'],
    ['23502', 'IMPORT_CONSTRAINT_VIOLATION'],
    ['57014', 'IMPORT_TIMEOUT'],
  ])('maps PostgreSQL error %s to the stable import code %s', async (postgresCode, errorCode) => {
    const { processor, repository, service } = setup();
    repository.findOne.mockResolvedValue(entity({ status: DataImportStatus.Queued }));
    processor.prepare.mockRejectedValue({ code: postgresCode });

    await expect(service.processQueued(organizationId, importId)).rejects.toThrow('CSV import failed');

    expect(repository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ errorCode, status: DataImportStatus.Failed }),
    );
  });

  it('does not retry a failed import after its retained source file has been removed', async () => {
    const { queue, repository, service, storage } = setup();
    repository.findOne.mockResolvedValue(entity({ status: DataImportStatus.Failed }));
    storage.exists.mockResolvedValue(false);

    await expect(service.retry(organizationId, importId)).rejects.toThrow(NotFoundException);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('restores a failed import when its retry cannot be queued', async () => {
    const { queue, repository, service } = setup();
    repository.findOne.mockResolvedValue(entity({ status: DataImportStatus.Failed }));
    queue.enqueue.mockRejectedValue(new Error('redis connection refused'));

    await expect(service.retry(organizationId, importId)).rejects.toThrow(ServiceUnavailableException);

    expect(repository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        errorCode: 'IMPORT_COPY_FAILED',
        status: DataImportStatus.Failed,
      }),
    );
  });

  it('persists a failed state before returning queue unavailability to a create request', async () => {
    const { queue, repository, service } = setup();
    queue.enqueue.mockRejectedValue(new ServiceUnavailableException('queue at capacity'));

    await expect(service.create(organizationId, input, { ...file, sizeBytes: 6 })).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(repository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: DataImportStatus.Failed }),
    );
  });

  it('cancels only a queued import and deletes only terminal history', async () => {
    const { queue, repository, service, storage } = setup();
    const queued = entity({ queueJobId: 'queue-job-id', status: DataImportStatus.Queued });
    repository.findOne.mockResolvedValueOnce(queued).mockResolvedValueOnce(entity({ status: DataImportStatus.Completed }));

    await service.cancel(organizationId, importId);
    await service.remove(organizationId, importId);

    expect(queue.cancel).toHaveBeenCalledWith('queue-job-id');
    expect(storage.delete).toHaveBeenCalledWith(queued.storedFileReference);
    expect(repository.delete).toHaveBeenCalledWith({ id: importId, organizationId });
  });

  it('rejects retry, cancellation, and deletion when their status preconditions are not met', async () => {
    const { repository, service } = setup();
    repository.findOne
      .mockResolvedValueOnce(entity({ status: DataImportStatus.Completed }))
      .mockResolvedValueOnce(entity({ status: DataImportStatus.Processing }))
      .mockResolvedValueOnce(entity({ status: DataImportStatus.Queued }));

    await expect(service.retry(organizationId, importId)).rejects.toThrow(ConflictException);
    await expect(service.cancel(organizationId, importId)).rejects.toThrow(ConflictException);
    await expect(service.remove(organizationId, importId)).rejects.toThrow(ConflictException);
  });

  it('lists import history within the requesting organization', async () => {
    const { repository, service } = setup();
    repository.findAndCount.mockResolvedValue([[entity()], 1]);

    const result = await service.findAll(organizationId, 2, 10);

    expect(result.total).toBe(1);
    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10, where: { organizationId } }),
    );
  });

  it('maps csvImport config to the client configuration shape', () => {
    const { service } = setup();

    const config = service.getClientConfiguration();

    expect(config).toEqual({
      allowedDelimiters: [',', ';', '|'],
      maxColumns: 200,
      maxFileSizeBytes: 1_073_741_824,
      maxHeaderLength: 256,
      queueThresholdBytes: 5,
    });
  });

  it('aggregates organization-scoped import counts and completed row totals', async () => {
    const { repository, service } = setup();
    repository.count = jest
      .fn()
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2);
    const queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ sum: '48210' }),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
    };
    repository.createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);

    const summary = await service.summary(organizationId);

    expect(summary).toEqual({
      completedImports: '6',
      failedImports: '2',
      processingImports: '2',
      totalImports: '10',
      totalRowsImported: '48210',
    });
  });

  it('reports zero rows imported when no import has completed yet', async () => {
    const { repository, service } = setup();
    repository.count = jest.fn().mockResolvedValue(0);
    const queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue(undefined),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
    };
    repository.createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);

    const summary = await service.summary(organizationId);

    expect(summary.totalRowsImported).toBe('0');
  });
});
