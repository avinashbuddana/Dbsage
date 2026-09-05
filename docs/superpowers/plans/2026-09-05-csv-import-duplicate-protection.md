# CSV Import Duplicate Protection (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it impossible to import the same file content twice into the same organization/schema/table, whether by filename coincidence, retry, or a race between two concurrent requests — enforced at both the application layer and the database layer.

**Architecture:** Compute a streaming SHA-256 hash of every uploaded CSV during the existing disk-write pass (no second read of the file). Store the hash on the existing `data_imports` row. Before creating a new import, check for an existing active/completed import with the same `(organization_id, target_schema, target_table, file_hash)` key and reject with a structured 409 if found. A partial unique index on that same key is the actual concurrency guarantee — a losing concurrent request's insert fails with Postgres error `23505`, which the service translates into the same 409 response.

**Tech Stack:** NestJS, TypeORM (raw-SQL migrations), PostgreSQL, Node `crypto`/streams, Jest, Next.js/React (frontend error surfacing only).

**Spec:** `docs/superpowers/specs/2026-09-05-csv-import-hardening-design.md` (sections 3 and 5 — read both before starting; this plan implements only Phase A).

## Global Constraints

- Duplicate detection key is `(organization_id, target_schema, target_table, file_hash)` — organization-scoped, per the spec's confirmed decision. Never drop `organization_id` from this key.
- No new `data_import_jobs`/history table — extend the existing `data_imports` table only.
- Reuse the existing upload/queue/COPY architecture untouched; this phase only adds a hash + a duplicate check + a retry-rule extension. Do not touch `PostgresCopyService`, the queue, or the worker.
- `file_hash` is a `varchar(64)` (SHA-256 hex digest length). The DB column is nullable (to tolerate rows created before this migration, which have no hash) but every row this app creates going forward always sets a real value — never write `null` from application code.
- Every new file needs a matching `.spec.ts`; every modified file's existing spec must still pass after the change.
- After every task: run `pnpm --filter @schemaiq/api typecheck` and `pnpm --filter @schemaiq/api test`. After the frontend task: also `pnpm --filter @schemaiq/web typecheck` and `pnpm --filter @schemaiq/web test`. Final task runs the full root `pnpm lint`, `pnpm typecheck`, `pnpm build`.

---

### Task 1: Migration + entity — add `file_hash`

**Files:**
- Create: `apps/api/src/database/migrations/1788500000000-csv-import-duplicate-protection.ts`
- Modify: `apps/api/src/database/database.options.ts`
- Modify: `apps/api/src/imports/entities/data-import.entity.ts`

**Interfaces:**
- Produces: `DataImportEntity.fileHash: string` (TypeORM column `file_hash`), used by every later task in this plan.

- [ ] **Step 1: Write the migration**

Create `apps/api/src/database/migrations/1788500000000-csv-import-duplicate-protection.ts`:

```ts
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CsvImportDuplicateProtection1788500000000 implements MigrationInterface {
  name = 'CsvImportDuplicateProtection1788500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "data_imports" ADD COLUMN "file_hash" varchar(64)`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_data_imports_active_file_hash"
        ON "data_imports" ("organization_id", "target_schema", "target_table", "file_hash")
        WHERE "status" IN ('QUEUED', 'PROCESSING', 'COMPLETED')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "UQ_data_imports_active_file_hash"');
    await queryRunner.query('ALTER TABLE "data_imports" DROP COLUMN "file_hash"');
  }
}
```

The column is added nullable (no `NOT NULL`, no default) deliberately: rows created before this migration have no hash to backfill, and a `NOT NULL` add would fail against any environment that already has import history. Postgres unique indexes treat `NULL` as distinct from every other value, so those old rows are automatically invisible to the new unique index without any special-casing — only rows with a real, matching hash can ever collide.

- [ ] **Step 2: Register the migration**

In `apps/api/src/database/database.options.ts`, add the import and array entry:

```ts
import { PostgreSqlCsvImports1788480000000 } from './migrations/1788480000000-postgresql-csv-imports';
import { CsvImportDuplicateProtection1788500000000 } from './migrations/1788500000000-csv-import-duplicate-protection';
```

and in the `migrations` array:

```ts
const migrations = [
  InitialFoundation1725321600000,
  SecureMysqlDatasources1788393600000,
  PostgreSqlCsvImports1788480000000,
  CsvImportDuplicateProtection1788500000000,
];
```

- [ ] **Step 3: Add the entity column**

In `apps/api/src/imports/entities/data-import.entity.ts`, add a new column right after `mimeType`:

```ts
  @Column({ name: 'mime_type', type: 'varchar', length: 128 })
  mimeType!: string;

  @Column({ name: 'file_hash', type: 'varchar', length: 64 })
  fileHash!: string;
```

(The entity type is `string`, not `string | null`, even though the underlying DB column is nullable — every row this application creates always provides a value; only historical pre-migration rows can have a null in the raw column, and nothing in application code reads `fileHash` back for those.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @schemaiq/api typecheck`
Expected: fails — every object literal that builds a `DataImportEntity` (in `ImportsService.create()`, and any test fixture in `imports.service.spec.ts` / `imports.controller.spec.ts` that constructs one) is now missing the required `fileHash` field.

This is expected and resolved in Task 6, when `fileHash` is threaded all the way from the upload through to `ImportsService.create()`. Do not add a placeholder value now — leave the type error as the visible marker of "not yet wired up" until Task 6 closes it. Proceed to Task 2.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/database/migrations/1788500000000-csv-import-duplicate-protection.ts apps/api/src/database/database.options.ts apps/api/src/imports/entities/data-import.entity.ts
git commit -m "feat: add file_hash column and active-import unique index for CSV duplicate protection"
```

---

### Task 2: Streaming SHA-256 hashing wired into file storage

**Files:**
- Create: `apps/api/src/imports/hashing/file-hash.service.ts`
- Create: `apps/api/src/imports/hashing/file-hash.service.spec.ts`
- Modify: `apps/api/src/imports/storage/import-file-storage.interface.ts`
- Modify: `apps/api/src/imports/storage/local-import-file-storage.service.ts`
- Modify: `apps/api/src/imports/storage/local-import-file-storage.service.spec.ts`
- Modify: `apps/api/src/imports/imports.module.ts`

**Interfaces:**
- Produces: `FileHashService.createHashingTransform(): HashingTransform` where `HashingTransform` is a passthrough `Transform` with a `.digest(): string` method returning the SHA-256 hex digest of everything piped through it so far. Produces `StoredImportFile.fileHash: string`, consumed by Task 3.

- [ ] **Step 1: Write the failing test for the hashing transform**

Create `apps/api/src/imports/hashing/file-hash.service.spec.ts`:

```ts
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { FileHashService } from './file-hash.service';

