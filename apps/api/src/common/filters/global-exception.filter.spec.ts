import { BadRequestException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';
import type { PinoLogger } from 'nestjs-pino';

import { DatasourceConnectionError } from '../../database-connections/datasource-connection.error';
import { DuplicateImportException } from '../../imports/hashing/duplicate-import.error';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  function setup() {
    const loggerError = jest.fn();
    const logger = { error: loggerError } as unknown as PinoLogger;
    const filter = new GlobalExceptionFilter(logger);
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const response = { status } as unknown as Response;
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ id: 'req-1' }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    return { filter, host, json, loggerError, status };
  }

  it('sanitizes a generic HttpException into the standard envelope', () => {
    const { filter, host, json, status } = setup();

    filter.catch(new BadRequestException('leaky internal detail'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      requestId: 'req-1',
      statusCode: 400,
    });
  });

  it('preserves DatasourceConnectionError code and message', () => {
    const { filter, host, json, status } = setup();

    filter.catch(new DatasourceConnectionError('DATASOURCE_DISABLED', 'Datasource is disabled'), host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DATASOURCE_DISABLED', message: 'Datasource is disabled' }),
    );
  });

  it('returns a 409 with the duplicate details for a completed duplicate', () => {
    const { filter, host, json, status } = setup();
    const exception = new DuplicateImportException(
      'DUPLICATE_IMPORT',
      'This file has already been imported into public.customers.',
      'import-1',
      'abc123',
      {
        failedRows: '20',
        fileName: 'customers.csv',
        importedAt: new Date('2026-09-05T10:30:00Z'),
        successfulRows: '14980',
        totalRows: '15000',
      },
    );

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      code: 'DUPLICATE_IMPORT',
      existingImportId: 'import-1',
      fileHash: 'abc123',
      message: 'This file has already been imported into public.customers.',
      previousImport: {
        failedRows: '20',
        fileName: 'customers.csv',
        importedAt: new Date('2026-09-05T10:30:00Z'),
        successfulRows: '14980',
        totalRows: '15000',
      },
      requestId: 'req-1',
      statusCode: 409,
    });
  });

  it('returns a 409 without a previousImport field for an in-progress duplicate', () => {
    const { filter, host, json, status } = setup();

    filter.catch(
      new DuplicateImportException('IMPORT_ALREADY_IN_PROGRESS', 'This file is already being imported.', 'import-2', 'abc123'),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    const [body] = json.mock.calls[0] as [Record<string, unknown>];
    expect(body).not.toHaveProperty('previousImport');
    expect(body.code).toBe('IMPORT_ALREADY_IN_PROGRESS');
  });

  it('logs and sanitizes a truly unhandled error as a 500', () => {
    const { filter, host, json, loggerError, status } = setup();

    filter.catch(new Error('unexpected'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' }),
    );
    expect(loggerError).toHaveBeenCalled();
  });
});
