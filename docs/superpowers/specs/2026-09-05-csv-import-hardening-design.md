# CSV Import Hardening — Schema-Aware, Duplicate-Safe Import Engine

## 1. Problem

The existing CSV import pipeline (Milestone 3.5/3.6 + the create-table extension) has two structural gaps:

1. **No datatype awareness.** `PostgresCopyService` pipes the raw uploaded file byte-for-byte into `COPY FROM STDIN`; Postgres itself parses and casts every value. One row with a value that doesn't match the destination column's type aborts the *entire* `COPY` — because `COPY` runs as a single transaction, zero rows commit even if the file had a million valid rows before the bad one. There is no column-name normalization, no per-row validation, no preview, and no way to skip bad rows and keep the good ones.
2. **No duplicate protection.** The same file (or a byte-identical copy under a different filename) can be uploaded and imported into the same table any number of times, each producing a fresh set of duplicate rows. Nothing keys off file content, and nothing stops two concurrent requests from both starting a job for the same file at the same time.

This spec covers a schema-aware, datatype-aware, idempotent import engine that closes both gaps while reusing the existing upload/queue/worker/COPY architecture rather than replacing it.

## 2. Current architecture (ground truth, confirmed by direct inspection)

- **Upload**: `CsvImportUploadInterceptor` (multer, inline `StorageEngine`) → `ImportFileStorage.store()` (disk-backed `LocalImportFileStorage`, UUID filenames, `wx` flag).
- **Persistence**: single `data_imports` table (TypeORM `DataImportEntity`), status enum `UPLOADED → VALIDATING → {QUEUED|PROCESSING} → {COMPLETED|FAILED}`, plus `CANCELLED` from `QUEUED`. No unique constraints beyond the PK.
- **Queue**: BullMQ `Queue`/`Worker` (`ImportQueueService`/`ImportWorkerService`), queue name `schemaiq-data-import`. New jobId per enqueue (`randomUUID()`). **No `attempts`/`backoff` configured** — a failed BullMQ job never auto-retries; all retry is application-level (`ImportsService.retry()`, which creates a brand-new job).
- **COPY**: `PostgresCopyService.copy()` opens `BEGIN`, sets a scoped `statement_timeout`, pipes the **raw upload stream directly** through a byte-counting `Transform` (progress only, no data change) into `pg-copy-streams`' `copyFrom(command)`, then `COMMIT`. **No row-level parsing, transformation, or chunking exists today** — Postgres parses the CSV itself per the `FORMAT csv` clause. A bad value anywhere in the file rolls back the whole transaction; zero rows land.
- **Retry**: only `FAILED` imports are retryable, and only while the stored file still exists. Retry resets all counters to zero/null and status to `QUEUED`, then enqueues a **new** BullMQ job — it fully re-runs `COPY` from row 0. Because `COPY` is all-or-nothing, a `FAILED` row is, by construction, always at zero committed rows — there is nothing to "resume."
- **Reserved-but-unbuilt**: `data_import_errors` is already in `PostgresImportTargetPolicyService`'s blocklist (so it can never itself become an import target) but has no entity, migration, or writer.

## 3. Scope decisions (confirmed)

- **No separate history table.** `data_imports` already *is* the import history entity; this work extends it in place rather than forking a parallel `data_import_jobs` table.
- **Duplicate detection is organization-scoped.** Unique key is `(organization_id, target_schema, target_table, file_hash)`, not just `(schema, table, file_hash)` — this app is multi-tenant throughout, and two unrelated organizations uploading byte-identical CSVs must never collide with each other.
- **`PARTIALLY_COMPLETED` means "flexible mode skipped some rows," not "resume after a crash."** The COPY pipeline stays single-transaction/single-invocation per import. Phase C's transform stage pre-filters invalid rows so only valid ones ever reach `COPY`; true crash-resumable chunked COPY (multiple commits, resume from last checkpoint) is explicitly out of scope — it solves a different failure mode (process crashes) than the one this spec addresses (bad data).
- **`data_import_errors` is built now** (Phase C) to back flexible-mode failed-row reporting and the import preview's per-row error list — its name is already reserved for exactly this purpose.

## 4. Delivery phases

Each phase is independently shippable and gets verified (tests/lint/typecheck/build) before the next starts.