describe('FileHashService', () => {
  it('computes the SHA-256 hex digest of everything piped through it', async () => {
    const service = new FileHashService();
    const hasher = service.createHashingTransform();
    const chunks: Buffer[] = [];

    await pipeline(Readable.from(['hello']), hasher);
    hasher.on('data', (chunk: Buffer) => chunks.push(chunk));

    expect(hasher.digest()).toBe(createHash('sha256').update('hello').digest('hex'));
  });

  it('produces the same digest for identical content piped separately', async () => {
    const service = new FileHashService();
    const first = service.createHashingTransform();
    const second = service.createHashingTransform();

    await pipeline(Readable.from(['name\nAda\n']), first);
    await pipeline(Readable.from(['name\nAda\n']), second);

    expect(first.digest()).toBe(second.digest());
  });

  it('produces different digests for different content', async () => {
    const service = new FileHashService();
    const first = service.createHashingTransform();
    const second = service.createHashingTransform();

    await pipeline(Readable.from(['name\nAda\n']), first);
    await pipeline(Readable.from(['name\nGrace\n']), second);

    expect(first.digest()).not.toBe(second.digest());
  });

  it('passes bytes through unchanged', async () => {
    const service = new FileHashService();
    const hasher = service.createHashingTransform();
    const chunks: Buffer[] = [];
    hasher.on('data', (chunk: Buffer) => chunks.push(chunk));

    await pipeline(Readable.from(['pass-through-content']), hasher);

    expect(Buffer.concat(chunks).toString('utf8')).toBe('pass-through-content');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @schemaiq/api test -- file-hash.service.spec.ts`
Expected: FAIL — `Cannot find module './file-hash.service'`

- [ ] **Step 3: Implement the hashing transform**

Create `apps/api/src/imports/hashing/file-hash.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { createHash, type Hash } from 'node:crypto';
import { Transform, type TransformCallback } from 'node:stream';

export class HashingTransform extends Transform {
  private readonly hash: Hash = createHash('sha256');

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.hash.update(chunk);
    callback(null, chunk);
  }

  digest(): string {
    return this.hash.digest('hex');
  }
}

@Injectable()
export class FileHashService {
  createHashingTransform(): HashingTransform {
    return new HashingTransform();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @schemaiq/api test -- file-hash.service.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing test for storage wiring**

In `apps/api/src/imports/storage/local-import-file-storage.service.spec.ts`, add the `FileHashService` import and pass a real instance into every `new LocalImportFileStorage(...)` call, then add a new test:

```ts
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
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @schemaiq/api test -- local-import-file-storage.service.spec.ts`
Expected: FAIL — `LocalImportFileStorage` constructor doesn't accept a second argument yet, and `stored.fileHash` is `undefined`.

- [ ] **Step 7: Implement storage wiring**

In `apps/api/src/imports/storage/import-file-storage.interface.ts`, add `fileHash` to the result shape:

```ts
export interface StoredImportFile {
  fileReference: string;
  sizeBytes: number;
  fileHash: string;
}
```

In `apps/api/src/imports/storage/local-import-file-storage.service.ts`, inject `FileHashService` and insert the hashing transform into the existing pipeline:

```ts
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
```

- [ ] **Step 8: Register `FileHashService` in the module**

In `apps/api/src/imports/imports.module.ts`, add the import and provider:

```ts
import { FileHashService } from './hashing/file-hash.service';
```

and in the `providers` array, add `FileHashService,` (anywhere before `LocalImportFileStorage`, since it's a dependency of it — provider order in the array doesn't matter to Nest's DI, but keep it near the top with the other foundational providers for readability).

- [ ] **Step 9: Run tests to verify they pass**

Run: `pnpm --filter @schemaiq/api test -- file-hash.service.spec.ts local-import-file-storage.service.spec.ts`
Expected: PASS (all tests in both files)

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/imports/hashing/file-hash.service.ts apps/api/src/imports/hashing/file-hash.service.spec.ts apps/api/src/imports/storage/import-file-storage.interface.ts apps/api/src/imports/storage/local-import-file-storage.service.ts apps/api/src/imports/storage/local-import-file-storage.service.spec.ts apps/api/src/imports/imports.module.ts
git commit -m "feat: compute a streaming SHA-256 hash while storing an uploaded CSV"
```

---

### Task 3: Thread the file hash from upload to the service layer

**Files:**
- Create: `apps/api/src/imports/types/express-multer-file.d.ts`
- Modify: `apps/api/src/imports/csv-import-upload.interceptor.ts`
- Modify: `apps/api/src/imports/imports.types.ts`
- Modify: `apps/api/src/imports/imports.controller.ts`
- Modify: `apps/api/src/imports/imports.controller.spec.ts`

**Interfaces:**
- Consumes: `StoredImportFile.fileHash` from Task 2.
- Produces: `UploadedCsvFile.fileHash: string`, consumed by Task 6.

Note on test placement: `csv-import-upload.interceptor.spec.ts`'s existing tests all stub out the interceptor's private `upload` function directly (`internals.upload = (...) => {...}`) rather than exercising the real multer `StorageEngine._handleFile` callback — none of its 3 existing tests call `storage.store()` at all, so the change below needs no new test in that file. The real end-to-end path (multer → `_handleFile` → `storage.store()` → `fileHash` landing on `req.file`) is exercised by `imports.controller.spec.ts`'s existing real-supertest-request test, extended in Steps 6-9 below — that is this task's actual behavioral test coverage for the interceptor change.

- [ ] **Step 1: Add the ambient type augmentation**

Create `apps/api/src/imports/types/express-multer-file.d.ts`:

```ts
declare global {
  namespace Express {
    namespace Multer {
      interface File {
        fileHash?: string;
      }
    }
  }
}

export {};
```

- [ ] **Step 2: Wire `fileHash` through the interceptor**

In `apps/api/src/imports/csv-import-upload.interceptor.ts`, change the `_handleFile` callback's info object:

```ts
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
```

Add the import at the top of the file: `import './types/express-multer-file';` (side-effect import so the ambient augmentation is loaded — TypeScript ambient `.d.ts` files with `export {}` need to be imported somewhere in the compiled graph to be picked up; importing it here, right where `file.fileHash` starts being relevant, is the clearest place).

- [ ] **Step 3: Run the interceptor's existing tests to confirm nothing broke**

Run: `pnpm --filter @schemaiq/api test -- csv-import-upload.interceptor.spec.ts`
Expected: PASS (all 3 existing tests — this change doesn't touch anything they stub or assert on)

- [ ] **Step 4: Write the failing test for the controller**

In `apps/api/src/imports/imports.types.ts`, add `fileHash: string` to `UploadedCsvFile`:

```ts
export interface UploadedCsvFile {
  fileReference: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  fileHash: string;
}
```

In `apps/api/src/imports/imports.controller.spec.ts`, find the existing successful-upload test (`'streams a multipart upload to storage and returns 202 for a queued import'`). Its underlying mocked file-storage engine will need to report a `fileHash` for multer to forward — since this test drives a real supertest request through the real `CsvImportUploadInterceptor` (not a mock of the interceptor itself), find where the test's `storage` mock's `store` method is defined and add `fileHash: 'deadbeef'` to its resolved value. Then update the existing assertion:

```ts
    expect(imports.create).toHaveBeenCalledWith(
      organizationId,
      {
        columnMapping: { name: 'name' },
        columnTypes: {},
        createTable: false,
        delimiter: ',',
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
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @schemaiq/api test -- imports.controller.spec.ts`
Expected: FAIL — the controller doesn't read/forward `file.fileHash` yet, and `storage.store`'s mock doesn't yet resolve `fileHash`.

- [ ] **Step 6: Wire `fileHash` through the controller**

In `apps/api/src/imports/imports.controller.ts`:

```ts
  async create(
    @Body() input: CreateCsvImportDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DataImportResponse> {
    if (!file?.filename || !file.fileHash) throw new BadRequestException('CSV upload is required');
    const result = await this.imports.create(
      this.organizationContext.getOrganizationId(),
      {
        columnMapping: parseColumnMapping(input.columnMapping),
        columnTypes: parseColumnTypes(input.columnTypes),
        createTable: input.createTable,
        delimiter: input.delimiter,
        targetSchema: input.targetSchema,
        targetTable: input.targetTable,
      },
      {
        fileHash: file.fileHash,
        fileReference: file.filename,
        mimeType: file.mimetype,
        originalFileName: file.originalname,
        sizeBytes: file.size,
      },
    );
    if (result.processingMode === DataImportProcessingMode.Queued) {
      response.status(HttpStatus.ACCEPTED);
    }
    return result;
  }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @schemaiq/api test -- imports.controller.spec.ts csv-import-upload.interceptor.spec.ts`
Expected: PASS

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter @schemaiq/api typecheck`
Expected: The only remaining error is in `ImportsService.create()`'s object literal (missing `fileHash` on the `DataImportEntity` it builds) and any fixture in `imports.service.spec.ts` — both resolved in Task 6.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/imports/types/express-multer-file.d.ts apps/api/src/imports/csv-import-upload.interceptor.ts apps/api/src/imports/csv-import-upload.interceptor.spec.ts apps/api/src/imports/imports.types.ts apps/api/src/imports/imports.controller.ts apps/api/src/imports/imports.controller.spec.ts
git commit -m "feat: thread the uploaded file's SHA-256 hash from multer through to the import service"
```

---

### Task 4: Duplicate exception and duplicate-check service

**Files:**
- Create: `apps/api/src/imports/hashing/duplicate-import.error.ts`
- Create: `apps/api/src/imports/hashing/duplicate-import.service.ts`
- Create: `apps/api/src/imports/hashing/duplicate-import.service.spec.ts`
- Modify: `apps/api/src/imports/imports.module.ts`

**Interfaces:**
- Consumes: `DataImportEntity.fileHash` (Task 1), `DataImportStatus` enum (existing).
- Produces: `DuplicateImportException` (with `code: 'DUPLICATE_IMPORT' | 'IMPORT_ALREADY_IN_PROGRESS'`, `existingImportId: string`, `fileHash: string`, `previousImport?: { fileName: string; importedAt: Date; totalRows: string | null; successfulRows: string; failedRows: string }`), consumed by Task 5 and Task 6. `DuplicateImportService.assertNotDuplicate(organizationId: string, targetSchema: string, targetTable: string, fileHash: string): Promise<void>`, consumed by Task 6.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/imports/hashing/duplicate-import.service.spec.ts`:

```ts
import type { Repository } from 'typeorm';

import { DataImportEntity } from '../entities/data-import.entity';
import { DataImportProcessingMode } from '../enums/data-import-processing-mode.enum';
import { DataImportStatus } from '../enums/data-import-status.enum';
import { DuplicateImportException } from './duplicate-import.error';
import { DuplicateImportService } from './duplicate-import.service';

const organizationId = '00000000-0000-4000-8000-000000000001';

function entity(overrides: Partial<DataImportEntity> = {}): DataImportEntity {
  return Object.assign(new DataImportEntity(), {
    columnMapping: {},
    completedAt: new Date('2026-09-05T10:30:00Z'),
    createdAt: new Date('2026-09-05T10:00:00Z'),
    createdByUserId: null,
    delimiter: ',',
    errorCode: null,
    errorMessage: null,
    failedRows: '20',
    fileDeletedAt: null,
    fileHash: 'abc123',
    fileSizeBytes: '4',
    hasHeader: true,
    id: '00000000-0000-4000-8000-000000000002',
    mimeType: 'text/csv',
    organizationId,
    originalFileName: 'customers.csv',
    processedBytes: '0',
    processedRows: '15000',
    processingMode: DataImportProcessingMode.Queued,
    progressPercent: 100,
    queueJobId: null,
    startedAt: new Date('2026-09-05T10:29:00Z'),
    status: DataImportStatus.Completed,
    storedFileReference: '00000000-0000-4000-8000-000000000003.csv',
    successfulRows: '14980',
    targetSchema: 'public',
    targetTable: 'customers',
    totalRows: '15000',
    updatedAt: new Date('2026-09-05T10:30:00Z'),
    ...overrides,
  });
}

describe('DuplicateImportService', () => {
  function setup() {
    const repository = { findOne: jest.fn() };
    const service = new DuplicateImportService(repository as unknown as Repository<DataImportEntity>);
    return { repository, service };
  }

  it('allows the import when no matching active or completed import exists', async () => {
    const { repository, service } = setup();
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.assertNotDuplicate(organizationId, 'public', 'customers', 'abc123'),
    ).resolves.toBeUndefined();
  });

  it('reports a completed duplicate with the prior import summary', async () => {
    const { repository, service } = setup();
    repository.findOne.mockResolvedValue(entity({ status: DataImportStatus.Completed }));

    await expect(service.assertNotDuplicate(organizationId, 'public', 'customers', 'abc123')).rejects.toMatchObject({
      code: 'DUPLICATE_IMPORT',
      existingImportId: '00000000-0000-4000-8000-000000000002',
      fileHash: 'abc123',
      previousImport: {
        failedRows: '20',
        fileName: 'customers.csv',
        successfulRows: '14980',
        totalRows: '15000',
      },
    });
  });

  it('reports an in-progress duplicate without a previous-import summary', async () => {
    const { repository, service } = setup();
    repository.findOne.mockResolvedValue(entity({ status: DataImportStatus.Processing }));

    const error = await service
      .assertNotDuplicate(organizationId, 'public', 'customers', 'abc123')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DuplicateImportException);
    expect((error as DuplicateImportException).code).toBe('IMPORT_ALREADY_IN_PROGRESS');
    expect((error as DuplicateImportException).previousImport).toBeUndefined();
  });

  it('scopes the lookup to organization, schema, table, hash, and active statuses', async () => {
    const { repository, service } = setup();
    repository.findOne.mockResolvedValue(null);

    await service.assertNotDuplicate(organizationId, 'public', 'customers', 'abc123');

    expect(repository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          fileHash: 'abc123',
          organizationId,
          targetSchema: 'public',
          targetTable: 'customers',
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @schemaiq/api test -- duplicate-import.service.spec.ts`
Expected: FAIL — `Cannot find module './duplicate-import.error'` / `./duplicate-import.service'`

- [ ] **Step 3: Implement the exception**

Create `apps/api/src/imports/hashing/duplicate-import.error.ts`:

```ts
export type DuplicateImportCode = 'DUPLICATE_IMPORT' | 'IMPORT_ALREADY_IN_PROGRESS';

export interface DuplicateImportPreviousImport {
  fileName: string;
  importedAt: Date;
  totalRows: string | null;
  successfulRows: string;
  failedRows: string;
}

export class DuplicateImportException extends Error {
  constructor(
    readonly code: DuplicateImportCode,
    message: string,
    readonly existingImportId: string,
    readonly fileHash: string,
    readonly previousImport?: DuplicateImportPreviousImport,
  ) {
    super(message);
    this.name = 'DuplicateImportException';
  }
}
```

- [ ] **Step 4: Implement the duplicate-check service**

Create `apps/api/src/imports/hashing/duplicate-import.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In } from 'typeorm';
import type { Repository } from 'typeorm';

import { DataImportEntity } from '../entities/data-import.entity';
import { DataImportStatus } from '../enums/data-import-status.enum';
import { DuplicateImportException } from './duplicate-import.error';

const ACTIVE_STATUSES = [DataImportStatus.Queued, DataImportStatus.Processing, DataImportStatus.Completed];

@Injectable()
export class DuplicateImportService {
  constructor(
    @InjectRepository(DataImportEntity)
    private readonly repository: Repository<DataImportEntity>,
  ) {}

  async assertNotDuplicate(
    organizationId: string,
    targetSchema: string,
    targetTable: string,
    fileHash: string,
  ): Promise<void> {
    const existing = await this.repository.findOne({
      order: { createdAt: 'DESC' },
      where: {
        fileHash,
        organizationId,
        status: In(ACTIVE_STATUSES),
        targetSchema,
        targetTable,
      },
    });
    if (!existing) return;
    throw this.toException(existing, fileHash);
  }

  private toException(existing: DataImportEntity, fileHash: string): DuplicateImportException {
    if (existing.status === DataImportStatus.Completed) {
      return new DuplicateImportException(
        'DUPLICATE_IMPORT',
        `This file has already been imported into ${existing.targetSchema}.${existing.targetTable}.`,
        existing.id,
        fileHash,
        {
          failedRows: existing.failedRows,
          fileName: existing.originalFileName,
          importedAt: existing.completedAt ?? existing.updatedAt,
          successfulRows: existing.successfulRows,
          totalRows: existing.totalRows,
        },
      );
    }
    return new DuplicateImportException(
      'IMPORT_ALREADY_IN_PROGRESS',
      'This file is already being imported.',
      existing.id,
      fileHash,
    );
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @schemaiq/api test -- duplicate-import.service.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Register the service in the module**

In `apps/api/src/imports/imports.module.ts`, add the import and provider:

```ts
import { DuplicateImportService } from './hashing/duplicate-import.service';
```

and add `DuplicateImportService,` to the `providers` array.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/imports/hashing/duplicate-import.error.ts apps/api/src/imports/hashing/duplicate-import.service.ts apps/api/src/imports/hashing/duplicate-import.service.spec.ts apps/api/src/imports/imports.module.ts
git commit -m "feat: add DuplicateImportException and DuplicateImportService"
```

---

### Task 5: Surface duplicate errors with a structured 409

**Files:**
- Modify: `apps/api/src/common/filters/global-exception.filter.ts`
- Create: `apps/api/src/common/filters/global-exception.filter.spec.ts`

**Interfaces:**
- Consumes: `DuplicateImportException` from Task 4.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/filters/global-exception.filter.spec.ts` (this file has no existing test coverage — this establishes a baseline alongside the new behavior):

```ts
import { BadRequestException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';
import type { PinoLogger } from 'nestjs-pino';

import { DatasourceConnectionError } from '../../database-connections/datasource-connection.error';
import { DuplicateImportException } from '../../imports/hashing/duplicate-import.error';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  function setup() {
    const logger = { error: jest.fn() } as unknown as PinoLogger;
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
    return { filter, host, json, logger, status };
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
      { failedRows: '20', fileName: 'customers.csv', importedAt: new Date('2026-09-05T10:30:00Z'), successfulRows: '14980', totalRows: '15000' },
    );

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      code: 'DUPLICATE_IMPORT',
      existingImportId: 'import-1',
      fileHash: 'abc123',
      message: 'This file has already been imported into public.customers.',
      previousImport: { failedRows: '20', fileName: 'customers.csv', importedAt: new Date('2026-09-05T10:30:00Z'), successfulRows: '14980', totalRows: '15000' },
      requestId: 'req-1',
      statusCode: 409,
    });
  });

  it('returns a 409 without a previousImport field for an in-progress duplicate', () => {
    const { filter, host, json, status } = setup();

    filter.catch(new DuplicateImportException('IMPORT_ALREADY_IN_PROGRESS', 'This file is already being imported.', 'import-2', 'abc123'), host);

    expect(status).toHaveBeenCalledWith(409);
    const [body] = json.mock.calls[0] as [Record<string, unknown>];
    expect(body).not.toHaveProperty('previousImport');
    expect(body.code).toBe('IMPORT_ALREADY_IN_PROGRESS');
  });

  it('logs and sanitizes a truly unhandled error as a 500', () => {
    const { filter, host, json, logger, status } = setup();

    filter.catch(new Error('unexpected'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' }),
    );
    expect(logger.error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @schemaiq/api test -- global-exception.filter.spec.ts`
Expected: FAIL — the two `DuplicateImportException` tests fail (status defaults to 500, no `existingImportId`/`fileHash`/`previousImport` in the body).

- [ ] **Step 3: Implement the filter change**

Replace the contents of `apps/api/src/common/filters/global-exception.filter.ts`:

```ts
import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { DatasourceConnectionError } from '../../database-connections/datasource-connection.error';
import { DuplicateImportException } from '../../imports/hashing/duplicate-import.error';
import type { RequestWithId } from '../types/request-with-id';

interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  existingImportId?: string;
  fileHash?: string;
  previousImport?: DuplicateImportException['previousImport'];
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'TOO_MANY_REQUESTS';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'HTTP_ERROR';
  }
}

function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Invalid request';
    case 401:
      return 'Authentication required';
    case 403:
      return 'Access denied';
    case 404:
      return 'Resource not found';
    case 409:
      return 'Request conflicts with existing data';
    case 429:
      return 'Too many requests';
    case 503:
      return 'Service unavailable';
    default:
      return status >= 500 ? 'Internal server error' : 'Request failed';
  }
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(GlobalExceptionFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const requestId = request.id ?? 'unknown';
    const isKnownException =
      exception instanceof HttpException ||
      exception instanceof DatasourceConnectionError ||
      exception instanceof DuplicateImportException;

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : exception instanceof DuplicateImportException
          ? 409
          : exception instanceof DatasourceConnectionError
            ? exception.code === 'DATASOURCE_NETWORK_BLOCKED'
              ? 400
              : exception.code === 'DATASOURCE_DISABLED'
                ? 409
                : exception.code === 'DATASOURCE_RESOURCE_LIMIT'
                  ? 503
                  : 502
            : 500;

    if (!isKnownException) {
      this.logger.error(
        {
          requestId,
          exceptionType: exception instanceof Error ? exception.name : typeof exception,
        },
        'Unhandled request error',
      );
    }

    const body: ErrorResponse = {
      statusCode: status,
      code:
        exception instanceof DatasourceConnectionError
          ? exception.code
          : exception instanceof DuplicateImportException
            ? exception.code
            : codeForStatus(status),
      message:
        exception instanceof DatasourceConnectionError
          ? exception.message
          : exception instanceof DuplicateImportException
            ? exception.message
            : messageForStatus(status),
      requestId,
      ...(exception instanceof DuplicateImportException
        ? {
            existingImportId: exception.existingImportId,
            fileHash: exception.fileHash,
            ...(exception.previousImport ? { previousImport: exception.previousImport } : {}),
          }
        : {}),
    };

    response.status(status).json(body);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @schemaiq/api test -- global-exception.filter.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/filters/global-exception.filter.ts apps/api/src/common/filters/global-exception.filter.spec.ts
git commit -m "feat: return structured 409 responses for duplicate CSV imports"
```

---

### Task 6: Wire the duplicate check and retry-rule extension into ImportsService

**Files:**
- Modify: `apps/api/src/imports/imports.service.ts`
- Modify: `apps/api/src/imports/imports.service.spec.ts`
- Modify: `apps/api/src/imports/import-status.ts`
- Modify: `apps/api/src/imports/import-status.spec.ts`

**Interfaces:**
- Consumes: `DuplicateImportService.assertNotDuplicate` (Task 4), `UploadedCsvFile.fileHash` (Task 3).

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/imports/imports.service.spec.ts`:

1. Add `fileHash: 'abc123'` to the `file` fixture object near the top of the `describe` block (alongside `fileReference`, `mimeType`, `originalFileName`, `sizeBytes`).
2. Add `fileHash: 'abc123'` to the `entity()` fixture helper's default fields.
3. In `setup()`, add a `duplicateImport` mock and pass it into the `ImportsService` constructor call:

```ts
  const duplicateImport = { assertNotDuplicate: jest.fn() };
  const service = new ImportsService(
    repository as unknown as Repository<DataImportEntity>,
    processor as unknown as CsvImportProcessor,
    storage as unknown as ImportFileStorage,
    queue as unknown as ImportQueueService,
    audit as unknown as AuditService,
    { csvImport: { /* ...unchanged... */ } } as unknown as AppConfigService,
    duplicateImport as unknown as DuplicateImportService,
  );
  return { audit, duplicateImport, processor, queue, repository, service, storage };
```

4. Add new test cases (place near the existing `create()` tests):

```ts
  it('checks for a duplicate before creating any import row', async () => {
    const { duplicateImport, repository, service } = setup();
    duplicateImport.assertNotDuplicate.mockRejectedValue(new Error('duplicate'));

    await expect(service.create(organizationId, input, file)).rejects.toThrow('duplicate');

    expect(duplicateImport.assertNotDuplicate).toHaveBeenCalledWith(organizationId, 'public', 'customer_records', 'abc123');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('re-checks for a duplicate when a concurrent insert wins the unique-index race', async () => {
    const { duplicateImport, repository, service } = setup();
    const uniqueViolation: { code: string } = { code: '23505' };
    repository.save.mockRejectedValueOnce(uniqueViolation);
    duplicateImport.assertNotDuplicate
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('duplicate after race'));

    await expect(service.create(organizationId, input, file)).rejects.toThrow('duplicate after race');

    expect(duplicateImport.assertNotDuplicate).toHaveBeenCalledTimes(2);
  });

  it('allows retrying a cancelled import that never inserted any rows', async () => {
    const { queue, repository, service } = setup();
    repository.findOne.mockResolvedValue(entity({ status: DataImportStatus.Cancelled }));

    const result = await service.retry(organizationId, importId);

    expect(result.status).toBe(DataImportStatus.Queued);
    expect(queue.enqueue).toHaveBeenCalledWith(importId, organizationId);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @schemaiq/api test -- imports.service.spec.ts`
Expected: FAIL — `ImportsService` constructor doesn't accept a 7th argument, `duplicateImport.assertNotDuplicate` is never called, retry from `Cancelled` is rejected.

- [ ] **Step 3: Implement the service changes**

In `apps/api/src/imports/imports.service.ts`, add the import and constructor parameter:

```ts
import { DuplicateImportService } from './hashing/duplicate-import.service';
```

```ts
  constructor(
    @InjectRepository(DataImportEntity)
    private readonly repository: Repository<DataImportEntity>,
    private readonly processor: CsvImportProcessor,
    @Inject(IMPORT_FILE_STORAGE) private readonly storage: ImportFileStorage,
    private readonly queue: ImportQueueService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    private readonly duplicateImport: DuplicateImportService,
  ) {}
```

Replace `create()`'s row-creation section:

```ts
  async create(
    organizationId: string,
    input: CreateCsvImportInput,
    file: UploadedCsvFile,
  ): Promise<DataImportResponse> {
    await this.duplicateImport.assertNotDuplicate(organizationId, input.targetSchema, input.targetTable, file.fileHash);

    let importEntity: DataImportEntity;
    try {
      importEntity = await this.repository.save(
        this.repository.create({
          columnMapping: input.columnMapping,
          completedAt: null,
          createdByUserId: null,
          delimiter: input.delimiter,
          errorCode: null,
          errorMessage: null,
          failedRows: '0',
          fileDeletedAt: null,
          fileHash: file.fileHash,
          fileSizeBytes: String(file.sizeBytes),
          hasHeader: true,
          mimeType: file.mimeType,
          organizationId,
          originalFileName: file.originalFileName,
          processedBytes: '0',
          processedRows: '0',
          processingMode:
            file.sizeBytes > this.config.csvImport.queueThresholdBytes
              ? DataImportProcessingMode.Queued
              : DataImportProcessingMode.Synchronous,
          progressPercent: 0,
          queueJobId: null,
          startedAt: null,
          status: DataImportStatus.Uploaded,
          storedFileReference: file.fileReference,
          successfulRows: '0',
          targetSchema: input.targetSchema,
          targetTable: input.targetTable,
          totalRows: null,
        }),
      );
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        await this.duplicateImport.assertNotDuplicate(organizationId, input.targetSchema, input.targetTable, file.fileHash);
      }
      throw error;
    }
    await this.audit.record(organizationId, AuditEvent.CsvImportUploaded, {
      fileSizeBytes: importEntity.fileSizeBytes,
      importId: importEntity.id,
      targetSchema: importEntity.targetSchema,
      targetTable: importEntity.targetTable,
    });

    try {
      importEntity = await this.transition(importEntity, DataImportStatus.Validating);
      const prepared = await this.processor.prepare(importEntity, input.createTable, input.columnTypes);
      importEntity.columnMapping = prepared.columnMapping;
      if (importEntity.processingMode === DataImportProcessingMode.Queued) {
        importEntity = await this.transition(importEntity, DataImportStatus.Queued);
        importEntity = await this.enqueue(importEntity);
        await this.audit.record(organizationId, AuditEvent.CsvImportQueued, {
          importId: importEntity.id,
          targetSchema: importEntity.targetSchema,
          targetTable: importEntity.targetTable,
        });
        return this.toResponse(importEntity);
      }

      importEntity = await this.transition(importEntity, DataImportStatus.Processing, { startedAt: new Date() });
      await this.audit.record(organizationId, AuditEvent.CsvImportStarted, { importId: importEntity.id });
      return this.toResponse(await this.execute(importEntity, prepared));
    } catch (error) {
      importEntity = await this.fail(importEntity, error);
      if (error instanceof ServiceUnavailableException) throw error;
      return this.toResponse(importEntity);
    }
  }
```

Add the new private helper (place near the other private helpers, e.g. right above `private async getEntity`):

```ts
  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }
```

Replace `retry()`'s guard and conditional update:

```ts
  async retry(organizationId: string, importId: string): Promise<DataImportResponse> {
    let importEntity = await this.getEntity(organizationId, importId);
    if (importEntity.status !== DataImportStatus.Failed && importEntity.status !== DataImportStatus.Cancelled) {
      throw new ConflictException('Only failed or cancelled imports can be retried');
    }
    if (!(await this.storage.exists(importEntity.storedFileReference))) {
      throw new NotFoundException('Import file is no longer available for retry');
    }
    const queued = await this.repository.update(
      { id: importId, organizationId, status: importEntity.status },
      {
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        failedRows: '0',
        processedBytes: '0',
        processedRows: '0',
        progressPercent: 0,
        startedAt: null,
        status: DataImportStatus.Queued,
        successfulRows: '0',
      },
    );
    if (!queued.affected) throw new ConflictException('Import status changed before retry');

    importEntity.status = DataImportStatus.Queued;
    importEntity.errorCode = null;
    importEntity.errorMessage = null;
    importEntity.completedAt = null;
    try {
      importEntity = await this.enqueue(importEntity);
    } catch (error) {
      await this.fail(importEntity, error);
      throw new ServiceUnavailableException('CSV import retry could not be queued');
    }
    await this.audit.record(organizationId, AuditEvent.CsvImportRetried, { importId });
    return this.toResponse(importEntity);
  }
```

(Only `!== Failed` → `!== Failed && !== Cancelled` and the update's `where.status: DataImportStatus.Failed` → `where.status: importEntity.status` actually changed; every other line is unchanged — copy the rest of the method body verbatim from the current file.)

In `apps/api/src/imports/import-status.ts`, update the transition table so it accurately documents the now-valid `Cancelled → Queued` retry path (not exercised by `retry()` itself, which uses its own direct compare-and-swap rather than this helper, but this table is the canonical reference for valid state transitions and must stay accurate):

```ts
  [DataImportStatus.Cancelled]: [DataImportStatus.Queued],
```

(replacing the current `[DataImportStatus.Cancelled]: [],`).

In `apps/api/src/imports/import-status.spec.ts`, add:

```ts
  it('allows retrying a cancelled import', () => {
    expect(canTransitionDataImportStatus(DataImportStatus.Cancelled, DataImportStatus.Queued)).toBe(true);
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @schemaiq/api test -- imports.service.spec.ts import-status.spec.ts`
Expected: PASS (all tests, including the new ones)

- [ ] **Step 5: Full backend verification**

Run: `pnpm --filter @schemaiq/api typecheck && pnpm --filter @schemaiq/api test`
Expected: no type errors anywhere in `apps/api`; all test suites pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/imports/imports.service.ts apps/api/src/imports/imports.service.spec.ts apps/api/src/imports/import-status.ts apps/api/src/imports/import-status.spec.ts
git commit -m "feat: enforce duplicate-import protection and allow retrying cancelled imports"
```

---

### Task 7: Frontend duplicate-state handling

**Files:**
- Modify: `apps/web/lib/api-client.ts`
- Modify: `apps/web/lib/api-client.spec.ts`
- Modify: `apps/web/app/dashboard/imports/new/page.tsx`
- Modify: `apps/web/app/dashboard/imports/new/page.spec.tsx`

**Interfaces:**
- Consumes: the 409 response body shape from Task 5 (`code`, `existingImportId`, `fileHash`, `previousImport?`).

- [ ] **Step 1: Write the failing test for `ApiError`**

In `apps/web/lib/api-client.spec.ts`, add a test near the existing `ApiError`-related coverage:

```ts
  it('carries duplicate-import details through to the thrown ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'DUPLICATE_IMPORT',
            existingImportId: 'import-1',
            fileHash: 'abc123',
            message: 'This file has already been imported into public.customers.',
            previousImport: {
              failedRows: '20',
              fileName: 'customers.csv',
              importedAt: '2026-09-05T10:30:00Z',
              successfulRows: '14980',
              totalRows: '15000',
            },
            requestId: 'req-1',
            statusCode: 409,
          }),
          { status: 409 },
        ),
      ),
    );

    await expect(importsApi.get('org-1', 'import-1')).rejects.toMatchObject({
      code: 'DUPLICATE_IMPORT',
      existingImportId: 'import-1',
      previousImport: { fileName: 'customers.csv', successfulRows: '14980' },
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @schemaiq/web test -- api-client.spec.ts`
Expected: FAIL — `ApiError` doesn't carry `existingImportId`/`previousImport`.

- [ ] **Step 3: Extend `ApiErrorPayload`/`ApiError`**

In `apps/web/lib/api-client.ts`:

```ts
export interface ApiErrorPreviousImport {
  fileName: string;
  importedAt: string;
  totalRows: string | null;
  successfulRows: string;
  failedRows: string;
}

export interface ApiErrorPayload {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  existingImportId?: string;
  fileHash?: string;
  previousImport?: ApiErrorPreviousImport;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly requestId: string;
  readonly existingImportId?: string;
  readonly fileHash?: string;
  readonly previousImport?: ApiErrorPreviousImport;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.statusCode = payload.statusCode;
    this.code = payload.code;
    this.requestId = payload.requestId;
    this.existingImportId = payload.existingImportId;
    this.fileHash = payload.fileHash;
    this.previousImport = payload.previousImport;
  }
}
```

In `apiFetch()`'s error-building branch, forward the extra fields from the parsed error payload:

```ts
  if (!response.ok) {
    const errorPayload = payload as Partial<ApiErrorPayload> | null;
    throw new ApiError({
      code: errorPayload?.code ?? 'UNKNOWN_ERROR',
      existingImportId: errorPayload?.existingImportId,
      fileHash: errorPayload?.fileHash,
      message: errorPayload?.message ?? 'Something went wrong. Please try again.',
      previousImport: errorPayload?.previousImport,
      requestId: errorPayload?.requestId ?? 'unknown',
      statusCode: errorPayload?.statusCode ?? response.status,
    });
  }
```

Also apply the same forwarding in `uploadCsv()`'s `xhr.onload` error branch (the duplicate check runs on the same `POST /imports/csv` endpoint this function calls):

```ts
      xhr.onload = () => {
        let payload: unknown = null;
        try {
          payload = JSON.parse(xhr.responseText);
        } catch {
          payload = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ data: payload as DataImportApiResponse, status: xhr.status });
          return;
        }
        const errorPayload = payload as Partial<ApiErrorPayload> | null;
        reject(
          new ApiError({
            code: errorPayload?.code ?? 'UNKNOWN_ERROR',
            existingImportId: errorPayload?.existingImportId,
            fileHash: errorPayload?.fileHash,
            message: errorPayload?.message ?? 'The upload could not be completed.',
            previousImport: errorPayload?.previousImport,
            requestId: errorPayload?.requestId ?? 'unknown',
            statusCode: errorPayload?.statusCode ?? xhr.status,
          }),
        );
      };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @schemaiq/web test -- api-client.spec.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for the wizard's duplicate state**

In `apps/web/app/dashboard/imports/new/page.spec.tsx`, add a test alongside the existing "shows a friendly error and does not navigate when starting the import fails" test:

```ts
  it('shows the duplicate-import details and a link to the existing import when the upload is rejected as a duplicate', async () => {
    const { ApiError } = await import('../../../../lib/api-client');
    mutateAsync.mockRejectedValue(
      new ApiError({
        code: 'DUPLICATE_IMPORT',
        existingImportId: 'import-999',
        message: 'This file has already been imported into public.customers.',
        previousImport: {
          failedRows: '20',
          fileName: 'customers.csv',
          importedAt: '2026-09-05T10:30:00Z',
          successfulRows: '14980',
          totalRows: '15000',
        },
        requestId: 'req-1',
        statusCode: 409,
      }),
    );
    const user = userEvent.setup();
    render(<NewImportPage />);

    await uploadMockFileAndWait(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByText('mock-select-schema'));
    await user.click(screen.getByText('mock-select-table'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByText('mock-start-import'));

    await screen.findByText('File Already Imported');
    expect(screen.getByText(/14,980 rows/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View existing import' })).toHaveAttribute(
      'href',
      '/dashboard/imports/import-999',
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @schemaiq/web test -- new/page.spec.tsx`
Expected: FAIL — the wizard currently renders every error the same generic way, with no "File Already Imported" state or link.

- [ ] **Step 7: Implement the duplicate-state UI**

In `apps/web/app/dashboard/imports/new/page.tsx`, add `duplicateImport` to `WizardState` and its action:

```ts
interface WizardState {
  // ...existing fields...
  duplicateImport: DuplicateImportInfo | null;
}
```

Define the info shape near the top of the file (after the existing imports):

```ts
interface DuplicateImportInfo {
  existingImportId: string;
  message: string;
  previousImport?: { fileName: string; successfulRows: string; failedRows: string; totalRows: string | null };
}
```

Add to `WizardAction`:

```ts
  | { type: 'SET_DUPLICATE_IMPORT'; duplicateImport: DuplicateImportInfo | null }
```

Add `duplicateImport: null` to `INITIAL_STATE`, and a reducer case:

```ts
    case 'SET_DUPLICATE_IMPORT':
      return { ...state, duplicateImport: action.duplicateImport };
```

Import `ApiError` at the top: `import { ApiError } from '../../../../lib/api-client';`

In `handleStartImport()`'s catch block, detect the duplicate codes before falling back to the generic message:

```ts
  async function handleStartImport(): Promise<void> {
    if (!state.file || !state.schema || !state.table) return;
    dispatch({ message: null, type: 'SET_SUBMIT_ERROR' });
    dispatch({ duplicateImport: null, type: 'SET_DUPLICATE_IMPORT' });
    dispatch({ progress: 0, type: 'SET_UPLOAD_PROGRESS' });
    try {
      const result = await createImport.mutateAsync({
        input: {
          columnMapping: mappingToColumnMapping(state.mapping),
          columnTypes: mappingToColumnTypes(state.mapping),
          createTable: state.createTable,
          delimiter: ',',
          file: state.file,
          targetSchema: state.schema,
          targetTable: state.table,
        },
        onProgress: (percent) => {
          dispatch({ progress: percent, type: 'SET_UPLOAD_PROGRESS' });
        },
      });
      router.push(`/dashboard/imports/${result.data.id}`);
    } catch (error) {
      dispatch({ progress: null, type: 'SET_UPLOAD_PROGRESS' });
      if (error instanceof ApiError && (error.code === 'DUPLICATE_IMPORT' || error.code === 'IMPORT_ALREADY_IN_PROGRESS') && error.existingImportId) {
        dispatch({
          duplicateImport: {
            existingImportId: error.existingImportId,
            message: error.message,
            previousImport: error.previousImport,
          },
          type: 'SET_DUPLICATE_IMPORT',
        });
        return;
      }
      dispatch({ message: error instanceof Error ? error.message : 'The import could not be started.', type: 'SET_SUBMIT_ERROR' });
    }
  }
```

In the Step 4 render block, branch on `state.duplicateImport` before the existing `state.submitError` branch:

```tsx
      {state.step === 4 && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          {state.duplicateImport ? (
            <>
              <p className="text-lg font-semibold text-slate-900">File Already Imported</p>
              <p className="max-w-md text-sm text-slate-600">{state.duplicateImport.message}</p>
              {state.duplicateImport.previousImport && (
                <p className="max-w-md text-sm text-slate-600">
                  {state.duplicateImport.previousImport.fileName} &middot; {Number(state.duplicateImport.previousImport.successfulRows).toLocaleString()} rows
                </p>
              )}
              <Link
                href={`/dashboard/imports/${state.duplicateImport.existingImportId}`}
                className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700"
              >
                View existing import
              </Link>
            </>
          ) : state.submitError ? (
            <>
              <p className="text-lg font-semibold text-slate-900">We couldn&apos;t start the import</p>
              <p className="max-w-md text-sm text-slate-600">{state.submitError}</p>
              <button
                type="button"
                onClick={() => {
                  dispatch({ step: 3, type: 'GO_TO_STEP' });
                }}
                className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700"
              >
                Back to review
              </button>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-slate-900">Uploading {state.file?.name}</p>
              <div className="w-full max-w-sm">
                <ProgressBar percent={state.uploadProgress ?? 0} />
              </div>
              <p className="text-sm text-slate-500">{state.uploadProgress ?? 0}%</p>
            </>
          )}
        </div>
      )}
```

Add the `Link` import at the top: `import Link from 'next/link';`

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @schemaiq/web test -- new/page.spec.tsx`
Expected: PASS

- [ ] **Step 9: Full frontend verification**

Run: `pnpm --filter @schemaiq/web typecheck && pnpm --filter @schemaiq/web test`
Expected: no type errors; all suites pass.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/api-client.ts apps/web/lib/api-client.spec.ts apps/web/app/dashboard/imports/new/page.tsx apps/web/app/dashboard/imports/new/page.spec.tsx
git commit -m "feat: show a clear duplicate-import state in the CSV import wizard"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the complete backend and frontend suites**

Run: `pnpm --filter @schemaiq/api test && pnpm --filter @schemaiq/web test`
Expected: PASS, all suites (this should now be 162 + N new backend tests, 144 + N new frontend tests).

- [ ] **Step 2: Root-level checks**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: all three pass clean across every workspace.

- [ ] **Step 3: Manual smoke test (if a real Postgres connection is available)**

Run `pnpm --filter @schemaiq/api migration:run` against a real dev database, then:
1. Upload the same CSV file twice into the same schema/table — the second attempt should return `409 DUPLICATE_IMPORT` (if the first completed) or `409 IMPORT_ALREADY_IN_PROGRESS` (if the first is still queued/processing).
2. Rename the file and upload it again — still rejected as a duplicate (same content hash).
3. Query `\d data_imports` and confirm the `file_hash` column and `UQ_data_imports_active_file_hash` index exist.
4. Retry a cancelled import (cancel one while `QUEUED`, then call retry) — confirm it re-queues successfully.

- [ ] **Step 4: Update the spec's phase status**

In `docs/superpowers/specs/2026-09-05-csv-import-hardening-design.md`, add a line under §4 noting Phase A is implemented and tested, so a future session picking up Phase B/C has an accurate status.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-05-csv-import-hardening-design.md
git commit -m "docs: mark CSV import Phase A (duplicate protection) as implemented"
```
