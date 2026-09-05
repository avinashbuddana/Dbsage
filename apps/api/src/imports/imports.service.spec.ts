import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Repository } from 'typeorm';

import type { AuditService } from '../audit/audit.service';
import type { AppConfigService } from '../config/app-config.service';
import type { DataImportErrorEntity } from './entities/data-import-error.entity';
import { DataImportEntity } from './entities/data-import.entity';
import { DataImportMode } from './enums/data-import-mode.enum';
import { DataImportProcessingMode } from './enums/data-import-processing-mode.enum';
import { DataImportStatus } from './enums/data-import-status.enum';
import type { DuplicateImportService } from './hashing/duplicate-import.service';
import type { CsvImportProcessor } from './processors/csv-import.processor';
import type { ImportQueueService } from './queue/import-queue.service';
import type { ImportFileStorage } from './storage/import-file-storage.interface';
import { RowValidationException } from './validation/row-validation.error';
import { ImportsService } from './imports.service';

const organizationId = '00000000-0000-4000-8000-000000000001';
const importId = '00000000-0000-4000-8000-000000000002';

function entity(overrides: Partial<DataImportEntity> = {}): DataImportEntity {
  return Object.assign(new DataImportEntity(), {
    columnMapping: {},
    completedAt: null,
    createdAt: new Date('2026-09-05T00:00:00Z'),
    arrayDelimiter: null,
    createdByUserId: null,
    dateFormat: null,
    delimiter: ',',
    errorCode: null,
    errorMessage: null,
    failedRows: '0',
    fileDeletedAt: null,
    fileHash: 'abc123',
    fileSizeBytes: '4',
    hasHeader: true,
    id: importId,
    importMode: DataImportMode.Strict,
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
  const errorRepository = {
    create: jest.fn((value: Partial<DataImportErrorEntity>) => value as DataImportErrorEntity),
    save: jest.fn().mockResolvedValue([]),
  };
  const processor = {
    prepare: jest.fn().mockResolvedValue({
      columnMapping: { name: 'name' },
      copyCommand: 'COPY "public"."customer_records" ("name") FROM STDIN',
    }),
    process: jest.fn().mockResolvedValue({ processedBytes: 9, rowCount: 1, rowErrors: [] }),
  };
  const storage = { delete: jest.fn(), exists: jest.fn().mockResolvedValue(true) };
  const queue = { cancel: jest.fn(), enqueue: jest.fn().mockResolvedValue('queue-job-id') };
  const audit = { record: jest.fn() };
  const duplicateImport = { assertNotDuplicate: jest.fn() };
  const service = new ImportsService(
    repository as unknown as Repository<DataImportEntity>,
    errorRepository as unknown as Repository<DataImportErrorEntity>,
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
    duplicateImport as unknown as DuplicateImportService,
  );
  return { audit, duplicateImport, errorRepository, processor, queue, repository, service, storage };
}

describe('ImportsService', () => {
  const input = {
    columnMapping: {},
    columnTypes: {},
    createTable: false,
    delimiter: ',',
    importMode: DataImportMode.Strict,
    targetSchema: 'public',
    targetTable: 'customer_records',
  };
  const file = {
    fileHash: 'abc123',
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

  it('marks an import partially completed and persists row errors when flexible mode skips invalid rows', async () => {
    const { errorRepository, processor, service } = setup();
    processor.process.mockResolvedValue({
      processedBytes: 9,
      rowCount: 8,
      rowErrors: [
        { csvColumn: 'age', databaseColumn: 'age', error: "Cannot convert 'twenty' to integer", row: 3, targetType: 'integer', value: 'twenty' },
      ],
    });

    const result = await service.create(organizationId, { ...input, importMode: DataImportMode.Flexible }, file);

    expect(result.status).toBe(DataImportStatus.PartiallyCompleted);
    expect(result.successfulRows).toBe('8');
    expect(result.failedRows).toBe('1');
    expect(result.totalRows).toBe('9');
    expect(errorRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        csvColumn: 'age',
        databaseColumn: 'age',
        errorMessage: "Cannot convert 'twenty' to integer",
        importId: result.id,
        rawValue: 'twenty',
        rowNumber: 3,
        targetType: 'integer',
      }),
    ]);
  });

  it('passes the createTable flag through to the processor when creating an import', async () => {
    const { processor, service } = setup();

    await service.create(organizationId, { ...input, columnTypes: { created_at: 'timestamp' }, createTable: true }, file);

    expect(processor.prepare).toHaveBeenCalledWith(expect.anything(), true, { created_at: 'timestamp' });
  });

  it('checks for a duplicate before creating any import row', async () => {
    const { duplicateImport, repository, service } = setup();
    duplicateImport.assertNotDuplicate.mockRejectedValue(new Error('duplicate'));

    await expect(service.create(organizationId, input, file)).rejects.toThrow('duplicate');

    expect(duplicateImport.assertNotDuplicate).toHaveBeenCalledWith(organizationId, 'public', 'customer_records', 'abc123');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('re-checks for a duplicate when a concurrent insert wins the unique-index race', async () => {
    const { duplicateImport, repository, service } = setup();
    const uniqueViolation: { code: string } = { code: '23505' };
    repository.save.mockRejectedValueOnce(uniqueViolation);
    duplicateImport.assertNotDuplicate
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('duplicate after race'));

    await expect(service.create(organizationId, input, file)).rejects.toThrow('duplicate after race');

    expect(duplicateImport.assertNotDuplicate).toHaveBeenCalledTimes(2);
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
        return { processedBytes: 9, rowCount: 1, rowErrors: [] };
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

  it('fails a strict-mode import with a specific, actionable message on the first invalid row', async () => {
    const { processor, repository, service } = setup();
    repository.findOne.mockResolvedValue(entity({ status: DataImportStatus.Queued }));
    processor.prepare.mockRejectedValue(
      new RowValidationException([
        { csvColumn: 'age', databaseColumn: 'age', error: "Cannot convert 'twenty' to integer", row: 24, targetType: 'integer', value: 'twenty' },
      ]),
    );

    await expect(service.processQueued(organizationId, importId)).rejects.toThrow('CSV import failed');

    expect(repository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        errorCode: 'IMPORT_VALIDATION_FAILED',
        errorMessage: "Cannot convert 'twenty' to integer",
        status: DataImportStatus.Failed,
      }),
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

  it('allows retrying a cancelled import that never inserted any rows', async () => {
    const { queue, repository, service } = setup();
    repository.findOne.mockResolvedValue(entity({ status: DataImportStatus.Cancelled }));

    const result = await service.retry(organizationId, importId);

    expect(result.status).toBe(DataImportStatus.Queued);
    expect(queue.enqueue).toHaveBeenCalledWith(importId, organizationId);
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

  it('filters findAll by status when provided', async () => {
    const { repository, service } = setup();
    repository.findAndCount = jest.fn().mockResolvedValue([[], 0]);

    await service.findAll(organizationId, 1, 20, DataImportStatus.Failed);

    expect(repository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId, status: DataImportStatus.Failed } }),
    );
  });

  it('filters findAll by a case-insensitive filename search when provided', async () => {
    const { repository, service } = setup();
    repository.findAndCount = jest.fn().mockResolvedValue([[], 0]);

    await service.findAll(organizationId, 1, 20, undefined, 'customers');

    const [options] = repository.findAndCount.mock.calls[0] as [
      { where: { organizationId: string; originalFileName: { value: string } } },
    ];
    expect(options.where.organizationId).toBe(organizationId);
    expect(options.where.originalFileName.value).toContain('customers');
  });

  it('omits status/search from the where clause when not provided', async () => {
    const { repository, service } = setup();
    repository.findAndCount = jest.fn().mockResolvedValue([[], 0]);

    await service.findAll(organizationId, 1, 20);

    expect(repository.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId } }));
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
