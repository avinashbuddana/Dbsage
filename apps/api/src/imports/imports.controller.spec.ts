import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Readable } from 'node:stream';

import { OrganizationContextService } from '../auth/organization-context.service';
import { AppConfigService } from '../config/app-config.service';
import { DataImportProcessingMode } from './enums/data-import-processing-mode.enum';
import { DataImportStatus } from './enums/data-import-status.enum';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { CsvImportUploadInterceptor } from './csv-import-upload.interceptor';
import { PostgresTableMetadataService } from './postgres/postgres-table-metadata.service';
import { IMPORT_FILE_STORAGE, type ImportFileStorage } from './storage/import-file-storage.interface';

describe('ImportsController', () => {
  let app: INestApplication;
  const organizationId = '00000000-0000-4000-8000-000000000001';
  const imports = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    getClientConfiguration: jest.fn(),
    retry: jest.fn(),
    cancel: jest.fn(),
    remove: jest.fn(),
    summary: jest.fn(),
  };
  const metadata = { listSchemas: jest.fn(), listTables: jest.fn(), getTable: jest.fn() };
  const storage = {
    delete: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn(),
    openReadStream: jest.fn(),
    store: jest.fn(async (source: Readable) => {
      let sizeBytes = 0;
      for await (const chunk of source) {
        if (!Buffer.isBuffer(chunk)) throw new Error('Expected a binary multipart stream');
        sizeBytes += chunk.length;
      }
      return { fileHash: 'deadbeef', fileReference: '00000000-0000-4000-8000-000000000002.csv', sizeBytes };
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ImportsController],
      providers: [
        { provide: ImportsService, useValue: imports },
        { provide: OrganizationContextService, useValue: { getOrganizationId: () => organizationId } },
        { provide: PostgresTableMetadataService, useValue: metadata },
        { provide: IMPORT_FILE_STORAGE, useValue: storage },
        { provide: AppConfigService, useValue: { csvImport: { maxFileSizeBytes: 1_024 } } },
        {
          provide: CsvImportUploadInterceptor,
          useFactory: (fileStorage: ImportFileStorage, config: AppConfigService) =>
            new CsvImportUploadInterceptor(fileStorage, config),
          inject: [IMPORT_FILE_STORAGE, AppConfigService],
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('streams a multipart upload to storage and returns 202 for a queued import', async () => {
    imports.create.mockResolvedValue({
      createdAt: new Date(),
      delimiter: ',',
      errorCode: null,
      errorMessage: null,
      failedRows: '0',
      fileSizeBytes: '9',
      hasHeader: true,
      id: '00000000-0000-4000-8000-000000000003',
      mimeType: 'text/csv',
      originalFileName: 'records.csv',
      processedBytes: '0',
      processedRows: '0',
      processingMode: DataImportProcessingMode.Queued,
      progressPercent: 0,
      startedAt: null,
      status: DataImportStatus.Queued,
      successfulRows: '0',
      targetSchema: 'public',
      targetTable: 'customer_records',
      totalRows: null,
      updatedAt: new Date(),
      completedAt: null,
    });

    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    await request(httpServer)
      .post('/imports/csv')
      .field('targetSchema', 'public')
      .field('targetTable', 'customer_records')
      .field('columnMapping', '{"name":"name"}')
      .attach('file', Buffer.from('name\nAda\n'), { contentType: 'text/csv', filename: 'records.csv' })
      .expect(202);

    expect(storage.store).toHaveBeenCalledTimes(1);
    expect(imports.create).toHaveBeenCalledWith(
      organizationId,
      {
        arrayDelimiter: undefined,
        columnMapping: { name: 'name' },
        columnTypes: {},
        createTable: false,
        dateFormat: undefined,
        delimiter: ',',
        importMode: 'STRICT',
        targetSchema: 'public',
        targetTable: 'customer_records',
      },
      {
        fileHash: 'deadbeef',
        fileReference: '00000000-0000-4000-8000-000000000002.csv',
        mimeType: 'text/csv',
        originalFileName: 'records.csv',
        sizeBytes: 9,
      },
    );
  });

  it('forwards createTable=true through to the service when requested', async () => {
    imports.create.mockResolvedValue({
      completedAt: null,
      createdAt: new Date(),
      delimiter: ',',
      errorCode: null,
      errorMessage: null,
      failedRows: '0',
      fileSizeBytes: '9',
      hasHeader: true,
      id: '00000000-0000-4000-8000-000000000004',
      mimeType: 'text/csv',
      originalFileName: 'records.csv',
      processedBytes: '0',
      processedRows: '0',
      processingMode: DataImportProcessingMode.Synchronous,
      progressPercent: 0,
      startedAt: null,
      status: DataImportStatus.Completed,
      successfulRows: '1',
      targetSchema: 'public',
      targetTable: 'new_customers',
      totalRows: '1',
      updatedAt: new Date(),
    });

    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    await request(httpServer)
      .post('/imports/csv')
      .field('targetSchema', 'public')
      .field('targetTable', 'new_customers')
      .field('columnMapping', '{"name":"name"}')
      .field('createTable', 'true')
      .attach('file', Buffer.from('name\nAda\n'), { contentType: 'text/csv', filename: 'records.csv' })
      .expect(201);

    expect(imports.create).toHaveBeenCalledWith(
      organizationId,
      expect.objectContaining({ createTable: true }),
      expect.anything(),
    );
  });

  it('forwards status and search query params to the service', async () => {
    imports.findAll.mockResolvedValue({ items: [], total: 0 });

    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    await request(httpServer).get('/imports').query({ limit: 10, page: 1, search: 'customers', status: 'FAILED' }).expect(200);

    expect(imports.findAll).toHaveBeenCalledWith(organizationId, 1, 10, 'FAILED', 'customers');
  });

  it('returns the client configuration', async () => {
    imports.getClientConfiguration.mockReturnValue({
      allowedDelimiters: [',', ';', '|'],
      maxColumns: 200,
      maxFileSizeBytes: 1_073_741_824,
      maxHeaderLength: 256,
      queueThresholdBytes: 5_242_880,
    });

    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(httpServer).get('/imports/config').expect(200);

    expect((response.body as { queueThresholdBytes: number }).queueThresholdBytes).toBe(5_242_880);
  });

  it('returns the organization import summary', async () => {
    imports.summary.mockResolvedValue({
      completedImports: '6',
      failedImports: '2',
      processingImports: '2',
      totalImports: '10',
      totalRowsImported: '48210',
    });

    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(httpServer).get('/imports/summary').expect(200);

    expect(imports.summary).toHaveBeenCalledWith(organizationId);
    expect((response.body as { totalImports: string }).totalImports).toBe('10');
  });

  it('lists allowed target schemas', async () => {
    metadata.listSchemas.mockResolvedValue(['public', 'analytics']);

    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(httpServer).get('/imports/targets/schemas').expect(200);

    expect(response.body).toEqual([{ name: 'public' }, { name: 'analytics' }]);
  });

  it('lists tables for a target schema', async () => {
    metadata.listTables.mockResolvedValue([{ name: 'customers', columnCount: 12 }]);

    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(httpServer).get('/imports/targets/schemas/public/tables').expect(200);

    expect(metadata.listTables).toHaveBeenCalledWith('public');
    expect(response.body).toEqual([{ name: 'customers', columnCount: 12 }]);
  });

  it('returns column details for a target table', async () => {
    metadata.getTable.mockResolvedValue({
      schema: 'public',
      table: 'customers',
      columns: [{ name: 'id', dataType: 'uuid', isNullable: false, hasDefault: true, isGenerated: false, isIdentity: false }],
    });

    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(httpServer).get('/imports/targets/schemas/public/tables/customers').expect(200);

    expect(metadata.getTable).toHaveBeenCalledWith('public', 'customers');
    expect((response.body as { table: string }).table).toBe('customers');
  });

  it('still routes a UUID path to findOne after adding the targets/config/summary routes', async () => {
    imports.findOne.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000009', status: 'COMPLETED' });

    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    await request(httpServer).get('/imports/00000000-0000-4000-8000-000000000009').expect(200);

    expect(imports.findOne).toHaveBeenCalledWith(organizationId, '00000000-0000-4000-8000-000000000009');
  });
});
