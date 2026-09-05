# Milestone 3.6 — CSV Import Frontend & End-to-End Flow — Design

Status: Approved. Implementation tracked via `writing-plans`.

## 1. Goal

Build the frontend for the existing, working CSV-import backend (`apps/api/src/imports`) and wire it end-to-end: application shell, imports overview, guided upload wizard, live import-detail page, retry/cancel, and a real E2E pass against the dev stack. Frontend-focused; the backend is not redesigned, only extended with small, read-only, already-typed additions.

## 2. Verified backend contract (source of truth: `apps/api/src/imports`, `packages/types/src/index.ts`, `docs/api/README.md`)

### 2.1 Routes (existing, unchanged), all under global prefix `/api/v1`

| Method | Path | Notes |
|---|---|---|
| POST | `/imports/csv` | `multipart/form-data`, file field **`file`**. Body fields: `targetSchema` (string, 1-63), `targetTable` (string, 1-63), `delimiter` (1 char, default `,`), `columnMapping` (optional JSON-encoded string: `Record<csvHeader, targetColumn>`, ≤1000 entries, each 1-1024 chars). Returns `201` normally, `202` when `processingMode === QUEUED`. **Validation of target schema/table/columns happens inside this call for both sync and queued paths** — a bad target does not produce an HTTP error; it produces a normal success status code with body `status: "FAILED"`. The frontend must branch on response body `status`, never on HTTP status alone. |
| GET | `/imports` | Query: `page` (default 1), `limit` (default 20, max 100), `status` (enum, **currently ignored by service — see §3.4**), `search` (string ≤255, **currently ignored — see §3.4**). Response: `{ items: DataImportApiResponse[], total: number }`. No `page`/`pageSize` echoed. |
| GET | `/imports/:id` | UUID v4 param. Response: `DataImportApiResponse`. |
| POST | `/imports/:id/retry` | Only from `FAILED`. Reuses the stored file and original mapping — no re-upload, no remapping. Fails 404 if the file was already cleaned up (retention window passed). |
| POST | `/imports/:id/cancel` | Only from `QUEUED`. `PROCESSING` cannot be cancelled (no such status transition exists). |
| DELETE | `/imports/:id` | Only from a terminal status (`COMPLETED`/`FAILED`/`CANCELLED`). `204`. Deletes the SchemaIQ import record + retained file only — **never** touches rows already copied into Postgres. |

All routes require a dev-only `x-organization-id` header (a UUID). No authentication exists; this header is rejected outright in production. There is no organizations list/create API anywhere in the repo.

### 2.2 Enums (verbatim, from `@schemaiq/types`, re-exported by `apps/api/src/imports/enums/*`)

```
DataImportStatus: UPLOADED | VALIDATING | QUEUED | PROCESSING | COMPLETED | FAILED | CANCELLED
DataImportProcessingMode: SYNCHRONOUS | QUEUED
```

No `PARTIALLY_COMPLETED` exists — do not build UI for it.

Transitions: `UPLOADED→VALIDATING,FAILED`; `VALIDATING→QUEUED,PROCESSING,FAILED`; `QUEUED→PROCESSING,FAILED,CANCELLED`; `PROCESSING→COMPLETED,FAILED`; `COMPLETED/CANCELLED` terminal; `FAILED→QUEUED` (this is what retry does).

### 2.3 Error codes

`DataImportErrorCode` has 13 members but only 5 are ever actually produced (mapped from raw Postgres SQLSTATE inside `ImportsService.errorDetails`):

```
22P02 → IMPORT_POSTGRES_TYPE_ERROR      "CSV values do not match the target column types"
23503 → IMPORT_FOREIGN_KEY_VIOLATION    "CSV values violate a target foreign-key constraint"
23505 → IMPORT_DUPLICATE_VALUE          "CSV values violate a unique target constraint"
23502 → IMPORT_CONSTRAINT_VIOLATION     "CSV values violate a required target constraint"
57014 → IMPORT_TIMEOUT                  "CSV import exceeded its time limit"
(any other failure, incl. bad schema/table/header/mapping/oversize/missing file)
       → IMPORT_COPY_FAILED             "CSV import failed safely"
```

The resource only ever carries flat `errorCode: DataImportErrorCode | null` + `errorMessage: string | null` (≤500 chars). **There is no row number, column name, expected value, or received value anywhere in the entity, DTOs, or types.** The FAILED screen must not fabricate this detail — show `errorCode`/`errorMessage` only, with the raw code available under a collapsed "Technical details" section.

### 2.4 Thresholds

