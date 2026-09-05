import type { Repository } from 'typeorm';

import { DataImportEntity } from '../entities/data-import.entity';
import { DataImportProcessingMode } from '../enums/data-import-processing-mode.enum';
import { DataImportStatus } from '../enums/data-import-status.enum';
import { DuplicateImportException } from './duplicate-import.error';
import { DuplicateImportService } from './duplicate-import.service';

const organizationId = '00000000-0000-4000-8000-000000000001';

function entity(overrides: Partial<DataImportEntity> = {}): DataImportEntity {
  return Object.assign(new DataImportEntity(), {
    columnMapping: {},
    completedAt: new Date('2026-09-05T10:30:00Z'),
    createdAt: new Date('2026-09-05T10:00:00Z'),
    createdByUserId: null,
    delimiter: ',',
    errorCode: null,
    errorMessage: null,
    failedRows: '20',
    fileDeletedAt: null,
    fileHash: 'abc123',
    fileSizeBytes: '4',
    hasHeader: true,
    id: '00000000-0000-4000-8000-000000000002',
    mimeType: 'text/csv',
    organizationId,
    originalFileName: 'customers.csv',
    processedBytes: '0',
    processedRows: '15000',
    processingMode: DataImportProcessingMode.Queued,
    progressPercent: 100,
    queueJobId: null,
    startedAt: new Date('2026-09-05T10:29:00Z'),
    status: DataImportStatus.Completed,
    storedFileReference: '00000000-0000-4000-8000-000000000003.csv',
    successfulRows: '14980',
    targetSchema: 'public',
    targetTable: 'customers',
    totalRows: '15000',
    updatedAt: new Date('2026-09-05T10:30:00Z'),
    ...overrides,
  });
}

describe('DuplicateImportService', () => {
  function setup() {
    const repository = { findOne: jest.fn() };
    const service = new DuplicateImportService(repository as unknown as Repository<DataImportEntity>);
    return { repository, service };
  }

  it('allows the import when no matching active or completed import exists', async () => {
    const { repository, service } = setup();
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.assertNotDuplicate(organizationId, 'public', 'customers', 'abc123'),
    ).resolves.toBeUndefined();
  });

  it('reports a completed duplicate with the prior import summary', async () => {
    const { repository, service } = setup();
    repository.findOne.mockResolvedValue(entity({ status: DataImportStatus.Completed }));

    await expect(service.assertNotDuplicate(organizationId, 'public', 'customers', 'abc123')).rejects.toMatchObject({
      code: 'DUPLICATE_IMPORT',
      existingImportId: '00000000-0000-4000-8000-000000000002',
      fileHash: 'abc123',
      previousImport: {
        failedRows: '20',
        fileName: 'customers.csv',
        successfulRows: '14980',
        totalRows: '15000',
      },
    });
  });

  it('reports an in-progress duplicate without a previous-import summary', async () => {
    const { repository, service } = setup();
    repository.findOne.mockResolvedValue(entity({ status: DataImportStatus.Processing }));

    const error = await service
      .assertNotDuplicate(organizationId, 'public', 'customers', 'abc123')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DuplicateImportException);
    expect((error as DuplicateImportException).code).toBe('IMPORT_ALREADY_IN_PROGRESS');
    expect((error as DuplicateImportException).previousImport).toBeUndefined();
  });

  it('scopes the lookup to organization, schema, table, hash, and active statuses', async () => {
    const { repository, service } = setup();
    repository.findOne.mockResolvedValue(null);

    await service.assertNotDuplicate(organizationId, 'public', 'customers', 'abc123');

    const [options] = repository.findOne.mock.calls[0] as [
      { where: { fileHash: string; organizationId: string; targetSchema: string; targetTable: string } },
    ];
    expect(options.where.fileHash).toBe('abc123');
    expect(options.where.organizationId).toBe(organizationId);
    expect(options.where.targetSchema).toBe('public');
    expect(options.where.targetTable).toBe('customers');
  });
});