- **Phase A — Duplicate/idempotency protection** — **Implemented and tested** (`docs/superpowers/plans/2026-09-05-csv-import-duplicate-protection.md`, all 8 tasks complete). 181 backend + 146 frontend tests passing; root `lint`/`typecheck`/`build` all clean. The migration (`1788500000000-csv-import-duplicate-protection.ts`) has **not yet been run** against any live database — run `pnpm --filter @schemaiq/api migration:run` before relying on this in a running environment.
- **Phase B — Mandatory `created_at`/`updated_at` on created tables** — **Implemented and tested.** `PostgresTableMetadataService.createTable()` now appends both columns (unless the caller already supplied one) and attaches a shared `set_updated_at()` trigger, skipping it only if the caller's own `updated_at` column isn't `timestamptz`.
- **Phase C — Schema-aware datatype transformation, validation, strict/flexible modes** — **Implemented and tested**, with two deliberate scope reductions from the original outline (documented inline in code/commits, not hidden): (1) no separate `POST /preview` endpoint — validation runs as part of the normal create-import call, and strict-mode failures surface immediately with the specific row's error, which covers the same "don't silently fail" goal without a second upload round-trip; (2) column-mapping "suggestions" (exact/case-insensitive/normalized matching) were **not** implemented — the wizard still only auto-matches on an exact CSV-header-to-column-name match, same as before this work. `CsvImportProcessor` now parses, maps, transforms, and validates every row before any byte reaches `COPY`; `data_import_errors` persists per-row failures for flexible-mode review via `GET /imports/:id/errors`; `PARTIALLY_COMPLETED` is a real status with its own frontend state. The two Phase A/C migrations that add `PARTIALLY_COMPLETED` and the transformation-engine schema (`1788520000000...`, `1788530000000...`) have **not yet been run** against any live database, same as Phase A's migration.

---

## 5. Phase A — Duplicate/Idempotency Protection

### 5.1 Data model

New migration, additive to `data_imports` (no new table):

```sql
ALTER TABLE "data_imports" ADD COLUMN "file_hash" varchar(64) NOT NULL;

CREATE UNIQUE INDEX "UQ_data_imports_active_file_hash"
  ON "data_imports" ("organization_id", "target_schema", "target_table", "file_hash")
  WHERE "status" IN ('QUEUED', 'PROCESSING', 'COMPLETED');
```

This partial unique index is the concurrency-safe guard: two concurrent requests that both pass the application-level duplicate check can still only produce one row that satisfies the `WHERE` clause — the second `INSERT` raises Postgres error `23505`, which the service layer translates into the same duplicate response the app-level check would have given.

