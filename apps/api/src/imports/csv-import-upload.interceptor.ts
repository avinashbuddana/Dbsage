import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import multer, { type StorageEngine } from 'multer';
import { Observable } from 'rxjs';

import { AppConfigService } from '../config/app-config.service';
import { IMPORT_FILE_STORAGE, type ImportFileStorage } from './storage/import-file-storage.interface';

@Injectable()
export class CsvImportUploadInterceptor implements NestInterceptor {
  private readonly upload: ReturnType<ReturnType<typeof multer>['single']>;

  constructor(
    @Inject(IMPORT_FILE_STORAGE) storage: ImportFileStorage,
    config: AppConfigService,
  ) {
    const engine: StorageEngine = {
      _handleFile: (_request, file, callback) => {
        void storage
          .store(file.stream, { mimeType: file.mimetype, originalFileName: file.originalname })
          .then(
            (stored) => {
              callback(null, { fileHash: stored.fileHash, filename: stored.fileReference, size: stored.sizeBytes });
            },
            (error: unknown) => {
              callback(error instanceof Error ? error : new Error('CSV upload failed'));
            },
          );
      },
      _removeFile: (_request, file, callback) => {
        if (!file.filename) {
          callback(null);
          return;
        }
        void storage.delete(file.filename).then(
          () => {
            callback(null);
          },
          (error: unknown) => {
            callback(error instanceof Error ? error : new Error('CSV upload cleanup failed'));
          },
        );
      },
    };
    this.upload = multer({
      fileFilter: (_request, file, callback) => {
        if (file.originalname.length > 255 || file.mimetype.length > 128) {
          callback(new BadRequestException('CSV file metadata is invalid'));
          return;
        }
        callback(null, true);
      },
      limits: {
        fieldNameSize: 128,
        fieldSize: 16_384,
        fields: 10,
        fileSize: config.csvImport.maxFileSizeBytes,
        files: 1,
        parts: 12,
      },
      storage: engine,
    }).single('file');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    return new Observable((subscriber) => {
      this.upload(request, response, (error: unknown) => {
        if (error) {
          subscriber.error(this.uploadError(error));
          return;
        }
        next.handle().subscribe(subscriber);
      });
    });
  }

  private uploadError(error: unknown): Error {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return new PayloadTooLargeException('CSV file exceeds the maximum size');
    }
    if (error instanceof BadRequestException) return error;
    return new BadRequestException('CSV upload is invalid');
  }
}