`CSV_IMPORT_QUEUE_THRESHOLD_BYTES` (default 5 MiB) decides `SYNCHRONOUS` vs `QUEUED` at upload time — nothing else. `CSV_IMPORT_MAX_FILE_SIZE_BYTES` (default 1 GiB) is the hard multer cap. Both live in `AppConfigService.csvImport` and will be exposed via the new `/imports/config` endpoint (§3.2) instead of being hardcoded in the frontend.

### 2.5 `DataImportApiResponse` (full shape, all fields the UI can rely on)

```ts
{
  id: string; originalFileName: string; fileSizeBytes: string; mimeType: string;
  targetSchema: string; targetTable: string;
  status: DataImportStatus; processingMode: DataImportProcessingMode;
  delimiter: string; hasHeader: boolean;
  totalRows: string | null; processedRows: string; successfulRows: string; failedRows: string;
  processedBytes: string; progressPercent: number;
  errorCode: DataImportErrorCode | null; errorMessage: string | null;
  startedAt: string | null; completedAt: string | null; createdAt: string; updatedAt: string;
}
```
Numeric-looking fields that can exceed 2^53 are transported as `string` (`fileSizeBytes`, `*Rows`, `processedBytes`) — never `parseInt` and re-render as a JS number for anything that could be large; format with a bigint-safe formatter.

## 3. Backend additions (small, read-only, reuse existing services/types — the only backend work in this milestone)

All four additions live entirely inside the existing `imports` module; no new module, no entity/migration change, no change to upload/queue/processing logic.

### 3.1 Target metadata endpoints (the one addition explicitly pre-approved by the brief)

Add to `ImportsController` (inject the already-module-provided `PostgresTableMetadataService`):

```
GET /imports/targets/schemas                          -> ImportTargetSchemaResponse[]
GET /imports/targets/schemas/:schema/tables            -> ImportTargetTableResponse[]
GET /imports/targets/schemas/:schema/tables/:table     -> ImportTargetDetailsResponse
```
Reuse the existing (currently dead) `ImportTargetSchemaParamsDto`/`ImportTargetTableParamsDto` for param validation. Map directly to the `ImportTarget*Response` shapes already defined in `@schemaiq/types` — no new types. These calls run the existing policy filtering (`PostgresImportTargetPolicyService`), so blocked/system schemas and tables never appear in the picker.

### 3.2 Client configuration endpoint

```
GET /imports/config -> ImportClientConfigurationResponse
```
Straight passthrough of `AppConfigService.csvImport` fields (`maxFileSizeBytes`, `queueThresholdBytes`, `maxColumns`, `maxHeaderLength`, `allowedDelimiters`) — every field already exists in config, this is a mapping function, not new config.

### 3.3 Summary metrics endpoint