(Phase C's migration will `DROP`/recreate this index with `PARTIALLY_COMPLETED` added to the `WHERE` list, once that status exists.)

### 5.2 Hashing

New `apps/api/src/imports/hashing/file-hash.service.ts`:

```ts
@Injectable()
export class FileHashService {
  hash(source: Readable): Promise<string> {
    // pipes source through crypto.createHash('sha256'), resolves the hex digest
  }
}
```

Wired into `ImportFileStorage.store()` so the hash is computed in the **same streaming pass** that writes the file to disk — no second read of the upload. `store()`'s return type gains `fileHash: string` alongside the existing `fileReference`/`sizeBytes`. `LocalImportFileStorage` tees the incoming stream through the hash sink while writing.

`CsvImportUploadInterceptor`'s inline multer `StorageEngine._handleFile` callback already forwards `store()`'s result fields onto `Express.Multer.File` (that's how `file.filename`/`file.size` reach the controller today); `fileHash` is added the same way, requiring a small ambient type augmentation for `Express.Multer.File.fileHash`.

### 5.3 Duplicate check

New `apps/api/src/imports/hashing/duplicate-import.service.ts`:

```ts
@Injectable()
export class DuplicateImportService {
  async assertNotDuplicate(organizationId: string, targetSchema: string, targetTable: string, fileHash: string): Promise<void> {
    // queries data_imports for an existing row matching the key with status IN (QUEUED, PROCESSING, COMPLETED)
    // throws DuplicateImportException if found
  }
}
```

Called from `ImportsService.create()` immediately after the entity would otherwise be built, before `repository.save()`. On the DB-level race (two concurrent inserts both pass the app check), `repository.save()`'s unique-violation (`23505`) is caught and translated into the same exception — this is the actual concurrency guarantee; the app-level check is purely a fast-path/better-error-message optimization on top of it.

New `DuplicateImportException` (extends `ConflictException`, so it's still an `HttpException` and flows through the existing global exception pipeline) carries structured fields: `code` (`DUPLICATE_IMPORT` | `IMPORT_ALREADY_IN_PROGRESS`), `existingImportId`, `fileHash`, plus a summary of the prior import (`fileName`, `importedAt`, `totalRows`, `successfulRows`, `failedRows`) when the prior import is `COMPLETED`.

`GlobalExceptionFilter` gains one more special case — same established pattern already used for `DatasourceConnectionError` (the only other exception type allowed to carry a rich body instead of the generic sanitized `{statusCode, code, message, requestId}`): if the exception is a `DuplicateImportException`, use its own `code`/`message`/extra fields verbatim instead of the generic 400/409 text.

### 5.4 Retry-rule extension

`ImportsService.retry()` and `import-status.ts`'s transition table currently allow retry only from `FAILED`. Extend the allow-list to also include `CANCELLED` (today `cancel()` only succeeds while `QUEUED`, so a cancelled import always has zero committed rows — the same "nothing to lose" guarantee `FAILED` already has under `COPY`'s all-or-nothing semantics). No other change needed: `COMPLETED`/`PROCESSING`/`QUEUED` already reject retry via the existing state machine, which independently satisfies "block duplicate import" and "block re-import while active" from the spec.

### 5.5 API behavior

- Duplicate against a `COMPLETED` prior import → `409`, `code: DUPLICATE_IMPORT`.
- Duplicate against a `QUEUED`/`PROCESSING` prior import → `409`, `code: IMPORT_ALREADY_IN_PROGRESS`.
- Both cases return `existingImportId` so the frontend can link to it or poll its status.

### 5.6 Frontend

Wizard's upload/review step surfaces the 409 body as one of the states already described in the earlier CSV-import-frontend work's error handling (`ApiError` already carries `code`/`message`/structured fields through `apiFetch`) — add explicit copy for `DUPLICATE_IMPORT` ("This file has already been imported into `schema.table`. Imported <date>, `<successfulRows>` rows.") and `IMPORT_ALREADY_IN_PROGRESS` ("This file is currently being imported."), each linking to the existing import's detail page.

---

## 6. Phase B — Mandatory audit columns

`PostgresTableMetadataService.createTable()` is the single place tables get created (only ever called from `CsvImportProcessor.ensureTargetTable`) — no duplication risk to guard against.

- After building the caller-requested column definitions, append `created_at timestamptz NOT NULL DEFAULT now()` / `updated_at timestamptz NOT NULL DEFAULT now()` **unless** the requested column set already contains that exact name (checked against the same lowercase-sanitized identifiers the frontend already produces).
- A shared trigger function, created once via migration (`CREATE OR REPLACE FUNCTION set_updated_at() ...`, idempotent), is attached to every table this engine creates: `CREATE TRIGGER "trg_<table>_set_updated_at" BEFORE UPDATE ON "<schema>"."<table>" FOR EACH ROW EXECUTE FUNCTION set_updated_at()`. The trigger is skipped if the final `updated_at` column isn't `timestamptz` (e.g., the CSV itself defined a same-named column of a different type) — that's the caller's explicit column, left alone.
- Only applies to tables this engine creates. Existing tables selected for import are never retrofitted.

---

## 7. Phase C — Schema-aware datatype transformation (architecture outline; detailed spec follows once A/B ship)

Core pipeline change: `CsvImportProcessor` gains a transforming stream stage between `storage.openReadStream()` and `PostgresCopyService.copy()`'s source — `csv-parse` (already a dependency) parses rows, each row is column-mapped and passed through `DatatypeTransformerService.transformValue(value, targetColumn, options)`, valid transformed rows are re-serialized as CSV text into the `COPY` stream; invalid rows are recorded to `data_import_errors` and, in flexible mode, simply omitted from the outbound stream (never reach `COPY`). Strict mode aborts before any `COPY` starts if any row fails validation.

Planned modules, matching the layout already proposed: `mapping/column-mapper.service.ts` (exact/case-insensitive/normalized suggestions), `transformation/` (per-type transformers: integer, numeric, boolean, text, date, timestamp/timestamptz, uuid, json, array), `validation/import-validator.service.ts`, a new preview endpoint reusing the same transform pipeline against a row sample, and DTO additions (`importMode: 'strict' | 'flexible'`, optional `dateFormat`, array delimiter config). New `data_import_errors` entity/migration as described in §3.

---

## 8. Testing

Phase A: unit tests for `FileHashService` (streaming hash correctness, large-input behavior), `DuplicateImportService` (duplicate found/not-found per status), `ImportsService.create()` duplicate-check wiring, the DB-level unique-index race (two concurrent inserts via a direct-SQL test against the migration), retry-allow-list extension for `CANCELLED`, and the renamed-file-same-hash scenario (upload byte-identical content under two different filenames, confirm the second is rejected). Existing test suites (162 backend / 144 frontend) must stay green throughout.
