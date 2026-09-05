import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import type { AppConfigService } from '../../config/app-config.service';
import { FileHashService } from '../hashing/file-hash.service';
import { LocalImportFileStorage } from './local-import-file-storage.service';

describe('LocalImportFileStorage', () => {
  let directory: string;
  let storage: LocalImportFileStorage;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'schemaiq-import-test-'));
    storage = new LocalImportFileStorage(
      { csvImport: { tempDir: directory } } as unknown as AppConfigService,
      new FileHashService(),
    );
    await storage.onModuleInit();
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it('streams content to a generated private filename', async () => {
    const stored = await storage.store(Readable.from(['name\nAda\n']), {
      mimeType: 'text/csv',
      originalFileName: '../../customers.csv',
    });

    expect(stored.fileReference).toMatch(/^[0-9a-f-]{36}\.csv$/);
    expect(stored.sizeBytes).toBe(9);
    expect(await readFile(join(directory, stored.fileReference), 'utf8')).toBe('name\nAda\n');
  });

  it('computes the SHA-256 hash of the stored content', async () => {
    const stored = await storage.store(Readable.from(['name\nAda\n']), {
      mimeType: 'text/csv',
      originalFileName: 'customers.csv',
    });

    expect(stored.fileHash).toBe(createHash('sha256').update('name\nAda\n').digest('hex'));
  });

  it('produces the same hash for byte-identical content stored under different filenames', async () => {
    const first = await storage.store(Readable.from(['name\nAda\n']), {
      mimeType: 'text/csv',
      originalFileName: 'customers.csv',
    });
    const second = await storage.store(Readable.from(['name\nAda\n']), {
      mimeType: 'text/csv',
      originalFileName: 'customers-renamed.csv',
    });

    expect(second.fileHash).toBe(first.fileHash);
  });

  it('does not resolve arbitrary filesystem paths', () => {
    expect(() => storage.openReadStream('../../etc/passwd')).toThrow('Invalid import file reference');
  });

  it('rejects empty upload metadata before creating a file', async () => {
    await expect(
      storage.store(Readable.from(['name\n']), { mimeType: '', originalFileName: 'customers.csv' }),
    ).rejects.toThrow('Import file metadata is invalid');
  });

  it('deletes a stored file and makes retries impossible after retention cleanup', async () => {
    const stored = await storage.store(Readable.from(['name\nAda\n']), {
      mimeType: 'text/csv',
      originalFileName: 'customers.csv',
    });

    await storage.delete(stored.fileReference);

    await expect(storage.exists(stored.fileReference)).resolves.toBe(false);
  });

  it('reports retained files and treats a second delete as idempotent', async () => {
    const stored = await storage.store(Readable.from(['name\nAda\n']), {
      mimeType: 'text/csv',
      originalFileName: 'customers.csv',
    });

    await expect(storage.exists(stored.fileReference)).resolves.toBe(true);
    await storage.delete(stored.fileReference);
    await expect(storage.delete(stored.fileReference)).resolves.toBeUndefined();
  });
});