```
GET /imports/summary -> DataImportSummaryResponse
```
One grouped query over `data_imports`, scoped by `organizationId`: count total; count where `status = 'COMPLETED'`; count where `status IN ('UPLOADED','VALIDATING','QUEUED','PROCESSING')` (bucketed as "processing" per the UI's single metric); count where `status = 'FAILED'`; sum `successfulRows` where `status = 'COMPLETED'`. Returns strings for the row-count/sum fields to stay consistent with the bigint-as-string convention used elsewhere on this resource.

### 3.4 Activate the already-validated `status`/`search` query filters

`ImportsService.findAll()` currently ignores `status` and `search` even though `ImportQueryDto` validates both. Extend the `where` clause: `status` as an equality filter, `search` as a case-insensitive `ILike` on `originalFileName`. This is required for the overview page's filter UI (§5.2) to have any effect at all — without it, "Search by filename" and the status filter would be silently broken.

## 4. Frontend foundation

### 4.1 New dependencies

- `lucide-react` — icon library (none installed).
- `@tanstack/react-query` — server-state/polling. Justified over hand-rolled `fetch`+`useEffect` because this milestone has ~6 independent fetch call sites (imports list, import detail with strict start/stop polling, schemas list, tables list, table detail, summary, config) — one dependency replaces repeating polling/loading/error/caching logic six times.
- `vitest` + `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` — apps/web's current `"test"` script targets a nonexistent glob; this is the actual first frontend test runner.
- `@playwright/test` — real E2E against the dev stack.

No other dependencies. No UI framework (Radix/shadcn) — hand-built components per the brief's "create reusable components rather than importing a huge UI framework."

### 4.2 API client (`apps/web/lib/api-client.ts`)

One fetch wrapper: base URL from `NEXT_PUBLIC_API_URL` (default `http://localhost:3001/api/v1` for dev, matching the Postman collection default), attaches `x-organization-id` from the org context (§4.3), parses the documented error envelope `{ statusCode, code, message, requestId }` into a typed `ApiError { statusCode, code, message, requestId }`, and a small typed method per endpoint (list/get/create/retry/cancel/remove/schemas/tables/table/config/summary). File upload uses `FormData` with **no manual `Content-Type`** (browser sets the multipart boundary). Upload progress uses an `XMLHttpRequest`-based helper isolated in this same file (native `fetch` has no reliable upload-progress event across environments) — everything else in the app uses plain `fetch` via TanStack Query.

### 4.3 Organization/workspace context

No auth and no organizations API exist yet, so: a small client-side `OrganizationProvider` (React context) holds an org ID persisted to `localStorage` (`schemaiq.organizationId`), optionally seeded from `NEXT_PUBLIC_DEV_ORGANIZATION_ID` for local convenience. The header shows `Workspace: <id-truncated>` with a "Change" affordance opening a small inline UUID input (validated client-side with the same UUID-v4 shape the backend requires). Every data-dependent page checks context is set; if not, shows a plain "Set your development organization ID to continue" prompt instead of silently failing requests. This is explicitly a development convenience, not an authorization mechanism — the backend remains the sole authority (per `docs/SECURITY.md` §77, restated here as a constraint, not re-litigated).

### 4.4 Types

Zero redefinition. All status/mode/error enums and all response interfaces import directly from `@schemaiq/types`. Any UI-only type (wizard step state, mapping-row view state) lives in `apps/web` and is clearly not a backend contract type.

## 5. Screens

### 5.1 Shell

`app/dashboard/layout.tsx`: sidebar (SchemaIQ wordmark, Overview / Data Sources / Data Imports, divider, Settings) + header (page title/description slot, workspace indicator from §4.3). Sidebar collapses on mobile behind a toggle. Wraps `dashboard/*`.

### 5.2 `/dashboard` — Overview

Replaces the current "Foundation initialized successfully" stub. Eyebrow "DATABASE OPERATIONS" / heading / one-line description, then quick-action cards: Data Sources (marked "Coming soon"), CSV Imports (links to `/dashboard/imports`), Recent Activity (last few imports from `GET /imports?limit=5`, or an empty-state line if none).

### 5.3 `/dashboard/imports` — Imports overview

Header (eyebrow "DATA MANAGEMENT" / "CSV Data Imports" / description) + "Import CSV" CTA → `/dashboard/imports/new`. Metrics strip from `GET /imports/summary` (Total, Completed, Processing, Failed, Total Rows Imported — omit "Total Data Imported" since no byte-sum aggregate exists in the summary type; do not invent one). Filters: search (filename) + status dropdown, both driving `GET /imports` query params (now functional per §3.4). Table: File / Target / Status (`ImportStatusBadge`) / Progress-or-Rows / Size / Started / Completed-Duration / Actions (view, retry-if-failed, cancel-if-queued). Server-side pagination via `page`/`limit` + `total`. Empty state (no imports at all, ignoring filters) per the brief's illustration-via-icons treatment, not stock photography.

### 5.4 `/dashboard/imports/new` — Upload wizard

One page, `StepIndicator` (Upload → Destination → Map Columns → Review → Import), state in a single reducer local to the page component (no global state needed — this is a single-page linear flow).

1. **Upload** — `FileDropzone` (drag/drop + picker, `.csv` only, client-side size warning once `/imports/config` is loaded — never hardcode the threshold; if config hasn't loaded yet, don't show a contradictory guess). Selected-file summary with remove/change. Large-file banner (informational, not an error) once size exceeds the real `queueThresholdBytes`.
2. **Destination** — schema `Combobox` from `GET /imports/targets/schemas`, table `Combobox` from `GET /imports/targets/schemas/:schema/tables` (shows `columnCount`), then table detail summary (columns/required/generated counts) from `GET /imports/targets/schemas/:schema/tables/:table`. No free-text entry — selection only, backend remains authoritative at submit time regardless.
3. **Map Columns** — `ColumnMappingTable`: CSV headers (client-parsed from the first line + one sample row of the selected file, no upload needed yet) against target columns from step 2. Exact-name matches auto-map and show "Matched". Others get a destination dropdown (or "Do not import" — omitted from the submitted `columnMapping`, which the backend already supports since it's just a subset map) and show "Review"/"Unmapped". A required (`!isNullable && !hasDefault && !isGenerated && !isIdentity`) target column with no mapping blocks Continue with an inline warning — this is a real client-side check backed by real metadata, not a guess. Lightweight type-hint text (sample value vs target `dataType`) — heuristic only, explicitly not a guarantee.
4. **Review** — file/destination/mapping summary, processing-mode explanation driven by the real threshold, a static safety note about streaming/COPY (no new facts invented). Primary "Start Import" / secondary "Back".
5. **Import** — on submit: upload progress (XHR-based, real percentage) while the multipart request is in flight, then branch on the response: `202`/`QUEUED` → "queued" confirmation with a link to the detail page; `201` with `status: COMPLETED` → route straight to the detail page (already finished); `201` with `status: FAILED` → route to the detail page, which renders the FAILED state (§5.5) — no separate failure UI needs to be built in the wizard itself.

### 5.5 `/dashboard/imports/[id]` — Import detail

Polls `GET /imports/:id` via TanStack Query `refetchInterval`: 2500ms while status is `UPLOADED/VALIDATING/QUEUED/PROCESSING`, `false` (stops) once terminal. Hero (filename, `ImportStatusBadge`, target, started time). Per-status body:
- `QUEUED`: "Waiting in queue" copy, no fabricated percentage.
- `VALIDATING`: "Checking your CSV" with a subtle indeterminate indicator.
- `PROCESSING`: `ImportProgress` bar using real `progressPercent`/`processedBytes`/`fileSizeBytes`/`processedRows` (only shown if `totalRows` is non-null — never fabricate a row count), elapsed time from `startedAt`.
- `COMPLETED`: success summary — rows imported (`successfulRows`), data processed (`processedBytes`→formatted), duration (`completedAt - startedAt`), completed time. Actions: View Import Details (no-op here, already here) → "Import Another File" / "Return to Imports".
- `FAILED`: `ErrorPanel` — human copy derived from `errorCode` (a small fixed lookup table mapping the 5 real codes + a generic fallback to a friendly sentence), collapsed "Technical details" showing the raw `errorCode`. Actions: Retry (only if not already pending, disabled while the retry mutation is in flight, single-fire), "Import Another File". No "Review Mapping" action, since retry cannot change mapping (§2.1) — do not imply otherwise.
- `CANCELLED`: plain "Import cancelled" state, "Import Another File".
Cancel button shown only while `QUEUED`, behind a `ConfirmDialog` ("Cancel this import? The file will not be imported."). Delete (from the overview row menu) behind a `ConfirmDialog` with the exact required wording: "This removes the SchemaIQ import record and retained source file where applicable. It does not delete data already imported into PostgreSQL."

### 5.6 `/dashboard/data-sources` and `/dashboard/settings`

Data Sources: explicit "Coming soon" stub — building its real UI is out of this milestone even though the backend exists. Settings: hosts the workspace/org-id control from §4.3 (this one is fully functional, not a stub).

## 6. Component inventory

`PageHeader`, `SectionLabel`, `Metric`, `ImportStatusBadge`, `ProgressBar`, `EmptyState`, `FileDropzone`, `FileSummary`, `StepIndicator`, `ColumnMappingTable`, `ImportSummary`, `ImportProgress`, `ErrorPanel`, `ConfirmDialog`, `DataTable`, `Pagination`, `Skeleton` — each in its own file under `apps/web/components/{layout,imports,ui}`, per the brief's explicit ask to avoid one giant page component.

## 7. Testing

### 7.1 Vitest + RTL (component/unit)

`ImportStatusBadge` status→label/icon mapping; file-type/size validation messaging; wizard step navigation (including the required-column block on Continue); mapping auto-match + manual override + "do not import"; detail-page rendering per status (queued/validating/processing/completed/failed/cancelled); retry/cancel button disable-while-pending + single-fire; polling stop after a terminal status (fake timers + mocked query client); API-error envelope rendering (network failure, 500, expired-org-context 401).

### 7.2 Playwright E2E (real stack)

Run against `docker-compose` Postgres+Redis + the real API + the real web app (this environment has Docker and can run this for real, not just author the tests): small-CSV happy path (upload → map → review → start → COMPLETED, history row appears); large generated CSV exceeding `queueThresholdBytes` (generated at test-setup time, not committed) verifying `202`/QUEUED → PROCESSING → COMPLETED with visible progress transitions; a CSV with a deliberately incompatible value (e.g. `age = "twenty five"` against an integer column) verifying a clean FAILED render with no raw stack trace/SQL leakage, and a working Retry action.

## 8. Explicitly out of scope

Data Sources frontend build-out, authentication, Spec/RAG work, MySQL customer-schema browsing, `PARTIALLY_COMPLETED` UI (status doesn't exist), fabricated metrics/progress of any kind.

## 9. Documentation updates on completion

`docs/ARCHITECTURE.md` (CSV Import Frontend / Upload Workflow / Import Monitoring sections), `docs/ROADMAP.md` (3.6 → Completed, only after E2E passes), `CLAUDE.md`/`AGENTS.md` (new frontend conventions: API client pattern, `@schemaiq/types` reuse rule, TanStack Query polling convention) if any new durable rule emerges from implementation.
