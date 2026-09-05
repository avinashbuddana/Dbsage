import type { Readable } from 'node:stream';

export interface ImportFileMetadata {
  originalFileName: string;
  mimeType: string;
}

export interface StoredImportFile {
  fileReference: string;
  sizeBytes: number;
  fileHash: string;
}

export interface ImportFileStorage {
  store(source: Readable, metadata: ImportFileMetadata): Promise<StoredImportFile>;
  openReadStream(fileReference: string): Readable;
  delete(fileReference: string): Promise<void>;
  exists(fileReference: string): Promise<boolean>;
}

export const IMPORT_FILE_STORAGE = Symbol('IMPORT_FILE_STORAGE');
