import { BadRequestException } from '@nestjs/common';
import { Readable } from 'node:stream';

import type { AppConfigService } from '../../config/app-config.service';
import { DataImportEntity } from '../entities/data-import.entity';
import type { PostgresCopyService } from '../postgres/postgres-copy.service';
import type { PostgresTableMetadataService } from '../postgres/postgres-table-metadata.service';
import type { ImportFileStorage } from '../storage/import-file-storage.interface';
import type { CsvHeaderValidator } from '../validators/csv-header.validator';
import { CsvImportProcessor } from './csv-import.processor';

function importEntity(overrides: Partial<DataImportEntity> = {}): DataImportEntity {
  return Object.assign(new DataImportEntity(), {
    columnMapping: {},
    delimiter: ',',
    fileSizeBytes: '9',
    hasHeader: true,
    mimeType: 'text/csv',
    originalFileName: 'records.csv',
    storedFileReference: '00000000-0000-4000-8000-000000000000.csv',
    targetSchema: 'public',
    targetTable: 'customer_records',
    ...overrides,
  });
}

describe('CsvImportProcessor', () => {
  function setup() {
    const storage = {
      exists: jest.fn().mockResolvedValue(true),
      openReadStream: jest.fn(() => Readable.from(['name\nAda\n'])),
    };
    const headers = { readHeaders: jest.fn().mockResolvedValue(['name']) };
    const metadata = {
      createTable: jest.fn().mockResolvedValue(undefined),
      getTable: jest.fn().mockResolvedValue({
        columns: [
          {
            dataType: 'text',
            hasDefault: false,
            isGenerated: false,
            isIdentity: false,
            isNullable: false,
            name: 'name',
          },
        ],
        schema: 'public',
        table: 'customer_records',
      }),
      tableExists: jest.fn().mockResolvedValue(true),
    };
    const mapping = {
      validate: jest.fn().mockReturnValue({
        columnMapping: { name: 'name' },
        targetColumns: ['name'],
      }),
    };
    const identifiers = {
      quote: jest.fn((identifier: string) => `"${identifier}"`),
      validateNewIdentifier: jest.fn((identifier: string) => identifier),
    };
    const copy = { copy: jest.fn().mockResolvedValue({ processedBytes: 9, rowCount: 1 }) };
    const processor = new CsvImportProcessor(
      storage as unknown as ImportFileStorage,
      headers as unknown as CsvHeaderValidator,
      metadata as unknown as PostgresTableMetadataService,
      mapping,
      identifiers,
      copy as unknown as PostgresCopyService,
      {
        csvImport: {
          allowedDelimiters: [','],
          maxFileSizeBytes: 10,
        },
      } as unknown as AppConfigService,
    );
    return { copy, headers, metadata, processor, storage };
  }

  it('revalidates persisted metadata and streams directly into a safe COPY command', async () => {
    const { copy, headers, metadata, processor, storage } = setup();
    const entity = importEntity();

    const prepared = await processor.prepare(entity);
    const result = await processor.process(entity, prepared);

    expect(storage.exists).toHaveBeenCalledWith(entity.storedFileReference);
    expect(headers.readHeaders).toHaveBeenCalledWith(expect.any(Readable), ',');
    expect(metadata.getTable).toHaveBeenCalledWith('public', 'customer_records');
    expect(copy.copy).toHaveBeenCalledWith(
      expect.objectContaining({
        command:
          'COPY "public"."customer_records" ("name") FROM STDIN WITH (FORMAT csv, HEADER true, DELIMITER \',\')',
      }),
    );
    expect(result).toEqual({ processedBytes: 9, rowCount: 1 });
  });

  it('rejects a MIME or delimiter outside the controlled policy before COPY', async () => {
    const { copy, processor } = setup();

    await expect(processor.prepare(importEntity({ delimiter: ';' }))).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      processor.prepare(importEntity({ mimeType: 'application/octet-stream' })),
    ).rejects.toThrow(BadRequestException);
    expect(copy.copy).not.toHaveBeenCalled();
  });

  it.each([
    [{ hasHeader: false }, 'header row'],
    [{ originalFileName: 'records.txt' }, '.csv extension'],
    [{ fileSizeBytes: '11' }, 'maximum size'],
  ])('rejects persisted invalid input %o before opening a CSV stream', async (overrides, message) => {
    const { processor, storage } = setup();

    await expect(processor.prepare(importEntity(overrides))).rejects.toThrow(message);
    expect(storage.openReadStream).not.toHaveBeenCalled();
  });

  it('rejects an expired stored file before COPY', async () => {
    const { processor, storage } = setup();
    storage.exists.mockResolvedValue(false);

    await expect(processor.prepare(importEntity())).rejects.toThrow('no longer available');
  });

  it('creates the target table from the CSV header, defaulting columns to text, when createTable is requested and it is missing', async () => {
    const { metadata, processor } = setup();
    metadata.tableExists.mockResolvedValue(false);
    const entity = importEntity({ columnMapping: { name: 'full_name' } });

    await processor.prepare(entity, true);

    expect(metadata.tableExists).toHaveBeenCalledWith('public', 'customer_records');
    expect(metadata.createTable).toHaveBeenCalledWith('public', 'customer_records', [{ name: 'full_name', type: 'text' }]);
    expect(metadata.getTable).toHaveBeenCalledWith('public', 'customer_records');
  });

  it('uses the requested column type instead of the text default when one is provided', async () => {
    const { metadata, processor } = setup();
    metadata.tableExists.mockResolvedValue(false);
    const entity = importEntity({ columnMapping: { name: 'created_at' } });

    await processor.prepare(entity, true, { created_at: 'timestamp' });

    expect(metadata.createTable).toHaveBeenCalledWith('public', 'customer_records', [
      { name: 'created_at', type: 'timestamp' },
    ]);
  });

  it('does not attempt to recreate a table that already exists', async () => {
    const { metadata, processor } = setup();
    metadata.tableExists.mockResolvedValue(true);

    await processor.prepare(importEntity(), true);

    expect(metadata.createTable).not.toHaveBeenCalled();
  });

  it('does not check for an existing table unless createTable is requested', async () => {
    const { metadata, processor } = setup();

    await processor.prepare(importEntity());

    expect(metadata.tableExists).not.toHaveBeenCalled();
    expect(metadata.createTable).not.toHaveBeenCalled();
  });
});
