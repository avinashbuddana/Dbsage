import { BadRequestException } from '@nestjs/common';
import { Readable } from 'node:stream';

import type { AppConfigService } from '../config/app-config.service';
import type { ImportFileStorage } from './storage/import-file-storage.interface';

let mockOptions: {
  fileFilter: (request: object, file: { mimetype: string; originalname: string }, callback: (error: Error | null, accept?: boolean) => void) => void;
  limits: { fileSize: number };
  storage: {
    _handleFile: (
      request: object,
      file: { mimetype: string; originalname: string; stream: Readable },
      callback: (error: Error | null, info?: { filename: string; size: number }) => void,
    ) => void;
    _removeFile: (request: object, file: { filename?: string }, callback: (error: Error | null) => void) => void;
  };
};
const mockUpload = jest.fn();
const mockMulter = jest.fn((options: typeof mockOptions) => {
  mockOptions = options;
  return { single: jest.fn(() => mockUpload) };
});

jest.mock('multer', () => ({ __esModule: true, default: mockMulter }));

import { CsvImportUploadInterceptor } from './csv-import-upload.interceptor';

function createInterceptor(storage: ImportFileStorage): void {
  new CsvImportUploadInterceptor(
    storage,
    { csvImport: { maxFileSizeBytes: 10 } } as unknown as AppConfigService,
  );
}

describe('CsvImportUploadInterceptor storage engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('streams uploads into storage and returns only generated storage metadata', async () => {
    const store = jest.fn().mockResolvedValue({ fileReference: 'generated.csv', sizeBytes: 9 });
    const storage = { store } as unknown as ImportFileStorage;
    createInterceptor(storage);

    const result = await new Promise<{ filename: string; size: number }>((resolve, reject) => {
      mockOptions.storage._handleFile(
        {},
        { mimetype: 'text/csv', originalname: 'records.csv', stream: Readable.from(['name\nAda\n']) },
        (error, info) => {
          if (error) reject(error);
          else resolve(info as { filename: string; size: number });
        },
      );
    });

    expect(store).toHaveBeenCalledWith(expect.any(Readable), {
      mimeType: 'text/csv',
      originalFileName: 'records.csv',
    });
    expect(result).toEqual({ filename: 'generated.csv', size: 9 });
    expect(mockOptions.limits.fileSize).toBe(10);
  });

  it('sanitizes storage errors and removes only generated filenames', async () => {
    const storage = {
      delete: jest.fn().mockRejectedValue('unsafe storage detail'),
      store: jest.fn().mockRejectedValue('unsafe storage detail'),
    } as unknown as ImportFileStorage;
    createInterceptor(storage);

    await expect(
      new Promise<void>((resolve, reject) => {
        mockOptions.storage._handleFile(
          {},
          { mimetype: 'text/csv', originalname: 'records.csv', stream: Readable.from(['name\n']) },
          (error) => {
            if (error) reject(error);
            else resolve();
          },
        );
      }),
    ).rejects.toThrow('CSV upload failed');
    await expect(
      new Promise<void>((resolve, reject) => {
        mockOptions.storage._removeFile({}, { filename: 'generated.csv' }, (error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
    ).rejects.toThrow('CSV upload cleanup failed');
    await expect(
      new Promise<void>((resolve, reject) => {
        mockOptions.storage._removeFile({}, {}, (error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects oversized multipart metadata before it reaches file storage', () => {
    createInterceptor({ store: jest.fn() } as unknown as ImportFileStorage);
    const callback = jest.fn();

    mockOptions.fileFilter({}, { mimetype: 'text/csv', originalname: 'x'.repeat(256) }, callback);

    expect(callback).toHaveBeenCalledWith(expect.any(BadRequestException));
  });
});
