import { BadRequestException } from '@nestjs/common';
import { text as streamToText } from 'node:stream/consumers';
import { Readable } from 'node:stream';

import type { AppConfigService } from '../../config/app-config.service';
import { DataImportEntity } from '../entities/data-import.entity';
import { DataImportMode } from '../enums/data-import-mode.enum';
import type { PostgresCopyService } from '../postgres/postgres-copy.service';
import type { PostgresTableMetadataService } from '../postgres/postgres-table-metadata.service';
import type { ImportFileStorage } from '../storage/import-file-storage.interface';
import { DatatypeTransformerService } from '../transformation/datatype-transformer.service';
import { ImportValidatorService } from '../validation/import-validator.service';
import type { CsvHeaderValidator } from '../validators/csv-header.validator';
import { CsvImportProcessor } from './csv-import.processor';

function importEntity(overrides: Partial<DataImportEntity> = {}): DataImportEntity {
  return Object.assign(new DataImportEntity(), {
    arrayDelimiter: null,
    columnMapping: {},
    dateFormat: null,
    delimiter: ',',
    fileSizeBytes: '9',
    hasHeader: true,
    importMode: DataImportMode.Strict,
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
            characterMaximumLength: null,
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
    const copiedBodies: string[] = [];
    const copy = {
      copy: jest.fn(async (input: { source: Readable }) => {
        const body = await streamToText(input.source);
        copiedBodies.push(body);
        return { processedBytes: Buffer.byteLength(body), rowCount: body.split('\n').filter(Boolean).length };
      }),
    };
    const validator = new ImportValidatorService(new DatatypeTransformerService());
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
      validator,
    );
    return { copiedBodies, copy, headers, mapping, metadata, processor, storage };
  }

  it('revalidates persisted metadata and streams a transformed, validated CSV into a safe COPY command', async () => {
    const { copy, headers, metadata, processor, storage } = setup();
    const entity = importEntity();

    const prepared = await processor.prepare(entity);
    const result = await processor.process(entity, prepared);

    expect(storage.exists).toHaveBeenCalledWith(entity.storedFileReference);
    expect(headers.readHeaders).toHaveBeenCalledWith(expect.any(Readable), ',');
    expect(metadata.getTable).toHaveBeenCalledWith('public', 'customer_records');
    expect(copy.copy).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'COPY "public"."customer_records" ("name") FROM STDIN WITH (FORMAT csv)' }),
    );
    expect(result.rowCount).toBe(1);
    expect(result.rowErrors).toEqual([]);
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

  describe('datatype-aware transformation', () => {
    function setupTypedTable() {
      const context = setup();
      context.headers.readHeaders.mockResolvedValue(['name', 'age']);
      context.metadata.getTable.mockResolvedValue({
        columns: [
          {
            characterMaximumLength: null,
            dataType: 'text',
            hasDefault: false,
            isGenerated: false,
            isIdentity: false,
            isNullable: false,
            name: 'name',
          },
          {
            characterMaximumLength: null,
            dataType: 'integer',
            hasDefault: false,
            isGenerated: false,
            isIdentity: false,
            isNullable: false,
            name: 'age',
          },
        ],
        schema: 'public',
        table: 'customer_records',
      });
      context.mapping.validate.mockReturnValue({
        columnMapping: { age: 'age', name: 'name' },
        targetColumns: ['name', 'age'],
      });
      return context;
    }

    it('converts CSV values to the destination datatype before they reach COPY', async () => {
      const { copiedBodies, copy, processor, storage } = setupTypedTable();
      storage.openReadStream.mockReturnValue(Readable.from(['name,age\nAda,25.0\n']));
      const entity = importEntity({ columnMapping: { age: 'age', name: 'name' } });

      const prepared = await processor.prepare(entity);
      await processor.process(entity, prepared);

      expect(copy.copy).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'COPY "public"."customer_records" ("name", "age") FROM STDIN WITH (FORMAT csv)' }),
      );
      // "25.0" is transformed to the normalized integer "25" before it ever reaches COPY.
      expect(copiedBodies).toEqual(['Ada,25\n']);
    });

    it('rejects the whole import on the first invalid row in strict mode, before any row commits', async () => {
      const { copy, processor, storage } = setupTypedTable();
      storage.openReadStream.mockReturnValue(Readable.from(['name,age\nAda,twenty\nGrace,30\n']));
      const entity = importEntity({ columnMapping: { age: 'age', name: 'name' }, importMode: DataImportMode.Strict });

      const prepared = await processor.prepare(entity);

      await expect(processor.process(entity, prepared)).rejects.toThrow("Cannot convert 'twenty' to integer");
      expect(copy.copy).toHaveBeenCalled();
    });

    it('skips only the invalid rows and reports them in flexible mode, keeping the valid rows', async () => {
      const { processor, storage } = setupTypedTable();
      storage.openReadStream.mockReturnValue(Readable.from(['name,age\nAda,twenty\nGrace,30\n']));
      const entity = importEntity({ columnMapping: { age: 'age', name: 'name' }, importMode: DataImportMode.Flexible });

      const prepared = await processor.prepare(entity);
      const result = await processor.process(entity, prepared);

      expect(result.rowCount).toBe(1);
      expect(result.rowErrors).toEqual([
        {
          csvColumn: 'age',
          databaseColumn: 'age',
          error: "Cannot convert 'twenty' to integer",
          row: 2,
          targetType: 'integer',
          value: 'twenty',
        },
      ]);
    });

    it('streams many rows without buffering the whole file in memory', async () => {
      const { processor, storage } = setupTypedTable();
      const rows = Array.from({ length: 500 }, (_unused, index) => `Person${String(index)},${String(20 + (index % 50))}`);
      storage.openReadStream.mockReturnValue(Readable.from([`name,age\n${rows.join('\n')}\n`]));
      const entity = importEntity({ columnMapping: { age: 'age', name: 'name' } });

      const prepared = await processor.prepare(entity);
      const result = await processor.process(entity, prepared);

      expect(result.rowCount).toBe(500);
      expect(result.rowErrors).toEqual([]);
    });
  });
});
