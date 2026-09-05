import { BadRequestException, PayloadTooLargeException, type CallHandler, type ExecutionContext } from '@nestjs/common';
import multer from 'multer';
import { lastValueFrom, of } from 'rxjs';

import type { AppConfigService } from '../config/app-config.service';
import { CsvImportUploadInterceptor } from './csv-import-upload.interceptor';

interface InterceptorInternals {
  upload: (request: object, response: object, callback: (error?: unknown) => void) => void;
  uploadError(error: unknown): Error;
}

function createInterceptor(): CsvImportUploadInterceptor {
  return new CsvImportUploadInterceptor(
    { delete: jest.fn(), exists: jest.fn(), openReadStream: jest.fn(), store: jest.fn() },
    { csvImport: { maxFileSizeBytes: 10 } } as unknown as AppConfigService,
  );
}

describe('CsvImportUploadInterceptor', () => {
  it('maps multer size limits and unknown upload failures to sanitized HTTP errors', () => {
    const internals = createInterceptor() as unknown as InterceptorInternals;

    expect(internals.uploadError(new multer.MulterError('LIMIT_FILE_SIZE'))).toBeInstanceOf(PayloadTooLargeException);
    expect(internals.uploadError(new Error('storage path leaked'))).toEqual(
      expect.objectContaining({ message: 'CSV upload is invalid' }),
    );
    const validationError = new BadRequestException('CSV file metadata is invalid');
    expect(internals.uploadError(validationError)).toBe(validationError);
  });

  it('does not invoke the controller when multipart parsing fails', async () => {
    const internals = createInterceptor() as unknown as InterceptorInternals;
    internals.upload = (_request, _response, callback) => {
      callback(new Error('invalid multipart'));
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
    } as unknown as ExecutionContext;
    const handle = jest.fn(() => of('controller-called'));
    const next = { handle } as unknown as CallHandler;

    await expect(lastValueFrom((internals as unknown as CsvImportUploadInterceptor).intercept(context, next))).rejects.toThrow(
      BadRequestException,
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('continues to the controller only after multipart parsing succeeds', async () => {
    const internals = createInterceptor() as unknown as InterceptorInternals;
    internals.upload = (_request, _response, callback) => {
      callback();
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
    } as unknown as ExecutionContext;
    const handle = jest.fn(() => of('controller-called'));
    const next = { handle } as unknown as CallHandler;

    await expect(lastValueFrom((internals as unknown as CsvImportUploadInterceptor).intercept(context, next))).resolves.toBe(
      'controller-called',
    );
    expect(handle).toHaveBeenCalledTimes(1);
  });
});
