import { Injectable, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { access, mkdir, unlink } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { AppConfigService } from '../../config/app-config.service';
import { FileHashService } from '../hashing/file-hash.service';
import type { ImportFileMetadata, ImportFileStorage, StoredImportFile } from './import-file-storage.interface';

const FILE_REFERENCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.csv$/;

@Injectable()
export class LocalImportFileStorage implements ImportFileStorage, OnModuleInit {
  private readonly directory: string;

  constructor(
    config: AppConfigService,
    private readonly fileHash: FileHashService,
  ) {
    this.directory = resolve(config.csvImport.tempDir);
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.directory, { mode: 0o700, recursive: true });
  }

  async store(source: Readable, metadata: ImportFileMetadata): Promise<StoredImportFile> {
    if (metadata.originalFileName.length === 0 || metadata.mimeType.length === 0) {
      throw new Error('Import file metadata is invalid');
    }
    const fileReference = `${randomUUID()}.csv`;
    const destination = this.resolveFileReference(fileReference);
    let sizeBytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += chunk.length;
        callback(null, chunk);
      },
    });
    const hasher = this.fileHash.createHashingTransform();

    try {
      await pipeline(source, meter, hasher, createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
      return { fileHash: hasher.digest(), fileReference, sizeBytes };
    } catch (error) {
      await unlink(destination).catch(() => undefined);
      throw error;
    }
  }

  openReadStream(fileReference: string): Readable {
    return createReadStream(this.resolveFileReference(fileReference));
  }

  async delete(fileReference: string): Promise<void> {
    await unlink(this.resolveFileReference(fileReference)).catch((error: unknown) => {
      if (this.isNotFoundError(error)) return;
      throw error;
    });
  }

  async exists(fileReference: string): Promise<boolean> {
    try {
      await access(this.resolveFileReference(fileReference));
      return true;
    } catch (error) {
      if (this.isNotFoundError(error)) return false;
      throw error;
    }
  }

  private resolveFileReference(fileReference: string): string {
    if (!FILE_REFERENCE_PATTERN.test(fileReference)) {
      throw new Error('Invalid import file reference');
    }
    return resolve(this.directory, fileReference);
  }

  private isNotFoundError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
  }
}
