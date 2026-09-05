# Milestone 3.5 TDD evidence

## Source

Journeys and acceptance criteria were derived from the approved PostgreSQL CSV Bulk Import Backend specification.

## RED and GREEN evidence

| Behavior | RED evidence | GREEN evidence | Guarantee |
| --- | --- | --- | --- |
| CSV header, mapping, COPY rollback, storage, processing, queue, cleanup, and HTTP upload | Focused Jest tests initially failed while the import module and dependencies were absent. | Focused import test suites passed. | Uploads and COPY remain streamed; invalid headers, mappings, and COPY failures are contained. |
| Retry queue failure and COPY delimiter validation | `imports.service.spec.ts` and `environment.spec.ts` failed before the failure-path and delimiter checks were implemented. | The same focused command passed: 2 suites, 12 tests. | A failed enqueue restores `FAILED` with a sanitized response; unsafe delimiters are rejected at startup. |

## Test specification

Focused Jest tests cover quoted/invalid headers, target metadata and identifier policies, column mapping, file storage, COPY rollback, import state transitions, sync/queued orchestration, retry source retention, cleanup, worker lifecycle, and multipart controller behavior.

## Verification

`pnpm test:coverage` passed with the import source included: 32 suites / 130 tests, 90.13% statements, 83.11% branches, 89.62% functions, and 91.33% lines. Root lint, workspace typecheck, production build, and the full test suite are rerun after the final changes.

## Known gaps

There is no dedicated disposable PostgreSQL integration environment in the workspace, so COPY is transaction-tested with a native-client mock rather than against a live PostgreSQL instance. V1 deliberately has no row-level recovery, staging/upsert mode, cancellation of active COPY, or horizontally shared production storage.
