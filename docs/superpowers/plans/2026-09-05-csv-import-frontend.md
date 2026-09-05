# CSV Import Frontend & End-to-End Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Milestone 3.6 CSV import frontend (app shell, imports overview, upload wizard, live import-detail page) against the existing, working CSV-import backend, plus the small backend additions needed for a real end-to-end flow.

**Architecture:** Next.js App Router pages under `apps/web/app/dashboard/**` backed by a single typed API client and TanStack Query hooks; all enums/response shapes imported verbatim from `@schemaiq/types`. Four small read-only additions land in the existing `apps/api/src/imports` module (target-metadata endpoints, config endpoint, summary endpoint, activating already-validated query filters) — no new modules, no schema changes.

**Tech Stack:** NestJS (existing), Next.js 16 App Router + React 19 + TypeScript strict + Tailwind CSS v4, `@tanstack/react-query`, `lucide-react`, Vitest + React Testing Library (component tests), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-09-05-csv-import-frontend-design.md` — read it alongside this plan; this plan does not repeat its rationale, only the exact contracts and file-level instructions needed to implement it.

## Global Constraints

- Backend additions are read-only, reuse existing services/types, no entity/migration changes (spec §3).
- All enums/response types are imported from `@schemaiq/types` verbatim — never redefined (spec §4.4).
- Every API call carries the dev-only `x-organization-id` header (a UUID); there is no authentication yet (spec §2.1, §4.3).
- Fields that can exceed 2^53 (`fileSizeBytes`, `processedRows`, `successfulRows`, `failedRows`, `processedBytes`, `totalRows`) are strings end-to-end — never `parseInt`/`Number()` them for display of a value that could be large; format with the bigint-safe helpers from Task 8.
- Never fabricate progress, row counts, or metrics that the backend does not provide (spec §8).
- In `ImportsController`, the new literal `GET` routes (`config`, `summary`, `targets/schemas`, ...) must be declared **before** the existing `@Get(':id')` handler — Nest/Express match routes in declaration order, and `'config'`/`'summary'` are single-segment paths that `ParseUUIDPipe` on `:id` would otherwise swallow and reject.
- CORS already allows `http://localhost:3000` by default (`.env.example` `CORS_ORIGIN`) — no backend CORS change needed.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` must all pass before the milestone is considered done (`CLAUDE.md` "Completion"). Run the relevant subset after every task; run the full set in the final verification task.
- Shared Tailwind convention for every new component (defined once here, reused everywhere, no separate design-tokens file): page background `bg-slate-50`; card/surface `bg-white border border-slate-200 rounded-xl shadow-sm`; primary text `text-slate-900`; secondary text `text-slate-500`/`text-slate-600`; eyebrow label `text-xs font-semibold uppercase tracking-wider text-blue-600`; primary CTA `bg-blue-600 hover:bg-blue-700 text-white rounded-lg`; secondary button `border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg`; status colors — slate (`UPLOADED`/`CANCELLED`), amber (`VALIDATING`/`QUEUED`), blue (`PROCESSING`), emerald (`COMPLETED`), red (`FAILED`).

---

## Part A — Backend additions

### Task 1: Target-metadata endpoints (schemas / tables / table detail)

**Files:**
- Modify: `apps/api/src/imports/imports.controller.ts`
- Test: `apps/api/src/imports/imports.controller.spec.ts`

**Interfaces:**
- Consumes: `PostgresTableMetadataService.listSchemas(): Promise<string[]>`, `.listTables(schema: string): Promise<Array<{name: string; columnCount: number}>>`, `.getTable(schema: string, table: string): Promise<PostgresTableMetadata>` (all already exist in `apps/api/src/imports/postgres/postgres-table-metadata.service.ts`, already a provider in `imports.module.ts`); `ImportTargetSchemaParamsDto`/`ImportTargetTableParamsDto` (already exist in `apps/api/src/imports/dto/import-target.dto.ts`).
- Produces: `GET /api/v1/imports/targets/schemas`, `GET /api/v1/imports/targets/schemas/:schema/tables`, `GET /api/v1/imports/targets/schemas/:schema/tables/:table` — consumed by the frontend `imports-queries.ts` in Task 18.

- [x] **Step 1: Write the failing tests**

Add to `apps/api/src/imports/imports.controller.spec.ts`. First, extend the test module's providers (inside the existing `beforeAll`) with a metadata mock — add this above the `Test.createTestingModule` call, alongside the existing `const imports = {...}` declaration:

```ts
const metadata = { listSchemas: jest.fn(), listTables: jest.fn(), getTable: jest.fn() };
```

Add `PostgresTableMetadataService` to the imports at the top of the file:

```ts
import { PostgresTableMetadataService } from './postgres/postgres-table-metadata.service';
```

Add to the `providers` array inside `Test.createTestingModule` (alongside the existing `{ provide: ImportsService, useValue: imports }` entry):

```ts
{ provide: PostgresTableMetadataService, useValue: metadata },
```

Then add these test cases in the `describe('ImportsController', ...)` block:

```ts
it('lists allowed target schemas', async () => {
  metadata.listSchemas.mockResolvedValue(['public', 'analytics']);

  const response = await request(app.getHttpServer()).get('/imports/targets/schemas').expect(200);

  expect(response.body).toEqual([{ name: 'public' }, { name: 'analytics' }]);
});

it('lists tables for a target schema', async () => {
  metadata.listTables.mockResolvedValue([{ name: 'customers', columnCount: 12 }]);

  const response = await request(app.getHttpServer())
    .get('/imports/targets/schemas/public/tables')
    .expect(200);

  expect(metadata.listTables).toHaveBeenCalledWith('public');
  expect(response.body).toEqual([{ name: 'customers', columnCount: 12 }]);
});

it('returns column details for a target table', async () => {
  metadata.getTable.mockResolvedValue({
    schema: 'public',
    table: 'customers',
    columns: [{ name: 'id', dataType: 'uuid', isNullable: false, hasDefault: true, isGenerated: false, isIdentity: false }],
  });

  const response = await request(app.getHttpServer())
    .get('/imports/targets/schemas/public/tables/customers')
    .expect(200);

  expect(metadata.getTable).toHaveBeenCalledWith('public', 'customers');
  expect(response.body.table).toBe('customers');
});

it('still routes a UUID path to findOne after adding the targets/config/summary routes', async () => {
  imports.findOne.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000009', status: 'COMPLETED' });

  await request(app.getHttpServer())
    .get('/imports/00000000-0000-4000-8000-000000000009')
    .expect(200);

  expect(imports.findOne).toHaveBeenCalledWith(organizationId, '00000000-0000-4000-8000-000000000009');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @schemaiq/api test -- imports.controller.spec.ts`
Expected: FAIL — the new routes don't exist yet (404s), and `PostgresTableMetadataService` mock provider is unused until the controller requests it.

- [ ] **Step 3: Implement the routes**

In `apps/api/src/imports/imports.controller.ts`, add these imports:

```ts
import type {
  ImportTargetSchemaResponse,
  ImportTargetTableResponse,
  ImportTargetDetailsResponse,
} from '@schemaiq/types';

import { ImportTargetSchemaParamsDto, ImportTargetTableParamsDto } from './dto/import-target.dto';
import { PostgresTableMetadataService } from './postgres/postgres-table-metadata.service';
```

Change the constructor to inject the metadata service:

```ts
constructor(
  private readonly imports: ImportsService,
  private readonly organizationContext: OrganizationContextService,
  private readonly metadata: PostgresTableMetadataService,
) {}
```

Insert these three methods **immediately after `findAll` and before `findOne`** (this ordering is required — see Global Constraints):

```ts
@Get('targets/schemas')
async listTargetSchemas(): Promise<ImportTargetSchemaResponse[]> {
  const schemas = await this.metadata.listSchemas();
  return schemas.map((name) => ({ name }));
}

@Get('targets/schemas/:schema/tables')
listTargetTables(@Param() params: ImportTargetSchemaParamsDto): Promise<ImportTargetTableResponse[]> {
  return this.metadata.listTables(params.schema);
}

@Get('targets/schemas/:schema/tables/:table')
getTargetTable(@Param() params: ImportTargetTableParamsDto): Promise<ImportTargetDetailsResponse> {
  return this.metadata.getTable(params.schema, params.table);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @schemaiq/api test -- imports.controller.spec.ts`
Expected: PASS (all existing tests too — confirms no route-order regression).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/imports/imports.controller.ts apps/api/src/imports/imports.controller.spec.ts
git commit -m "feat(api): expose read-only import target schema/table/column endpoints"
```

---

### Task 2: Client-configuration endpoint

**Files:**
- Modify: `apps/api/src/imports/imports.service.ts`
- Modify: `apps/api/src/imports/imports.controller.ts`
- Test: `apps/api/src/imports/imports.service.spec.ts`
- Test: `apps/api/src/imports/imports.controller.spec.ts`

**Interfaces:**
- Consumes: `AppConfigService.csvImport` (already injected into `ImportsService` as `this.config`; fields `maxFileSizeBytes`, `queueThresholdBytes`, `maxColumns`, `maxHeaderLength`, `allowedDelimiters` all already exist).
- Produces: `ImportsService.getClientConfiguration(): ImportClientConfiguration` (internal type, already defined in `imports.types.ts`, currently unused); `GET /api/v1/imports/config -> ImportClientConfigurationResponse` — consumed by the frontend in Task 18/21.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/imports/imports.service.spec.ts`, inside the existing `describe('ImportsService', ...)` block:

```ts
it('maps csvImport config to the client configuration shape', () => {
  const { service } = setup();

  const config = service.getClientConfiguration();

  expect(config).toEqual({
    maxFileSizeBytes: expect.any(Number),
    queueThresholdBytes: 5,
    maxColumns: expect.any(Number),
    maxHeaderLength: expect.any(Number),
    allowedDelimiters: expect.any(Array),
  });
});
```

This will fail to compile until `setup()`'s mocked `AppConfigService` includes the other fields — update the mocked config object inside `setup()` (currently `{ csvImport: { queueThresholdBytes: 5 } }`) to:

```ts
{
  csvImport: {
    allowedDelimiters: [',', ';', '|'],
    maxColumns: 200,
    maxFileSizeBytes: 1_073_741_824,
    maxHeaderLength: 256,
    queueThresholdBytes: 5,
  },
}
```

Add to `apps/api/src/imports/imports.controller.spec.ts`:

```ts
it('returns the client configuration', async () => {
  imports.getClientConfiguration = jest.fn().mockReturnValue({
    maxFileSizeBytes: 1_073_741_824,
    queueThresholdBytes: 5_242_880,
    maxColumns: 200,
    maxHeaderLength: 256,
    allowedDelimiters: [',', ';', '|'],
  });

  const response = await request(app.getHttpServer()).get('/imports/config').expect(200);

  expect(response.body.queueThresholdBytes).toBe(5_242_880);
});
```

(Also add `getClientConfiguration: jest.fn(), summary: jest.fn(),` to the shared `const imports = {...}` mock object declared near the top of the file, so later tasks don't need to redeclare it.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @schemaiq/api test -- imports.service.spec.ts imports.controller.spec.ts`
Expected: FAIL — `getClientConfiguration` doesn't exist on the service, and `GET /imports/config` 404s.

- [ ] **Step 3: Implement**

In `apps/api/src/imports/imports.service.ts`, add the import at the top:

```ts
import type { ImportClientConfiguration } from './imports.types';
```

(it's already exported from `imports.types.ts` — just add it to the existing `import type { ... } from './imports.types';` line's named list instead of a separate line if that line already exists).

Add this public method (anywhere among the other public methods, e.g. right after `findAll`):

```ts
getClientConfiguration(): ImportClientConfiguration {
  return {
    allowedDelimiters: [...this.config.csvImport.allowedDelimiters],
    maxColumns: this.config.csvImport.maxColumns,
    maxFileSizeBytes: this.config.csvImport.maxFileSizeBytes,
    maxHeaderLength: this.config.csvImport.maxHeaderLength,
    queueThresholdBytes: this.config.csvImport.queueThresholdBytes,
  };
}
```

In `apps/api/src/imports/imports.controller.ts`, add the import:

```ts
import type { ImportClientConfigurationResponse } from '@schemaiq/types';
```

Add this method **immediately after `findAll` and before the target-schema methods from Task 1** (still ahead of `findOne`):

```ts
@Get('config')
getClientConfiguration(): ImportClientConfigurationResponse {
  return this.imports.getClientConfiguration();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @schemaiq/api test -- imports.service.spec.ts imports.controller.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/imports/imports.service.ts apps/api/src/imports/imports.controller.ts apps/api/src/imports/imports.service.spec.ts apps/api/src/imports/imports.controller.spec.ts
git commit -m "feat(api): expose CSV import client configuration endpoint"
```

---

### Task 3: Summary metrics endpoint

**Files:**
- Modify: `apps/api/src/imports/imports.service.ts`
- Modify: `apps/api/src/imports/imports.controller.ts`
- Test: `apps/api/src/imports/imports.service.spec.ts`
- Test: `apps/api/src/imports/imports.controller.spec.ts`

**Interfaces:**
- Consumes: `this.repository.count(options)`, `this.repository.createQueryBuilder(alias)` (TypeORM `Repository<DataImportEntity>`, already injected).
- Produces: `ImportsService.summary(organizationId: string): Promise<DataImportSummary>` (internal type, already defined in `imports.types.ts`); `GET /api/v1/imports/summary -> DataImportSummaryResponse` — consumed by the frontend `imports-queries.ts` (Task 18) and `ImportsMetrics` (Task 19).

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/imports/imports.service.spec.ts`'s `setup()` function, inside the `repository` object literal (which currently has `create`, `delete`, `find`, `findAndCount`, `findOne`, `save`, `update`), add two more mocked methods:

```ts
count: jest.fn(),
createQueryBuilder: jest.fn(),
```

Add this test to the `describe('ImportsService', ...)` block:

```ts
it('aggregates organization-scoped import counts and completed row totals', async () => {
  const { repository, service } = setup();
  repository.count = jest
    .fn()
    .mockResolvedValueOnce(10) // total
    .mockResolvedValueOnce(6) // completed
    .mockResolvedValueOnce(2) // processing (uploaded/validating/queued/processing)
    .mockResolvedValueOnce(2); // failed
  const queryBuilder = {
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ sum: '48210' }),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
  };
  repository.createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);

  const summary = await service.summary(organizationId);

  expect(summary).toEqual({
    completedImports: '6',
    failedImports: '2',
    processingImports: '2',
    totalImports: '10',
    totalRowsImported: '48210',
  });
});

it('reports zero rows imported when no import has completed yet', async () => {
  const { repository, service } = setup();
  repository.count = jest.fn().mockResolvedValue(0);
  const queryBuilder = {
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(undefined),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
  };
  repository.createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);

  const summary = await service.summary(organizationId);

  expect(summary.totalRowsImported).toBe('0');
});
```

Add to `apps/api/src/imports/imports.controller.spec.ts`:

```ts
it('returns the organization import summary', async () => {
  imports.summary = jest.fn().mockResolvedValue({
    completedImports: '6',
    failedImports: '2',
    processingImports: '2',
    totalImports: '10',
    totalRowsImported: '48210',
  });

  const response = await request(app.getHttpServer()).get('/imports/summary').expect(200);

  expect(imports.summary).toHaveBeenCalledWith(organizationId);
  expect(response.body.totalImports).toBe('10');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @schemaiq/api test -- imports.service.spec.ts imports.controller.spec.ts`
Expected: FAIL — `service.summary` and `GET /imports/summary` don't exist yet.

- [ ] **Step 3: Implement**

In `apps/api/src/imports/imports.service.ts`, add to the top-level `typeorm` import (currently `import type { Repository } from 'typeorm';`):

```ts
import { In } from 'typeorm';
import type { Repository } from 'typeorm';
```

Add to the `import type { ... } from './imports.types';` named list: `DataImportSummary`.

Add this method (after `getClientConfiguration` from Task 2):

```ts
async summary(organizationId: string): Promise<DataImportSummary> {
  const [totalImports, completedImports, processingImports, failedImports, completedSum] = await Promise.all([
    this.repository.count({ where: { organizationId } }),
    this.repository.count({ where: { organizationId, status: DataImportStatus.Completed } }),
    this.repository.count({
      where: {
        organizationId,
        status: In([
          DataImportStatus.Uploaded,
          DataImportStatus.Validating,
          DataImportStatus.Queued,
          DataImportStatus.Processing,
        ]),
      },
    }),
    this.repository.count({ where: { organizationId, status: DataImportStatus.Failed } }),
    this.repository
      .createQueryBuilder('import')
      .select('COALESCE(SUM(import.successfulRows), 0)', 'sum')
      .where('import.organizationId = :organizationId', { organizationId })
      .andWhere('import.status = :status', { status: DataImportStatus.Completed })
      .getRawOne<{ sum: string }>(),
  ]);
  return {
    completedImports: String(completedImports),
    failedImports: String(failedImports),
    processingImports: String(processingImports),
    totalImports: String(totalImports),
    totalRowsImported: completedSum?.sum ?? '0',
  };
}
```

In `apps/api/src/imports/imports.controller.ts`, add to the `@schemaiq/types` import list: `DataImportSummaryResponse`. Add this method (after `getClientConfiguration`, still before `findOne`):

```ts
@Get('summary')
getSummary(): Promise<DataImportSummaryResponse> {
  return this.imports.summary(this.organizationContext.getOrganizationId());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @schemaiq/api test -- imports.service.spec.ts imports.controller.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/imports/imports.service.ts apps/api/src/imports/imports.controller.ts apps/api/src/imports/imports.service.spec.ts apps/api/src/imports/imports.controller.spec.ts
git commit -m "feat(api): expose organization-scoped CSV import summary endpoint"
```

---

### Task 4: Activate `status`/`search` query filters on `findAll`

**Files:**
- Modify: `apps/api/src/imports/imports.service.ts`
- Modify: `apps/api/src/imports/imports.controller.ts`
- Test: `apps/api/src/imports/imports.service.spec.ts`
- Test: `apps/api/src/imports/imports.controller.spec.ts`

**Interfaces:**
- Consumes: `ImportQueryDto` (already validates `status?: DataImportStatus` and `search?: string`, already ignored by the service today).
- Produces: `ImportsService.findAll(organizationId, page, limit, status?, search?): Promise<{items, total}>` — the `status`/`search` parameters are new; every existing caller (the controller) is updated in this same task, so there is no other call site to chase.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/imports/imports.service.spec.ts`:

```ts
it('filters findAll by status when provided', async () => {
  const { repository, service } = setup();
  repository.findAndCount = jest.fn().mockResolvedValue([[], 0]);

  await service.findAll(organizationId, 1, 20, DataImportStatus.Failed);

  expect(repository.findAndCount).toHaveBeenCalledWith(
    expect.objectContaining({ where: { organizationId, status: DataImportStatus.Failed } }),
  );
});

it('filters findAll by a case-insensitive filename search when provided', async () => {
  const { repository, service } = setup();
  repository.findAndCount = jest.fn().mockResolvedValue([[], 0]);

  await service.findAll(organizationId, 1, 20, undefined, 'customers');

  const call = (repository.findAndCount as jest.Mock).mock.calls[0][0];
  expect(call.where.organizationId).toBe(organizationId);
  expect(call.where.originalFileName.toString()).toContain('customers');
});

it('omits status/search from the where clause when not provided', async () => {
  const { repository, service } = setup();
  repository.findAndCount = jest.fn().mockResolvedValue([[], 0]);

  await service.findAll(organizationId, 1, 20);

  expect(repository.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId } }));
});
```

Add to `apps/api/src/imports/imports.controller.spec.ts`:

```ts
it('forwards status and search query params to the service', async () => {
  imports.findAll.mockResolvedValue({ items: [], total: 0 });

  await request(app.getHttpServer())
    .get('/imports')
    .query({ limit: 10, page: 1, search: 'customers', status: 'FAILED' })
    .expect(200);

  expect(imports.findAll).toHaveBeenCalledWith(organizationId, 1, 10, 'FAILED', 'customers');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @schemaiq/api test -- imports.service.spec.ts imports.controller.spec.ts`
Expected: FAIL — `findAll` currently only accepts `(organizationId, page, limit)` and ignores the new arguments.

- [ ] **Step 3: Implement**

In `apps/api/src/imports/imports.service.ts`, add `ILike` to the `typeorm` import from Task 3 (`import { ILike, In } from 'typeorm';`). Replace the existing `findAll` method with:

```ts
async findAll(
  organizationId: string,
  page: number,
  limit: number,
  status?: DataImportStatus,
  search?: string,
): Promise<{ items: DataImportResponse[]; total: number }> {
  const [items, total] = await this.repository.findAndCount({
    order: { createdAt: 'DESC' },
    skip: (page - 1) * limit,
    take: limit,
    where: {
      organizationId,
      ...(status ? { status } : {}),
      ...(search ? { originalFileName: ILike(`%${search}%`) } : {}),
    },
  });
  return { items: items.map((item) => this.toResponse(item)), total };
}
```

In `apps/api/src/imports/imports.controller.ts`, update `findAll`:

```ts
@Get()
findAll(@Query() query: ImportQueryDto): Promise<{ items: DataImportResponse[]; total: number }> {
  return this.imports.findAll(
    this.organizationContext.getOrganizationId(),
    query.page,
    query.limit,
    query.status,
    query.search,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @schemaiq/api test -- imports.service.spec.ts imports.controller.spec.ts`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite and commit**

Run: `pnpm --filter @schemaiq/api test && pnpm --filter @schemaiq/api typecheck && pnpm --filter @schemaiq/api lint`
Expected: all green — this closes out every backend change in this milestone.

```bash
git add apps/api/src/imports/imports.service.ts apps/api/src/imports/imports.controller.ts apps/api/src/imports/imports.service.spec.ts apps/api/src/imports/imports.controller.spec.ts
git commit -m "feat(api): activate status and filename search filters on GET /imports"
```

---

## Part B — Frontend foundation

### Task 5: Frontend dependencies, test/E2E scaffolding, and bigint-safe formatting helpers

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest.setup.ts`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/lib/format.ts`
- Test: `apps/web/lib/format.spec.ts`

**Interfaces:**
- Produces: `formatBytes(value: string | number): string`, `formatRowCount(value: string): string`, `formatDuration(startedAt: string | null, endedAt: string | null): string` — consumed by `ImportsHistoryTable` (Task 19), `ImportProgress`/detail page (Tasks 26–27), `FileSummary` (Task 21).

- [ ] **Step 1: Add dependencies and test/E2E config**

Replace `apps/web/package.json` in full:

```json
{
  "name": "@schemaiq/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "predev": "pnpm --filter @schemaiq/shared build && pnpm --filter @schemaiq/types build",
    "dev": "next dev --port ${WEB_PORT:-3000}",
    "build": "next build --webpack",
    "start": "next start --port ${WEB_PORT:-3000}",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@schemaiq/shared": "workspace:*",
    "@schemaiq/types": "workspace:*",
    "@tanstack/react-query": "^5.59.0",
    "lucide-react": "^0.462.0",
    "next": "^16.3.4",
    "react": "^19.2.8",
    "react-dom": "^19.2.8"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@tailwindcss/postcss": "^4.3.3",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/node": "^24.3.0",
    "@types/react": "^19.1.12",
    "@types/react-dom": "^19.1.9",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "tailwindcss": "^4.3.3",
    "typescript": "^5.9.3",
    "vitest": "^3.0.0"
  }
}
```

Create `apps/web/vitest.config.ts`:

```ts
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    exclude: ['node_modules', '.next', 'e2e'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
});
```

Create `apps/web/vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

Create `apps/web/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: 'list',
  timeout: 120_000,
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  workers: 1,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

- [ ] **Step 2: Install dependencies**

Run: `pnpm install` (from the repo root)
Expected: lockfile updates, no errors. If a pinned version fails to resolve, bump it to the latest available minor/patch of the same major and re-run.

- [ ] **Step 3: Write the failing test**

Create `apps/web/lib/format.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { formatBytes, formatDuration, formatRowCount } from './format';

describe('formatBytes', () => {
  it('renders zero and small byte counts without decimals', () => {
    expect(formatBytes('0')).toBe('0 B');
    expect(formatBytes(500)).toBe('500 B');
  });

  it('renders kilobyte, megabyte, and gigabyte magnitudes with one decimal', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1_500_000)).toBe('1.4 MB');
    expect(formatBytes('1073741824')).toBe('1.0 GB');
  });
});

describe('formatRowCount', () => {
  it('adds thousands separators', () => {
    expect(formatRowCount('2431994')).toBe('2,431,994');
  });

  it('falls back to the raw string for a non-numeric value', () => {
    expect(formatRowCount('not-a-number')).toBe('not-a-number');
  });
});

describe('formatDuration', () => {
  it('formats a sub-minute duration in seconds', () => {
    expect(formatDuration('2026-09-05T09:45:00.000Z', '2026-09-05T09:45:45.000Z')).toBe('45s');
  });

  it('formats a multi-minute duration in minutes and seconds', () => {
    expect(formatDuration('2026-09-05T09:45:00.000Z', '2026-09-05T09:48:42.000Z')).toBe('3m 42s');
  });

  it('formats an hour-plus duration in hours and minutes', () => {
    expect(formatDuration('2026-09-05T09:00:00.000Z', '2026-09-05T10:12:00.000Z')).toBe('1h 12m');
  });

  it('returns a placeholder when either timestamp is missing', () => {
    expect(formatDuration(null, '2026-09-05T09:45:45.000Z')).toBe('—');
    expect(formatDuration('2026-09-05T09:45:00.000Z', null)).toBe('—');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @schemaiq/web test -- format.spec.ts`
Expected: FAIL — `./format` doesn't exist yet.

- [ ] **Step 5: Implement `apps/web/lib/format.ts`**

```ts
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatBytes(value: string | number): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${BYTE_UNITS[unitIndex]}`;
}

export function formatRowCount(value: string): string {
  try {
    return BigInt(value).toLocaleString('en-US');
  } catch {
    return value;
  }
}

export function formatDuration(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt || !endedAt) return '—';
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @schemaiq/web test -- format.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/vitest.config.ts apps/web/vitest.setup.ts apps/web/playwright.config.ts apps/web/lib/format.ts apps/web/lib/format.spec.ts pnpm-lock.yaml
git commit -m "feat(web): add test/E2E tooling and bigint-safe formatting helpers"
```

---

### Task 6: API client

**Files:**
- Create: `apps/web/lib/api-client.ts`
- Test: `apps/web/lib/api-client.spec.ts`

**Interfaces:**
- Consumes: `DataImportApiResponse`, `DataImportStatus`, `PaginatedDataImportsResponse`, `DataImportSummaryResponse`, `ImportClientConfigurationResponse`, `ImportTargetSchemaResponse`, `ImportTargetTableResponse`, `ImportTargetDetailsResponse` from `@schemaiq/types`.
- Produces: `ApiError` (class, fields `statusCode`, `code`, `requestId`), `importsApi.{list,get,retry,cancel,remove,summary,config,schemas,tables,tableDetails,uploadCsv}` — every later data-fetching task (18, 21, 22) calls these exact methods and no others.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/api-client.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, importsApi } from './api-client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('importsApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects with a friendly error when no organization is set', async () => {
    await expect(importsApi.get(null, 'import-1')).rejects.toMatchObject({ code: 'ORGANIZATION_CONTEXT_MISSING' });
  });

  it('builds the list query string and attaches the organization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], total: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    await importsApi.list('org-1', { limit: 20, page: 2, search: 'customers' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/imports?limit=20&page=2&search=customers');
    expect((init.headers as Record<string, string>)['x-organization-id']).toBe('org-1');
  });

  it('throws an ApiError built from the documented error envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ statusCode: 404, code: 'IMPORT_NOT_FOUND', message: 'Import not found', requestId: 'req-1' }, 404),
        ),
    );

    await expect(importsApi.get('org-1', 'missing')).rejects.toBeInstanceOf(ApiError);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ statusCode: 404, code: 'IMPORT_NOT_FOUND', message: 'Import not found', requestId: 'req-1' }, 404),
        ),
    );
    await expect(importsApi.get('org-1', 'missing')).rejects.toMatchObject({ code: 'IMPORT_NOT_FOUND', requestId: 'req-1' });
  });

  it('wraps a network failure in a friendly ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(importsApi.get('org-1', 'import-1')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('resolves undefined for a 204 No Content response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(importsApi.remove('org-1', 'import-1')).resolves.toBeUndefined();
  });
});

class FakeXhr {
  static instances: FakeXhr[] = [];
  method = '';
  url = '';
  status = 0;
  responseText = '';
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  requestHeaders: Record<string, string> = {};

  constructor() {
    FakeXhr.instances.push(this);
  }
  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string): void {
    this.requestHeaders[name] = value;
  }
  send(): void {
    // triggered manually by the test once it drives onprogress/onload
  }
}

describe('importsApi.uploadCsv', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeXhr.instances.length = 0;
  });

  it('uploads via XHR, reports progress, and resolves the parsed response', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest);
    const onProgress = vi.fn();
    const file = new File(['name,email\nA,a@example.com'], 'customers.csv', { type: 'text/csv' });

    const promise = importsApi.uploadCsv(
      'org-1',
      { delimiter: ',', file, targetSchema: 'public', targetTable: 'customers' },
      onProgress,
    );
    const xhr = FakeXhr.instances[0]!;
    expect(xhr.requestHeaders['x-organization-id']).toBe('org-1');
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    xhr.status = 202;
    xhr.responseText = JSON.stringify({ id: 'import-1', status: 'QUEUED' });
    xhr.onload?.();

    const result = await promise;
    expect(onProgress).toHaveBeenCalledWith(50);
    expect(result.status).toBe(202);
    expect(result.data).toMatchObject({ id: 'import-1', status: 'QUEUED' });
  });

  it('rejects with an ApiError when the upload fails', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest);
    const file = new File(['bad'], 'bad.csv', { type: 'text/csv' });

    const promise = importsApi.uploadCsv('org-1', { delimiter: ',', file, targetSchema: 'public', targetTable: 'customers' });
    const xhr = FakeXhr.instances[0]!;
    xhr.status = 400;
    xhr.responseText = JSON.stringify({ statusCode: 400, code: 'CSV_HEADER_INVALID', message: 'Invalid header', requestId: 'req-2' });
    xhr.onload?.();

    await expect(promise).rejects.toMatchObject({ code: 'CSV_HEADER_INVALID' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @schemaiq/web test -- api-client.spec.ts`
Expected: FAIL — `./api-client` doesn't exist yet.

- [ ] **Step 3: Implement `apps/web/lib/api-client.ts`**

```ts
import type {
  DataImportApiResponse,
  DataImportStatus,
  DataImportSummaryResponse,
  ImportClientConfigurationResponse,
  ImportTargetDetailsResponse,
  ImportTargetSchemaResponse,
  ImportTargetTableResponse,
  PaginatedDataImportsResponse,
} from '@schemaiq/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export interface ApiErrorPayload {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly requestId: string;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.statusCode = payload.statusCode;
    this.code = payload.code;
    this.requestId = payload.requestId;
  }
}

const ORGANIZATION_CONTEXT_MISSING: ApiErrorPayload = {
  statusCode: 401,
  code: 'ORGANIZATION_CONTEXT_MISSING',
  message: 'Set your development organization ID to continue.',
  requestId: 'local',
};

interface RequestOptions {
  method?: string;
  organizationId: string | null;
  body?: BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function apiFetch<T>(path: string, options: RequestOptions): Promise<T> {
  if (!options.organizationId) throw new ApiError(ORGANIZATION_CONTEXT_MISSING);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      body: options.body,
      headers: { 'x-organization-id': options.organizationId, ...options.headers },
      method: options.method ?? 'GET',
      signal: options.signal,
    });
  } catch {
    throw new ApiError({
      code: 'NETWORK_ERROR',
      message: 'SchemaIQ could not reach the server. Check your connection and try again.',
      requestId: 'local',
      statusCode: 0,
    });
  }

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const errorPayload = payload as Partial<ApiErrorPayload> | null;
    throw new ApiError({
      code: errorPayload?.code ?? 'UNKNOWN_ERROR',
      message: errorPayload?.message ?? 'Something went wrong. Please try again.',
      requestId: errorPayload?.requestId ?? 'unknown',
      statusCode: errorPayload?.statusCode ?? response.status,
    });
  }

  return payload as T;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export interface ListImportsParams {
  page: number;
  limit: number;
  status?: DataImportStatus;
  search?: string;
}

export interface CreateImportInput {
  file: File;
  targetSchema: string;
  targetTable: string;
  delimiter: string;
  columnMapping?: Record<string, string>;
}

export interface CreateImportResult {
  status: number;
  data: DataImportApiResponse;
}

export const importsApi = {
  cancel(organizationId: string | null, id: string): Promise<DataImportApiResponse> {
    return apiFetch(`/imports/${id}/cancel`, { method: 'POST', organizationId });
  },

  config(organizationId: string | null): Promise<ImportClientConfigurationResponse> {
    return apiFetch('/imports/config', { organizationId });
  },

  get(organizationId: string | null, id: string, signal?: AbortSignal): Promise<DataImportApiResponse> {
    return apiFetch(`/imports/${id}`, { organizationId, signal });
  },

  list(organizationId: string | null, params: ListImportsParams): Promise<PaginatedDataImportsResponse> {
    const query = buildQuery({ limit: params.limit, page: params.page, search: params.search, status: params.status });
    return apiFetch(`/imports${query}`, { organizationId });
  },

  remove(organizationId: string | null, id: string): Promise<void> {
    return apiFetch(`/imports/${id}`, { method: 'DELETE', organizationId });
  },

  retry(organizationId: string | null, id: string): Promise<DataImportApiResponse> {
    return apiFetch(`/imports/${id}/retry`, { method: 'POST', organizationId });
  },

  schemas(organizationId: string | null): Promise<ImportTargetSchemaResponse[]> {
    return apiFetch('/imports/targets/schemas', { organizationId });
  },

  summary(organizationId: string | null): Promise<DataImportSummaryResponse> {
    return apiFetch('/imports/summary', { organizationId });
  },

  tableDetails(organizationId: string | null, schema: string, table: string): Promise<ImportTargetDetailsResponse> {
    return apiFetch(`/imports/targets/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}`, {
      organizationId,
    });
  },

  tables(organizationId: string | null, schema: string): Promise<ImportTargetTableResponse[]> {
    return apiFetch(`/imports/targets/schemas/${encodeURIComponent(schema)}/tables`, { organizationId });
  },

  uploadCsv(
    organizationId: string | null,
    input: CreateImportInput,
    onProgress?: (percent: number) => void,
  ): Promise<CreateImportResult> {
    if (!organizationId) return Promise.reject(new ApiError(ORGANIZATION_CONTEXT_MISSING));

    const formData = new FormData();
    formData.set('file', input.file);
    formData.set('targetSchema', input.targetSchema);
    formData.set('targetTable', input.targetTable);
    formData.set('delimiter', input.delimiter);
    if (input.columnMapping) formData.set('columnMapping', JSON.stringify(input.columnMapping));

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE_URL}/imports/csv`);
      xhr.setRequestHeader('x-organization-id', organizationId);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onerror = () =>
        reject(
          new ApiError({
            code: 'NETWORK_ERROR',
            message: 'SchemaIQ could not reach the server. Check your connection and try again.',
            requestId: 'local',
            statusCode: 0,
          }),
        );
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
            message: errorPayload?.message ?? 'The upload could not be completed.',
            requestId: errorPayload?.requestId ?? 'unknown',
            statusCode: errorPayload?.statusCode ?? xhr.status,
          }),
        );
      };
      xhr.send(formData);
    });
  },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @schemaiq/web test -- api-client.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api-client.ts apps/web/lib/api-client.spec.ts
git commit -m "feat(web): add typed API client for the imports backend"
```

---

### Task 7: Organization/workspace context

**Files:**
- Create: `apps/web/lib/organization-context.tsx`
- Test: `apps/web/lib/organization-context.spec.tsx`

**Interfaces:**
- Produces: `OrganizationProvider` (component), `useOrganization(): { organizationId: string | null; setOrganizationId: (id: string | null) => void }`, `isValidOrganizationId(value: string): boolean` — consumed by the root layout (Task 8), the workspace indicator (Task 15), and every data-fetching hook (Task 18) which reads `organizationId` and passes it to `importsApi`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/organization-context.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { OrganizationProvider, isValidOrganizationId, useOrganization } from './organization-context';

function TestConsumer() {
  const { organizationId, setOrganizationId } = useOrganization();
  return (
    <div>
      <span data-testid="org-id">{organizationId ?? 'none'}</span>
      <button onClick={() => setOrganizationId('11111111-1111-4111-8111-111111111111')}>set</button>
      <button onClick={() => setOrganizationId(null)}>clear</button>
    </div>
  );
}

describe('OrganizationProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts with no organization when nothing is stored', () => {
    render(
      <OrganizationProvider>
        <TestConsumer />
      </OrganizationProvider>,
    );
    expect(screen.getByTestId('org-id')).toHaveTextContent('none');
  });

  it('persists a set organization id to localStorage', async () => {
    const user = userEvent.setup();
    render(
      <OrganizationProvider>
        <TestConsumer />
      </OrganizationProvider>,
    );

    await user.click(screen.getByText('set'));

    expect(screen.getByTestId('org-id')).toHaveTextContent('11111111-1111-4111-8111-111111111111');
    expect(window.localStorage.getItem('schemaiq.organizationId')).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('restores a previously stored organization id on mount', () => {
    window.localStorage.setItem('schemaiq.organizationId', '22222222-2222-4222-8222-222222222222');

    render(
      <OrganizationProvider>
        <TestConsumer />
      </OrganizationProvider>,
    );

    expect(screen.getByTestId('org-id')).toHaveTextContent('22222222-2222-4222-8222-222222222222');
  });

  it('clears the stored organization id', async () => {
    window.localStorage.setItem('schemaiq.organizationId', '22222222-2222-4222-8222-222222222222');
    const user = userEvent.setup();
    render(
      <OrganizationProvider>
        <TestConsumer />
      </OrganizationProvider>,
    );

    await user.click(screen.getByText('clear'));

    expect(screen.getByTestId('org-id')).toHaveTextContent('none');
    expect(window.localStorage.getItem('schemaiq.organizationId')).toBeNull();
  });

  it('throws when useOrganization is used outside the provider', () => {
    const renderOutsideProvider = () => render(<TestConsumer />);
    expect(renderOutsideProvider).toThrow('useOrganization must be used within an OrganizationProvider');
  });
});

describe('isValidOrganizationId', () => {
  it('accepts a v4 UUID', () => {
    expect(isValidOrganizationId('11111111-1111-4111-8111-111111111111')).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    expect(isValidOrganizationId('not-a-uuid')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @schemaiq/web test -- organization-context.spec.tsx`
Expected: FAIL — `./organization-context` doesn't exist yet.

- [ ] **Step 3: Implement `apps/web/lib/organization-context.tsx`**

```tsx
'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'schemaiq.organizationId';
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidOrganizationId(value: string): boolean {
  return UUID_V4_PATTERN.test(value.trim());
}

interface OrganizationContextValue {
  organizationId: string | null;
  setOrganizationId: (id: string | null) => void;
}

const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [organizationId, setOrganizationIdState] = useState<string | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    const seeded = stored ?? process.env.NEXT_PUBLIC_DEV_ORGANIZATION_ID ?? null;
    if (seeded) setOrganizationIdState(seeded);
  }, []);

  const setOrganizationId = (id: string | null): void => {
    setOrganizationIdState(id);
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable (e.g. private browsing) — in-memory state still works for this session.
    }
  };

  return <OrganizationContext.Provider value={{ organizationId, setOrganizationId }}>{children}</OrganizationContext.Provider>;
}

export function useOrganization(): OrganizationContextValue {
  const context = useContext(OrganizationContext);
  if (!context) throw new Error('useOrganization must be used within an OrganizationProvider');
  return context;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @schemaiq/web test -- organization-context.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/organization-context.tsx apps/web/lib/organization-context.spec.tsx
git commit -m "feat(web): add development organization/workspace context"
```

---

### Task 8: TanStack Query provider and root layout wiring

**Files:**
- Create: `apps/web/lib/query-provider.tsx`
- Test: `apps/web/lib/query-provider.spec.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: `QueryProvider` (component) — wraps the whole app in `layout.tsx`; every hook in Task 18 calls `useQuery`/`useMutation` from `@tanstack/react-query` and relies on this provider being an ancestor.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/query-provider.spec.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QueryProvider } from './query-provider';

function Probe() {
  const { data } = useQuery({ queryFn: () => Promise.resolve('ready'), queryKey: ['probe'] });
  return <span>{data ?? 'loading'}</span>;
}

describe('QueryProvider', () => {
  it('provides a working query client to descendants', async () => {
    render(
      <QueryProvider>
        <Probe />
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @schemaiq/web test -- query-provider.spec.tsx`
Expected: FAIL — `./query-provider` doesn't exist yet.

- [ ] **Step 3: Implement `apps/web/lib/query-provider.tsx`**

```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @schemaiq/web test -- query-provider.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Wire the providers into the root layout and switch to the light enterprise theme**

Replace `apps/web/app/layout.tsx` in full:

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { PRODUCT_NAME } from '@schemaiq/shared';

import { OrganizationProvider } from '../lib/organization-context';
import { QueryProvider } from '../lib/query-provider';

import './globals.css';

export const metadata: Metadata = {
  description: 'AI Database Intelligence Platform',
  title: PRODUCT_NAME,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <OrganizationProvider>{children}</OrganizationProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
```

Replace `apps/web/app/globals.css` in full:

```css
@import 'tailwindcss';

:root {
  color-scheme: light;
}

body {
  margin: 0;
  background: #f8fafc;
  color: #0f172a;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

Note: this is a deliberate, site-wide switch from the Milestone 0 dark placeholder theme to the light enterprise theme the brief asks for. `app/page.tsx` and `app/login/page.tsx` are untouched by this plan (out of scope) and will inherit the new light body tokens while keeping their own explicit dark utility classes on individual elements (e.g. the dashboard-teaser card's `bg-zinc-900/60`) — they'll look visually inconsistent against the new light body rather than broken. Call this out as a known limitation in the final report; do not scope-creep into redesigning them here.

- [ ] **Step 6: Run the full web test suite**

Run: `pnpm --filter @schemaiq/web test`
Expected: PASS (all tests from Tasks 5-8).

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/query-provider.tsx apps/web/lib/query-provider.spec.tsx apps/web/app/layout.tsx apps/web/app/globals.css
git commit -m "feat(web): wire TanStack Query and switch to the light enterprise theme"
```

---

### Task 9: Friendly error-code copy lookup

**Files:**
- Create: `apps/web/lib/error-copy.ts`
- Test: `apps/web/lib/error-copy.spec.ts`

**Interfaces:**
- Consumes: `DataImportErrorCode` from `@schemaiq/types`.
- Produces: `friendlyImportErrorMessage(code: string | null): string` — consumed by `ErrorPanel` (Task 26) and the detail page's FAILED view (Task 27).

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/error-copy.spec.ts`:

```ts
import { DataImportErrorCode } from '@schemaiq/types';
import { describe, expect, it } from 'vitest';

import { friendlyImportErrorMessage } from './error-copy';

describe('friendlyImportErrorMessage', () => {
  it('returns a specific message for each error code the backend actually produces', () => {
    expect(friendlyImportErrorMessage(DataImportErrorCode.ImportPostgresTypeError)).toContain("don't match the column types");
    expect(friendlyImportErrorMessage(DataImportErrorCode.ImportForeignKeyViolation)).toContain("don't exist in a related table");
    expect(friendlyImportErrorMessage(DataImportErrorCode.ImportDuplicateValue)).toContain('duplicate an existing unique value');
    expect(friendlyImportErrorMessage(DataImportErrorCode.ImportConstraintViolation)).toContain('missing or invalid');
    expect(friendlyImportErrorMessage(DataImportErrorCode.ImportTimeout)).toContain('took too long');
  });

  it('falls back to a generic safe message for IMPORT_COPY_FAILED and any other code', () => {
    expect(friendlyImportErrorMessage(DataImportErrorCode.ImportCopyFailed)).toBe(
      "The import couldn't be completed safely. No partial data was written.",
    );
    expect(friendlyImportErrorMessage(DataImportErrorCode.CsvFileTooLarge)).toBe(
      "The import couldn't be completed safely. No partial data was written.",
    );
  });

  it('falls back to the generic message when there is no error code', () => {
    expect(friendlyImportErrorMessage(null)).toBe("The import couldn't be completed safely. No partial data was written.");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @schemaiq/web test -- error-copy.spec.ts`
Expected: FAIL — `./error-copy` doesn't exist yet.

- [ ] **Step 3: Implement `apps/web/lib/error-copy.ts`**

```ts
import { DataImportErrorCode } from '@schemaiq/types';

const DEFAULT_ERROR_MESSAGE = "The import couldn't be completed safely. No partial data was written.";

const ERROR_COPY: Partial<Record<DataImportErrorCode, string>> = {
  [DataImportErrorCode.ImportPostgresTypeError]: "Some values in your CSV don't match the column types in the destination table.",
  [DataImportErrorCode.ImportForeignKeyViolation]: "Some values reference records that don't exist in a related table.",
  [DataImportErrorCode.ImportDuplicateValue]: 'Some values duplicate an existing unique value in the destination table.',
  [DataImportErrorCode.ImportConstraintViolation]: 'Some required values were missing or invalid for the destination table.',
  [DataImportErrorCode.ImportTimeout]: 'The import took too long and was stopped.',
};

export function friendlyImportErrorMessage(code: string | null): string {
  if (!code) return DEFAULT_ERROR_MESSAGE;
  return ERROR_COPY[code as DataImportErrorCode] ?? DEFAULT_ERROR_MESSAGE;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @schemaiq/web test -- error-copy.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/error-copy.ts apps/web/lib/error-copy.spec.ts
git commit -m "feat(web): add friendly copy lookup for import error codes"
```

---

## Part C — UI primitives

### Task 10: `PageHeader`, `SectionLabel`, `Metric`, `Skeleton`

**Files:**
- Create: `apps/web/components/ui/page-header.tsx`
- Create: `apps/web/components/ui/section-label.tsx`
- Create: `apps/web/components/ui/metric.tsx`
- Create: `apps/web/components/ui/skeleton.tsx`
- Test: `apps/web/components/ui/page-header.spec.tsx`
- Test: `apps/web/components/ui/metric.spec.tsx`

**Interfaces:**
- Produces: `PageHeader({eyebrow, title, description?, action?})`, `SectionLabel({children})`, `Metric({label, value})`, `Skeleton({className?})` — used across every page task (15-27).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/ui/page-header.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders the eyebrow, title, description, and action', () => {
    render(
      <PageHeader
        eyebrow="Data Management"
        title="CSV Data Imports"
        description="Import large CSV datasets into PostgreSQL."
        action={<button type="button">Import CSV</button>}
      />,
    );

    expect(screen.getByText('Data Management')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'CSV Data Imports' })).toBeInTheDocument();
    expect(screen.getByText('Import large CSV datasets into PostgreSQL.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import CSV' })).toBeInTheDocument();
  });

  it('renders without a description or action', () => {
    render(<PageHeader eyebrow="Database Operations" title="Overview" />);

    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
  });
});
```

Create `apps/web/components/ui/metric.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Metric } from './metric';

describe('Metric', () => {
  it('renders the value and label', () => {
    render(<Metric label="Total Imports" value="128" />);

    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('Total Imports')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @schemaiq/web test -- page-header.spec.tsx metric.spec.tsx`
Expected: FAIL — none of the four components exist yet.

- [ ] **Step 3: Implement the components**

Create `apps/web/components/ui/section-label.tsx`:

```tsx
import type { ReactNode } from 'react';

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">{children}</p>;
}
```

Create `apps/web/components/ui/page-header.tsx`:

```tsx
import type { ReactNode } from 'react';

import { SectionLabel } from './section-label';

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <SectionLabel>{eyebrow}</SectionLabel>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-slate-600">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
```

Create `apps/web/components/ui/metric.tsx`:

```tsx
interface MetricProps {
  label: string;
  value: string;
}

export function Metric({ label, value }: MetricProps) {
  return (
    <div>
      <p className="text-2xl font-semibold text-slate-900 sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
```

Create `apps/web/components/ui/skeleton.tsx`:

```tsx
export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} aria-hidden="true" />;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @schemaiq/web test -- page-header.spec.tsx metric.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/page-header.tsx apps/web/components/ui/section-label.tsx apps/web/components/ui/metric.tsx apps/web/components/ui/skeleton.tsx apps/web/components/ui/page-header.spec.tsx apps/web/components/ui/metric.spec.tsx
git commit -m "feat(web): add PageHeader, SectionLabel, Metric, and Skeleton primitives"
```

---

### Task 11: `ImportStatusBadge`

**Files:**
- Create: `apps/web/components/imports/import-status-badge.tsx`
- Test: `apps/web/components/imports/import-status-badge.spec.tsx`

**Interfaces:**
- Consumes: `DataImportStatus` from `@schemaiq/types`.
- Produces: `ImportStatusBadge({status: DataImportStatus})` — used by `ImportsHistoryTable` (Task 19) and the detail page hero (Task 27).

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/imports/import-status-badge.spec.tsx`:

```tsx
import { DataImportStatus } from '@schemaiq/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ImportStatusBadge } from './import-status-badge';

describe('ImportStatusBadge', () => {
  it.each([
    [DataImportStatus.Uploaded, 'Uploaded'],
    [DataImportStatus.Validating, 'Validating'],
    [DataImportStatus.Queued, 'Waiting in Queue'],
    [DataImportStatus.Processing, 'Importing'],
    [DataImportStatus.Completed, 'Completed'],
    [DataImportStatus.Failed, 'Failed'],
    [DataImportStatus.Cancelled, 'Cancelled'],
  ])('renders a human label for %s', (status, label) => {
    render(<ImportStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('never conveys status through color alone — the label text is always present in the DOM', () => {
    render(<ImportStatusBadge status={DataImportStatus.Failed} />);
    const badge = screen.getByText('Failed');
    expect(badge.textContent).toBe('Failed');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @schemaiq/web test -- import-status-badge.spec.tsx`
Expected: FAIL — `./import-status-badge` doesn't exist yet.

- [ ] **Step 3: Implement `apps/web/components/imports/import-status-badge.tsx`**

```tsx
import { DataImportStatus } from '@schemaiq/types';
import { AlertCircle, CheckCircle2, Clock, Loader2, UploadCloud, XCircle, type LucideIcon } from 'lucide-react';

interface StatusMeta {
  label: string;
  icon: LucideIcon;
  className: string;
  spin?: boolean;
}

const STATUS_META: Record<DataImportStatus, StatusMeta> = {
  [DataImportStatus.Uploaded]: { className: 'bg-slate-100 text-slate-700', icon: UploadCloud, label: 'Uploaded' },
  [DataImportStatus.Validating]: { className: 'bg-amber-100 text-amber-700', icon: Loader2, label: 'Validating', spin: true },
  [DataImportStatus.Queued]: { className: 'bg-amber-100 text-amber-700', icon: Clock, label: 'Waiting in Queue' },
  [DataImportStatus.Processing]: { className: 'bg-blue-100 text-blue-700', icon: Loader2, label: 'Importing', spin: true },
  [DataImportStatus.Completed]: { className: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2, label: 'Completed' },
  [DataImportStatus.Failed]: { className: 'bg-red-100 text-red-700', icon: AlertCircle, label: 'Failed' },
  [DataImportStatus.Cancelled]: { className: 'bg-slate-100 text-slate-700', icon: XCircle, label: 'Cancelled' },
};

export function ImportStatusBadge({ status }: { status: DataImportStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>
      <Icon className={`h-3.5 w-3.5 ${meta.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @schemaiq/web test -- import-status-badge.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/imports/import-status-badge.tsx apps/web/components/imports/import-status-badge.spec.tsx
git commit -m "feat(web): add ImportStatusBadge with human-readable status labels"
```

---

### Task 12: `ProgressBar` and `EmptyState`

**Files:**
- Create: `apps/web/components/ui/progress-bar.tsx`
- Create: `apps/web/components/ui/empty-state.tsx`
- Test: `apps/web/components/ui/progress-bar.spec.tsx`
- Test: `apps/web/components/ui/empty-state.spec.tsx`

**Interfaces:**
- Produces: `ProgressBar({percent, label?})`, `EmptyState({icon: LucideIcon, title, description, action?})` — used by `ImportProgress` (Task 26) and the imports overview empty state (Task 19).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/ui/progress-bar.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressBar } from './progress-bar';

describe('ProgressBar', () => {
  it('renders the given percent as aria-valuenow', () => {
    render(<ProgressBar percent={74} label="Importing data" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '74');
    expect(screen.getByText('Importing data')).toBeInTheDocument();
  });

  it('clamps values above 100 and below 0', () => {
    const { rerender } = render(<ProgressBar percent={140} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

    rerender(<ProgressBar percent={-10} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});
```

Create `apps/web/components/ui/empty-state.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { UploadCloud } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders the title, description, and action', () => {
    render(
      <EmptyState
        icon={UploadCloud}
        title="Import your first dataset"
        description="Upload a CSV file and SchemaIQ will safely stream it into PostgreSQL."
        action={<button type="button">Import CSV</button>}
      />,
    );

    expect(screen.getByText('Import your first dataset')).toBeInTheDocument();
    expect(screen.getByText(/safely stream it into PostgreSQL/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import CSV' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @schemaiq/web test -- progress-bar.spec.tsx empty-state.spec.tsx`
Expected: FAIL — neither component exists yet.

- [ ] **Step 3: Implement the components**

Create `apps/web/components/ui/progress-bar.tsx`:

```tsx
interface ProgressBarProps {
  percent: number;
  label?: string;
}

export function ProgressBar({ percent, label }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div>
      {label && <p className="mb-1.5 text-sm text-slate-600">{label}</p>}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
```

Create `apps/web/components/ui/empty-state.tsx`:

```tsx
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
        <Icon className="h-7 w-7 text-blue-600" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-slate-500">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @schemaiq/web test -- progress-bar.spec.tsx empty-state.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/progress-bar.tsx apps/web/components/ui/empty-state.tsx apps/web/components/ui/progress-bar.spec.tsx apps/web/components/ui/empty-state.spec.tsx
git commit -m "feat(web): add ProgressBar and EmptyState primitives"
```

---

### Task 13: `DataTable` and `Pagination`

**Files:**
- Create: `apps/web/components/ui/data-table.tsx`
- Create: `apps/web/components/ui/pagination.tsx`
- Test: `apps/web/components/ui/data-table.spec.tsx`
- Test: `apps/web/components/ui/pagination.spec.tsx`

**Interfaces:**
- Produces: `DataTableColumn<T>`, `DataTable<T>({columns, rows, getRowKey, emptyMessage?})`, `totalPages(total, limit): number`, `Pagination({page, limit, total, onPageChange})` — used by `ImportsHistoryTable` (Task 19).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/ui/data-table.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTable, type DataTableColumn } from './data-table';

interface Row {
  id: string;
  name: string;
}

const columns: DataTableColumn<Row>[] = [
  { header: 'Name', key: 'name', render: (row) => row.name },
];

describe('DataTable', () => {
  it('renders a header and a row per item', () => {
    render(
      <DataTable columns={columns} rows={[{ id: '1', name: 'customers.csv' }]} getRowKey={(row) => row.id} />,
    );

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('customers.csv')).toBeInTheDocument();
  });

  it('renders the empty message when there are no rows', () => {
    render(<DataTable columns={columns} rows={[]} getRowKey={(row) => row.id} emptyMessage="No imports yet." />);

    expect(screen.getByText('No imports yet.')).toBeInTheDocument();
  });
});
```

Create `apps/web/components/ui/pagination.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Pagination, totalPages } from './pagination';

describe('totalPages', () => {
  it('computes the number of pages, minimum one', () => {
    expect(totalPages(0, 20)).toBe(1);
    expect(totalPages(45, 20)).toBe(3);
  });
});

describe('Pagination', () => {
  it('disables Previous on the first page and Next on the last page', () => {
    render(<Pagination page={1} limit={20} total={20} onPageChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('calls onPageChange with the next page number', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={1} limit={20} total={45} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('shows the current range', () => {
    render(<Pagination page={2} limit={20} total={45} onPageChange={vi.fn()} />);
    expect(screen.getByText('Showing 21-40 of 45')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @schemaiq/web test -- data-table.spec.tsx pagination.spec.tsx`
Expected: FAIL — neither component exists yet.

- [ ] **Step 3: Implement the components**

Create `apps/web/components/ui/data-table.tsx`:

```tsx
import type { ReactNode } from 'react';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyMessage?: string;
}

export function DataTable<T>({ columns, rows, getRowKey, emptyMessage = 'No records to show.' }: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`px-4 py-3 ${column.className ?? ''}`} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={getRowKey(row)} className="hover:bg-slate-50">
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-3 ${column.className ?? ''}`}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Create `apps/web/components/ui/pagination.tsx`:

```tsx
export function totalPages(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / limit));
}

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
  const pages = totalPages(total, limit);
  const canGoBack = page > 1;
  const canGoForward = page < pages;
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(total, page * limit);

  return (
    <div className="flex items-center justify-between px-1 py-3 text-sm text-slate-600">
      <span>{total === 0 ? 'No results' : `Showing ${start}-${end} of ${total}`}</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!canGoBack}
          className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!canGoForward}
          className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @schemaiq/web test -- data-table.spec.tsx pagination.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/data-table.tsx apps/web/components/ui/pagination.tsx apps/web/components/ui/data-table.spec.tsx apps/web/components/ui/pagination.spec.tsx
git commit -m "feat(web): add DataTable and Pagination primitives"
```

---

### Task 14: `ConfirmDialog`

**Files:**
- Create: `apps/web/components/ui/confirm-dialog.tsx`
- Test: `apps/web/components/ui/confirm-dialog.spec.tsx`

**Interfaces:**
- Produces: `ConfirmDialog({open, title, description, confirmLabel?, cancelLabel?, destructive?, onConfirm, onCancel})` — used for cancel-import (Task 27) and delete-history (Task 19) confirmations.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/ui/confirm-dialog.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  it('does not open the native dialog element when closed', () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Cancel this import?"
        description="The file will not be imported."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(container.querySelector('dialog')?.open).toBe(false);
  });

  it('opens the native dialog element when open', () => {
    const { container } = render(
      <ConfirmDialog
        open
        title="Cancel this import?"
        description="The file will not be imported."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(container.querySelector('dialog')?.open).toBe(true);
    expect(screen.getByText('Cancel this import?')).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="Cancel this import?"
        description="The file will not be imported."
        confirmLabel="Cancel Import"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel Import' }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel when the cancel button is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="Delete import history"
        description="This removes the SchemaIQ import record and retained source file where applicable. It does not delete data already imported into PostgreSQL."
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @schemaiq/web test -- confirm-dialog.spec.tsx`
Expected: FAIL — `./confirm-dialog` doesn't exist yet.

- [ ] **Step 3: Implement `apps/web/components/ui/confirm-dialog.tsx`**

Uses the native `<dialog>` element for free focus-trapping, Escape-to-close, and top-layer rendering instead of a hand-rolled modal/portal.

```tsx
'use client';

import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      onCancel={onCancel}
      className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-900/40"
    >
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
            destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @schemaiq/web test -- confirm-dialog.spec.tsx`
Expected: PASS. If jsdom in the installed version doesn't support `HTMLDialogElement.showModal`/`close`, upgrade `jsdom` to the latest 25.x patch — do not hand-roll a modal to work around it.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ui/confirm-dialog.tsx apps/web/components/ui/confirm-dialog.spec.tsx
git commit -m "feat(web): add ConfirmDialog built on the native dialog element"
```

---

## Part D — Shell, data hooks, overview, and stub pages

### Task 15: Application shell (Sidebar, Header, WorkspaceIndicator, dashboard layout)

**Files:**
- Create: `apps/web/components/layout/sidebar.tsx`
- Create: `apps/web/components/layout/workspace-indicator.tsx`
- Create: `apps/web/components/layout/header.tsx`
- Create: `apps/web/components/layout/dashboard-shell.tsx`
- Create: `apps/web/app/dashboard/layout.tsx`
- Test: `apps/web/components/layout/sidebar.spec.tsx`
- Test: `apps/web/components/layout/workspace-indicator.spec.tsx`

**Interfaces:**
- Consumes: `useOrganization`, `isValidOrganizationId` (Task 7).
- Produces: `<DashboardShell>` wraps every page under `app/dashboard/**` via `app/dashboard/layout.tsx` — no later task needs to import shell internals directly.

Note: per-page title/description live in each page's own `PageHeader` (Task 10), rendered at the top of the page content — not threaded into the persistent header bar. This keeps `Header`/`Sidebar` decoupled from page content and avoids a large cluttered top navigation, while still satisfying "current page title, short contextual description" as the first thing visible under the persistent bar.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/layout/sidebar.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/imports' }));
vi.mock(
  'next/link',
  () => ({
    default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
      <a href={href} className={className}>
        {children}
      </a>
    ),
  }),
);

import { Sidebar } from './sidebar';

describe('Sidebar', () => {
  it('renders every primary nav item and marks the active one', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);

    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Data Sources').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Data Imports').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
    const importsLinks = screen.getAllByText('Data Imports').map((node) => node.closest('a'));
    expect(importsLinks[0]).toHaveClass('bg-blue-50');
  });

  it('marks Data Sources as coming soon', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(screen.getAllByText('Soon').length).toBeGreaterThan(0);
  });
});
```

Create `apps/web/components/layout/workspace-indicator.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { OrganizationProvider } from '../../lib/organization-context';
import { WorkspaceIndicator } from './workspace-indicator';

function renderIndicator() {
  return render(
    <OrganizationProvider>
      <WorkspaceIndicator />
    </OrganizationProvider>,
  );
}

describe('WorkspaceIndicator', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('prompts to set a workspace when none is configured', () => {
    renderIndicator();
    expect(screen.getByRole('button', { name: /Set workspace/ })).toBeInTheDocument();
  });

  it('rejects a non-UUID value and does not save it', async () => {
    const user = renderIndicator() && (await import('@testing-library/user-event')).default.setup();
    await user.click(screen.getByRole('button', { name: /Set workspace/ }));
    await user.type(screen.getByLabelText('Organization ID'), 'not-a-uuid');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Enter a valid UUID.')).toBeInTheDocument();
    expect(window.localStorage.getItem('schemaiq.organizationId')).toBeNull();
  });

  it('saves a valid UUID and displays a truncated workspace label', async () => {
    const user = userEvent.setup();
    renderIndicator();
    await user.click(screen.getByRole('button', { name: /Set workspace/ }));
    await user.type(screen.getByLabelText('Organization ID'), '11111111-1111-4111-8111-111111111111');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('button', { name: /Workspace: 11111111/ })).toBeInTheDocument();
    expect(window.localStorage.getItem('schemaiq.organizationId')).toBe('11111111-1111-4111-8111-111111111111');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @schemaiq/web test -- sidebar.spec.tsx workspace-indicator.spec.tsx`
Expected: FAIL — none of the shell components exist yet.

- [ ] **Step 3: Implement the shell**

Create `apps/web/components/layout/workspace-indicator.tsx`:

```tsx
'use client';

import { useState } from 'react';

import { isValidOrganizationId, useOrganization } from '../../lib/organization-context';

export function WorkspaceIndicator() {
  const { organizationId, setOrganizationId } = useOrganization();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(organizationId ?? '');
  const [error, setError] = useState<string | null>(null);

  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = draft.trim();
          if (!isValidOrganizationId(trimmed)) {
            setError('Enter a valid UUID.');
            return;
          }
          setOrganizationId(trimmed);
          setError(null);
          setEditing(false);
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Organization UUID"
          aria-label="Organization ID"
          className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button type="submit" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(organizationId ?? '');
        setEditing(true);
      }}
      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
    >
      {organizationId ? `Workspace: ${organizationId.slice(0, 8)}…` : 'Set workspace'}
      <span className="ml-2 font-medium text-blue-600">Change</span>
    </button>
  );
}
```

Create `apps/web/components/layout/sidebar.tsx`:

```tsx
'use client';

import { PRODUCT_NAME } from '@schemaiq/shared';
import { Database, LayoutDashboard, Settings, UploadCloud, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { comingSoon: false, href: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
  { comingSoon: true, href: '/dashboard/data-sources', icon: Database, label: 'Data Sources' },
  { comingSoon: false, href: '/dashboard/imports', icon: UploadCloud, label: 'Data Imports' },
] as const;

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const content = (
    <nav aria-label="Primary" className="flex h-full flex-col px-4 py-6">
      <Link href="/dashboard" className="mb-8 px-2 text-lg font-semibold tracking-tight text-slate-900">
        {PRODUCT_NAME}
      </Link>
      <ul className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = item.href === '/dashboard' ? pathname === item.href : pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${
                  active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </span>
                {item.comingSoon && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                    Soon
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 border-t border-slate-200 pt-4">
        <Link
          href="/dashboard/settings"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
            pathname?.startsWith('/dashboard/settings') ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
          Settings
        </Link>
      </div>
    </nav>
  );

  return (
    <>
      <aside className="hidden w-64 border-r border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:flex">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" onClick={onClose} className="absolute inset-0 bg-slate-900/40" />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
```

Create `apps/web/components/layout/header.tsx`:

```tsx
'use client';

import { Menu } from 'lucide-react';

import { WorkspaceIndicator } from './workspace-indicator';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-10">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="flex-1" />
      <WorkspaceIndicator />
    </header>
  );
}
```

Create `apps/web/components/layout/dashboard-shell.tsx`:

```tsx
'use client';

import { useState, type ReactNode } from 'react';

import { Header } from './header';
import { Sidebar } from './sidebar';

export function DashboardShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex flex-1 flex-col lg:pl-64">
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
```

Create `apps/web/app/dashboard/layout.tsx`:

```tsx
import type { ReactNode } from 'react';

import { DashboardShell } from '../../components/layout/dashboard-shell';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @schemaiq/web test -- sidebar.spec.tsx workspace-indicator.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/layout apps/web/app/dashboard/layout.tsx
git commit -m "feat(web): add application shell with sidebar, header, and workspace indicator"
```

---

### Task 16: Import data hooks (queries and mutations)

**Files:**
- Create: `apps/web/lib/queries/imports-queries.ts`
- Create: `apps/web/lib/queries/imports-mutations.ts`
- Test: `apps/web/lib/queries/imports-queries.spec.tsx`
- Test: `apps/web/lib/queries/imports-mutations.spec.tsx`

**Interfaces:**
- Consumes: `importsApi` (Task 6), `useOrganization` (Task 7).
- Produces: `useImportsList(params)`, `useImport(id)` (polling-aware — `refetchInterval` stays active while status is `UPLOADED/VALIDATING/QUEUED/PROCESSING`, stops once terminal), `useImportsSummary()`, `useImportConfig()`, `useImportSchemas()`, `useImportTables(schema)`, `useImportTableDetails(schema, table)`, `useRetryImport()`, `useCancelImport()`, `useDeleteImport()`, `useCreateImport()` — every later page task (17, 19, 22, 24, 26) calls exactly these hooks and no others.

- [ ] **Step 1: Write the failing tests**

Create a tiny shared test wrapper inline in each spec (no separate file needed — two call sites don't justify an extra shared-test-utils file). Create `apps/web/lib/queries/imports-queries.spec.tsx`:

```tsx
import { DataImportProcessingMode, DataImportStatus } from '@schemaiq/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as apiClient from '../api-client';
import { OrganizationProvider } from '../organization-context';
import { useImport, useImportsList } from './imports-queries';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <OrganizationProvider>{children}</OrganizationProvider>
    </QueryClientProvider>
  );
}

const baseImport = {
  completedAt: null,
  createdAt: '2026-09-05T09:00:00.000Z',
  delimiter: ',',
  errorCode: null,
  errorMessage: null,
  failedRows: '0',
  fileSizeBytes: '9',
  hasHeader: true,
  id: 'import-1',
  mimeType: 'text/csv',
  originalFileName: 'customers.csv',
  processedBytes: '0',
  processedRows: '0',
  processingMode: DataImportProcessingMode.Synchronous,
  progressPercent: 0,
  startedAt: null,
  status: DataImportStatus.Processing,
  successfulRows: '0',
  targetSchema: 'public',
  targetTable: 'customers',
  totalRows: null,
  updatedAt: '2026-09-05T09:00:00.000Z',
};

describe('useImportsList', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('does not fetch until an organization is set', () => {
    const list = vi.spyOn(apiClient.importsApi, 'list');
    renderHook(() => useImportsList({ limit: 20, page: 1 }), { wrapper });
    expect(list).not.toHaveBeenCalled();
  });
});

describe('useImport polling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('keeps polling while the status is non-terminal', async () => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
    vi.spyOn(apiClient.importsApi, 'get').mockResolvedValue({ ...baseImport, status: DataImportStatus.Processing });

    const { result } = renderHook(() => useImport('import-1'), { wrapper });

    await waitFor(() => expect(result.current.data?.status).toBe(DataImportStatus.Processing));
    expect(result.current.isStale).toBeDefined();
  });

  it('stops polling once the status is terminal', async () => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
    vi.spyOn(apiClient.importsApi, 'get').mockResolvedValue({ ...baseImport, status: DataImportStatus.Completed });

    const { result } = renderHook(() => useImport('import-1'), { wrapper });

    await waitFor(() => expect(result.current.data?.status).toBe(DataImportStatus.Completed));
  });
});
```

(The polling-interval *value* itself is exercised end-to-end by Task 26's fake-timer test, which asserts the network call count over simulated time — this spec only proves the query is org-gated and resolves per status.)

Create `apps/web/lib/queries/imports-mutations.spec.tsx`:

```tsx
import { DataImportStatus } from '@schemaiq/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as apiClient from '../api-client';
import { OrganizationProvider } from '../organization-context';
import { useCancelImport, useRetryImport } from './imports-mutations';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <OrganizationProvider>{children}</OrganizationProvider>
    </QueryClientProvider>
  );
}

describe('useRetryImport', () => {
  beforeEach(() => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('calls importsApi.retry with the current organization and import id', async () => {
    const retry = vi.spyOn(apiClient.importsApi, 'retry').mockResolvedValue({ status: DataImportStatus.Queued } as never);
    const { result } = renderHook(() => useRetryImport(), { wrapper });

    result.current.mutate('import-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(retry).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'import-1');
  });
});

describe('useCancelImport', () => {
  beforeEach(() => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('calls importsApi.cancel with the current organization and import id', async () => {
    const cancel = vi.spyOn(apiClient.importsApi, 'cancel').mockResolvedValue({ status: DataImportStatus.Cancelled } as never);
    const { result } = renderHook(() => useCancelImport(), { wrapper });

    result.current.mutate('import-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(cancel).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'import-1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @schemaiq/web test -- imports-queries.spec.tsx imports-mutations.spec.tsx`
Expected: FAIL — neither module exists yet.

- [ ] **Step 3: Implement the hooks**

Create `apps/web/lib/queries/imports-queries.ts`:

```ts
'use client';

import { DataImportStatus } from '@schemaiq/types';
import { useQuery } from '@tanstack/react-query';

import { importsApi, type ListImportsParams } from '../api-client';
import { useOrganization } from '../organization-context';

const NON_TERMINAL_STATUSES: DataImportStatus[] = [
  DataImportStatus.Uploaded,
  DataImportStatus.Validating,
  DataImportStatus.Queued,
  DataImportStatus.Processing,
];
const POLL_INTERVAL_MS = 2_500;

export function useImportsList(params: ListImportsParams) {
  const { organizationId } = useOrganization();
  return useQuery({
    enabled: Boolean(organizationId),
    queryFn: () => importsApi.list(organizationId, params),
    queryKey: ['imports', 'list', organizationId, params],
  });
}

export function useImport(id: string) {
  const { organizationId } = useOrganization();
  return useQuery({
    enabled: Boolean(organizationId) && Boolean(id),
    queryFn: ({ signal }) => importsApi.get(organizationId, id, signal),
    queryKey: ['imports', 'detail', organizationId, id],
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return POLL_INTERVAL_MS;
      return NON_TERMINAL_STATUSES.includes(status) ? POLL_INTERVAL_MS : false;
    },
  });
}

export function useImportsSummary() {
  const { organizationId } = useOrganization();
  return useQuery({
    enabled: Boolean(organizationId),
    queryFn: () => importsApi.summary(organizationId),
    queryKey: ['imports', 'summary', organizationId],
  });
}

export function useImportConfig() {
  const { organizationId } = useOrganization();
  return useQuery({
    enabled: Boolean(organizationId),
    queryFn: () => importsApi.config(organizationId),
    queryKey: ['imports', 'config', organizationId],
    staleTime: Infinity,
  });
}

export function useImportSchemas() {
  const { organizationId } = useOrganization();
  return useQuery({
    enabled: Boolean(organizationId),
    queryFn: () => importsApi.schemas(organizationId),
    queryKey: ['imports', 'targets', 'schemas', organizationId],
  });
}

export function useImportTables(schema: string | null) {
  const { organizationId } = useOrganization();
  return useQuery({
    enabled: Boolean(organizationId) && Boolean(schema),
    queryFn: () => importsApi.tables(organizationId, schema as string),
    queryKey: ['imports', 'targets', 'tables', organizationId, schema],
  });
}

export function useImportTableDetails(schema: string | null, table: string | null) {
  const { organizationId } = useOrganization();
  return useQuery({
    enabled: Boolean(organizationId) && Boolean(schema) && Boolean(table),
    queryFn: () => importsApi.tableDetails(organizationId, schema as string, table as string),
    queryKey: ['imports', 'targets', 'table-details', organizationId, schema, table],
  });
}
```

Create `apps/web/lib/queries/imports-mutations.ts`:

```ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { importsApi, type CreateImportInput } from '../api-client';
import { useOrganization } from '../organization-context';

export function useRetryImport() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => importsApi.retry(organizationId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['imports'] }),
  });
}

export function useCancelImport() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => importsApi.cancel(organizationId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['imports'] }),
  });
}

export function useDeleteImport() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => importsApi.remove(organizationId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['imports'] }),
  });
}

export function useCreateImport() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { input: CreateImportInput; onProgress?: (percent: number) => void }) =>
      importsApi.uploadCsv(organizationId, args.input, args.onProgress),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['imports'] }),
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @schemaiq/web test -- imports-queries.spec.tsx imports-mutations.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries
git commit -m "feat(web): add TanStack Query hooks for imports reads and mutations"
```

---

### Task 17: Dashboard overview page

**Files:**
- Modify: `apps/web/app/dashboard/page.tsx`
- Test: `apps/web/app/dashboard/page.spec.tsx`

**Interfaces:**
- Consumes: `useImportsList` (Task 16), `PageHeader`/`Skeleton` (Task 10), `ImportStatusBadge` (Task 11).

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/dashboard/page.spec.tsx`:

```tsx
import { DataImportStatus } from '@schemaiq/types';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useImportsListMock = vi.fn();
vi.mock('../../lib/queries/imports-queries', () => ({
  useImportsList: (...args: unknown[]) => useImportsListMock(...args),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { OrganizationProvider } from '../../lib/organization-context';
import DashboardOverviewPage from './page';

function renderPage() {
  return render(
    <OrganizationProvider>
      <DashboardOverviewPage />
    </OrganizationProvider>,
  );
}

describe('DashboardOverviewPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows a setup prompt when no organization is configured', () => {
    useImportsListMock.mockReturnValue({ data: undefined, isPending: true });
    renderPage();
    expect(screen.getByText(/Set your development organization ID/)).toBeInTheDocument();
  });

  it('lists recent imports with their status once data loads', () => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
    useImportsListMock.mockReturnValue({
      data: { items: [{ id: '1', originalFileName: 'customers.csv', status: DataImportStatus.Completed }], total: 1 },
      isPending: false,
    });
    renderPage();
    expect(screen.getByText('customers.csv')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('shows an empty message when there are no recent imports', () => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
    useImportsListMock.mockReturnValue({ data: { items: [], total: 0 }, isPending: false });
    renderPage();
    expect(screen.getByText('No imports yet.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @schemaiq/web test -- app/dashboard/page.spec.tsx`
Expected: FAIL — the page still renders the old "Foundation initialized successfully" placeholder.

- [ ] **Step 3: Implement**

Replace `apps/web/app/dashboard/page.tsx` in full:

```tsx
'use client';

import { Activity, Database, UploadCloud } from 'lucide-react';
import Link from 'next/link';

import { ImportStatusBadge } from '../../components/imports/import-status-badge';
import { PageHeader } from '../../components/ui/page-header';
import { Skeleton } from '../../components/ui/skeleton';
import { useOrganization } from '../../lib/organization-context';
import { useImportsList } from '../../lib/queries/imports-queries';

export default function DashboardOverviewPage() {
  const { organizationId } = useOrganization();
  const recent = useImportsList({ limit: 5, page: 1 });

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Database Operations"
        title="Move data with confidence."
        description="Connect, inspect, and manage database operations from one workspace."
      />

      {!organizationId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Set your development organization ID (top right) to load your workspace data.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/dashboard/data-sources" className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300">
          <Database className="h-6 w-6 text-blue-600" aria-hidden="true" />
          <h3 className="mt-4 text-base font-semibold text-slate-900">Data Sources</h3>
          <p className="mt-1 text-sm text-slate-500">Coming soon</p>
        </Link>
        <Link href="/dashboard/imports" className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300">
          <UploadCloud className="h-6 w-6 text-blue-600" aria-hidden="true" />
          <h3 className="mt-4 text-base font-semibold text-slate-900">CSV Imports</h3>
          <p className="mt-1 text-sm text-slate-500">Stream CSV data into PostgreSQL.</p>
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Activity className="h-6 w-6 text-blue-600" aria-hidden="true" />
          <h3 className="mt-4 text-base font-semibold text-slate-900">Recent Activity</h3>
          {!organizationId || recent.isPending ? (
            <div className="mt-3 flex flex-col gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : recent.data && recent.data.items.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {recent.data.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-slate-700">{item.originalFileName}</span>
                  <ImportStatusBadge status={item.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-slate-500">No imports yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @schemaiq/web test -- app/dashboard/page.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/page.tsx apps/web/app/dashboard/page.spec.tsx
git commit -m "feat(web): rebuild the dashboard overview with real recent-activity data"
```

---

### Task 18: Data Sources stub and Settings page

**Files:**
- Create: `apps/web/app/dashboard/data-sources/page.tsx`
- Create: `apps/web/app/dashboard/settings/page.tsx`
- Test: `apps/web/app/dashboard/data-sources/page.spec.tsx`
- Test: `apps/web/app/dashboard/settings/page.spec.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `EmptyState` (Task 10, 12), `WorkspaceIndicator` (Task 15).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/dashboard/data-sources/page.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DataSourcesPage from './page';

describe('DataSourcesPage', () => {
  it('clearly marks the feature as coming soon rather than showing a fake working UI', () => {
    render(<DataSourcesPage />);
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add data source/i })).not.toBeInTheDocument();
  });
});
```

Create `apps/web/app/dashboard/settings/page.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OrganizationProvider } from '../../../lib/organization-context';
import SettingsPage from './page';

describe('SettingsPage', () => {
  it('hosts the workspace organization-id control', () => {
    render(
      <OrganizationProvider>
        <SettingsPage />
      </OrganizationProvider>,
    );
    expect(screen.getByRole('button', { name: /Set workspace/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @schemaiq/web test -- app/dashboard/data-sources/page.spec.tsx app/dashboard/settings/page.spec.tsx`
Expected: FAIL — neither page exists yet.

- [ ] **Step 3: Implement**

Create `apps/web/app/dashboard/data-sources/page.tsx`:

```tsx
import { Database } from 'lucide-react';

import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/page-header';

export default function DataSourcesPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Data Management" title="Data Sources" description="Connect and manage external database connections." />
      <EmptyState
        icon={Database}
        title="Coming soon"
        description="Data source management is not part of this milestone yet. CSV imports into the SchemaIQ PostgreSQL database are available today under Data Imports."
      />
    </div>
  );
}
```

Create `apps/web/app/dashboard/settings/page.tsx`:

```tsx
import { PageHeader } from '../../../components/ui/page-header';
import { WorkspaceIndicator } from '../../../components/layout/workspace-indicator';

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="SchemaIQ does not have authentication yet. Use this development workspace control to scope your data to an organization."
      />
      <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Workspace</h2>
        <p className="mt-2 text-sm text-slate-600">
          Every request SchemaIQ makes is scoped to this organization ID. It is stored only in this browser.
        </p>
        <div className="mt-4">
          <WorkspaceIndicator />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @schemaiq/web test -- app/dashboard/data-sources/page.spec.tsx app/dashboard/settings/page.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/data-sources apps/web/app/dashboard/settings
git commit -m "feat(web): add Data Sources coming-soon stub and Settings workspace page"
```

---

## Part E — Imports overview page

### Task 19: `ImportsMetrics`, `ImportsHistoryTable`, and the imports overview page

**Files:**
- Create: `apps/web/components/imports/imports-metrics.tsx`
- Create: `apps/web/components/imports/imports-history-table.tsx`
- Modify: `apps/web/app/dashboard/imports/page.tsx` (new file)
- Test: `apps/web/components/imports/imports-metrics.spec.tsx`
- Test: `apps/web/components/imports/imports-history-table.spec.tsx`
- Test: `apps/web/app/dashboard/imports/page.spec.tsx`

**Interfaces:**
- Consumes: `useImportsSummary`, `useImportsList` (Task 16), `useRetryImport`/`useCancelImport`/`useDeleteImport` (Task 16), `DataTable`/`Pagination`/`ConfirmDialog` (Tasks 13-14), `ImportStatusBadge` (Task 11), `formatBytes`/`formatDuration`/`formatRowCount` (Task 5), `EmptyState` (Task 12).
- Produces: `<ImportsMetrics />`, `<ImportsHistoryTable />` — consumed only by `app/dashboard/imports/page.tsx` in this task.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/imports/imports-metrics.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const useImportsSummaryMock = vi.fn();
vi.mock('../../lib/queries/imports-queries', () => ({
  useImportsSummary: () => useImportsSummaryMock(),
}));

import { ImportsMetrics } from './imports-metrics';

describe('ImportsMetrics', () => {
  it('renders the real summary numbers from the backend, never fabricated ones', () => {
    useImportsSummaryMock.mockReturnValue({
      data: { completedImports: '110', failedImports: '14', processingImports: '4', totalImports: '128', totalRowsImported: '48210' },
      isPending: false,
    });
    render(<ImportsMetrics />);

    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('Total Imports')).toBeInTheDocument();
    expect(screen.getByText('48,210')).toBeInTheDocument();
    expect(screen.getByText('Total Rows Imported')).toBeInTheDocument();
  });

  it('shows loading skeletons while pending instead of a blank or fake metric', () => {
    useImportsSummaryMock.mockReturnValue({ data: undefined, isPending: true });
    const { container } = render(<ImportsMetrics />);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('Total Imports')).not.toBeInTheDocument();
  });
});
```

Create `apps/web/components/imports/imports-history-table.spec.tsx`:

```tsx
import { DataImportProcessingMode, DataImportStatus, type DataImportApiResponse } from '@schemaiq/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useImportsListMock = vi.fn();
const retryMutate = vi.fn();
const cancelMutate = vi.fn();
const removeMutate = vi.fn();

vi.mock('../../lib/queries/imports-queries', () => ({
  useImportsList: (...args: unknown[]) => useImportsListMock(...args),
}));
vi.mock('../../lib/queries/imports-mutations', () => ({
  useCancelImport: () => ({ isPending: false, mutate: cancelMutate }),
  useDeleteImport: () => ({ isPending: false, mutate: removeMutate }),
  useRetryImport: () => ({ isPending: false, mutate: retryMutate }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { ImportsHistoryTable } from './imports-history-table';

const failedImport: DataImportApiResponse = {
  completedAt: '2026-09-05T09:50:00.000Z',
  createdAt: '2026-09-05T09:45:00.000Z',
  delimiter: ',',
  errorCode: 'IMPORT_POSTGRES_TYPE_ERROR' as never,
  errorMessage: 'CSV values do not match the target column types',
  failedRows: '1',
  fileSizeBytes: '2048',
  hasHeader: true,
  id: 'import-failed',
  mimeType: 'text/csv',
  originalFileName: 'bad-ages.csv',
  processedBytes: '2048',
  processedRows: '10',
  processingMode: DataImportProcessingMode.Synchronous,
  progressPercent: 100,
  startedAt: '2026-09-05T09:45:05.000Z',
  status: DataImportStatus.Failed,
  successfulRows: '9',
  targetSchema: 'public',
  targetTable: 'customers',
  totalRows: '10',
  updatedAt: '2026-09-05T09:50:00.000Z',
};

describe('ImportsHistoryTable', () => {
  beforeEach(() => {
    retryMutate.mockClear();
    cancelMutate.mockClear();
    removeMutate.mockClear();
  });

  it('shows a Retry action for a failed import and calls the mutation with its id', async () => {
    useImportsListMock.mockReturnValue({ data: { items: [failedImport], total: 1 } });
    const user = userEvent.setup();
    render(<ImportsHistoryTable />);

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(retryMutate).toHaveBeenCalledWith('import-failed');
  });

  it('shows the required delete-history warning wording before deleting, and calls the mutation on confirm', async () => {
    useImportsListMock.mockReturnValue({ data: { items: [failedImport], total: 1 } });
    const user = userEvent.setup();
    render(<ImportsHistoryTable />);

    await user.click(screen.getByRole('button', { name: /Delete history for bad-ages.csv/ }));

    expect(
      screen.getByText(
        'This removes the SchemaIQ import record and retained source file where applicable. It does not delete data already imported into PostgreSQL.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(removeMutate).toHaveBeenCalledWith('import-failed');
  });

  it('forwards the search input to the list query and resets to page 1', async () => {
    useImportsListMock.mockReturnValue({ data: { items: [], total: 0 } });
    const user = userEvent.setup();
    render(<ImportsHistoryTable />);

    await user.type(screen.getByLabelText('Search by filename'), 'customers');

    expect(useImportsListMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, search: 'customers' }));
  });

  it('forwards the status filter to the list query', async () => {
    useImportsListMock.mockReturnValue({ data: { items: [], total: 0 } });
    const user = userEvent.setup();
    render(<ImportsHistoryTable />);

    await user.selectOptions(screen.getByLabelText('Filter by status'), DataImportStatus.Failed);

    expect(useImportsListMock).toHaveBeenLastCalledWith(expect.objectContaining({ status: DataImportStatus.Failed }));
  });
});
```

Create `apps/web/app/dashboard/imports/page.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useImportsListMock = vi.fn();
vi.mock('../../../lib/queries/imports-queries', () => ({
  useImportsList: (...args: unknown[]) => useImportsListMock(...args),
}));
vi.mock('../../../components/imports/imports-metrics', () => ({ ImportsMetrics: () => <div>metrics</div> }));
vi.mock('../../../components/imports/imports-history-table', () => ({ ImportsHistoryTable: () => <div>history</div> }));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { OrganizationProvider } from '../../../lib/organization-context';
import ImportsOverviewPage from './page';

function renderPage() {
  return render(
    <OrganizationProvider>
      <ImportsOverviewPage />
    </OrganizationProvider>,
  );
}

describe('ImportsOverviewPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('prompts for a workspace before checking for imports', () => {
    useImportsListMock.mockReturnValue({ data: undefined });
    renderPage();
    expect(screen.getByText(/Set your development organization ID/)).toBeInTheDocument();
  });

  it('shows the first-import empty state only when the organization truly has none', () => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
    useImportsListMock.mockReturnValue({ data: { items: [], total: 0 } });
    renderPage();
    expect(screen.getByText('Import your first dataset')).toBeInTheDocument();
  });

  it('shows metrics and history once at least one import exists', () => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
    useImportsListMock.mockReturnValue({ data: { items: [{}], total: 1 } });
    renderPage();
    expect(screen.getByText('metrics')).toBeInTheDocument();
    expect(screen.getByText('history')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @schemaiq/web test -- imports-metrics.spec.tsx imports-history-table.spec.tsx app/dashboard/imports/page.spec.tsx`
Expected: FAIL — none of these three modules exist yet.

- [ ] **Step 3: Implement**

Create `apps/web/components/imports/imports-metrics.tsx`:

```tsx
'use client';

import { Metric } from '../ui/metric';
import { Skeleton } from '../ui/skeleton';
import { formatRowCount } from '../../lib/format';
import { useImportsSummary } from '../../lib/queries/imports-queries';

export function ImportsMetrics() {
  const summary = useImportsSummary();

  if (summary.isPending || !summary.data) {
    return (
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">
      <Metric label="Total Imports" value={formatRowCount(summary.data.totalImports)} />
      <Metric label="Completed" value={formatRowCount(summary.data.completedImports)} />
      <Metric label="Processing" value={formatRowCount(summary.data.processingImports)} />
      <Metric label="Failed" value={formatRowCount(summary.data.failedImports)} />
      <Metric label="Total Rows Imported" value={formatRowCount(summary.data.totalRowsImported)} />
    </div>
  );
}
```

Create `apps/web/components/imports/imports-history-table.tsx`:

```tsx
'use client';

import { DataImportStatus, type DataImportApiResponse } from '@schemaiq/types';
import { MoreVertical } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { formatBytes, formatDuration, formatRowCount } from '../../lib/format';
import { useCancelImport, useDeleteImport, useRetryImport } from '../../lib/queries/imports-mutations';
import { useImportsList } from '../../lib/queries/imports-queries';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { DataTable, type DataTableColumn } from '../ui/data-table';
import { Pagination } from '../ui/pagination';
import { ImportStatusBadge } from './import-status-badge';

const STATUS_FILTERS: Array<{ label: string; value: DataImportStatus | '' }> = [
  { label: 'All statuses', value: '' },
  { label: 'Uploaded', value: DataImportStatus.Uploaded },
  { label: 'Validating', value: DataImportStatus.Validating },
  { label: 'Waiting in Queue', value: DataImportStatus.Queued },
  { label: 'Importing', value: DataImportStatus.Processing },
  { label: 'Completed', value: DataImportStatus.Completed },
  { label: 'Failed', value: DataImportStatus.Failed },
  { label: 'Cancelled', value: DataImportStatus.Cancelled },
];

const LIMIT = 20;

export function ImportsHistoryTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<DataImportStatus | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<DataImportApiResponse | null>(null);

  const list = useImportsList({ limit: LIMIT, page, search: search || undefined, status });
  const retry = useRetryImport();
  const cancel = useCancelImport();
  const remove = useDeleteImport();

  const columns: DataTableColumn<DataImportApiResponse>[] = [
    { header: 'File', key: 'file', render: (row) => <span className="font-medium text-slate-900">{row.originalFileName}</span> },
    { header: 'Target', key: 'target', render: (row) => `${row.targetSchema}.${row.targetTable}` },
    { header: 'Status', key: 'status', render: (row) => <ImportStatusBadge status={row.status} /> },
    {
      header: 'Progress / Rows',
      key: 'progress',
      render: (row) => (row.status === DataImportStatus.Completed ? `${formatRowCount(row.successfulRows)} rows` : `${row.progressPercent}%`),
    },
    { header: 'Size', key: 'size', render: (row) => formatBytes(row.fileSizeBytes) },
    { header: 'Started', key: 'started', render: (row) => (row.startedAt ? new Date(row.startedAt).toLocaleString() : '—') },
    { header: 'Duration', key: 'duration', render: (row) => formatDuration(row.startedAt, row.completedAt) },
    {
      header: 'Actions',
      key: 'actions',
      render: (row) => (
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/imports/${row.id}`} className="text-blue-600 hover:text-blue-700">
            View
          </Link>
          {row.status === DataImportStatus.Failed && (
            <button
              type="button"
              onClick={() => retry.mutate(row.id)}
              disabled={retry.isPending}
              className="text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              Retry
            </button>
          )}
          {row.status === DataImportStatus.Queued && (
            <button
              type="button"
              onClick={() => cancel.mutate(row.id)}
              disabled={cancel.isPending}
              className="text-slate-500 hover:text-slate-700 disabled:opacity-50"
            >
              Cancel Import
            </button>
          )}
          {([DataImportStatus.Completed, DataImportStatus.Failed, DataImportStatus.Cancelled] as DataImportStatus[]).includes(
            row.status,
          ) && (
            <button
              type="button"
              onClick={() => setPendingDelete(row)}
              aria-label={`Delete history for ${row.originalFileName}`}
              className="text-slate-400 hover:text-red-600"
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search by filename"
          aria-label="Search by filename"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
        />
        <select
          value={status ?? ''}
          onChange={(event) => {
            setStatus((event.target.value || undefined) as DataImportStatus | undefined);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {STATUS_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <DataTable columns={columns} rows={list.data?.items ?? []} getRowKey={(row) => row.id} emptyMessage="No imports match your filters." />

      {list.data && <Pagination page={page} limit={LIMIT} total={list.data.total} onPageChange={setPage} />}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete import history"
        description="This removes the SchemaIQ import record and retained source file where applicable. It does not delete data already imported into PostgreSQL."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
```

Create `apps/web/app/dashboard/imports/page.tsx`:

```tsx
'use client';

import { UploadCloud } from 'lucide-react';
import Link from 'next/link';

import { ImportsHistoryTable } from '../../../components/imports/imports-history-table';
import { ImportsMetrics } from '../../../components/imports/imports-metrics';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/page-header';
import { useOrganization } from '../../../lib/organization-context';
import { useImportsList } from '../../../lib/queries/imports-queries';

const IMPORT_CTA = (
  <Link href="/dashboard/imports/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
    Import CSV
  </Link>
);

export default function ImportsOverviewPage() {
  const { organizationId } = useOrganization();
  const totalCheck = useImportsList({ limit: 1, page: 1 });
  const hasNoImportsAtAll = Boolean(organizationId) && totalCheck.data?.total === 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Data Management"
        title="CSV Data Imports"
        description="Import large CSV datasets into PostgreSQL efficiently using SchemaIQ's streaming import engine."
        action={IMPORT_CTA}
      />

      {!organizationId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Set your development organization ID (top right) to view imports.
        </div>
      ) : hasNoImportsAtAll ? (
        <EmptyState
          icon={UploadCloud}
          title="Import your first dataset"
          description="Upload a CSV file and SchemaIQ will safely stream it into PostgreSQL."
          action={IMPORT_CTA}
        />
      ) : (
        <>
          <ImportsMetrics />
          <ImportsHistoryTable />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @schemaiq/web test -- imports-metrics.spec.tsx imports-history-table.spec.tsx app/dashboard/imports/page.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/imports/imports-metrics.tsx apps/web/components/imports/imports-history-table.tsx apps/web/app/dashboard/imports/page.tsx apps/web/components/imports/imports-metrics.spec.tsx apps/web/components/imports/imports-history-table.spec.tsx apps/web/app/dashboard/imports/page.spec.tsx
git commit -m "feat(web): add imports overview page with metrics, filters, and history table"
```

---

## Part F — Upload wizard

### Task 20: Client-side CSV header/sample preview

**Files:**
- Create: `apps/web/lib/csv-preview.ts`
- Test: `apps/web/lib/csv-preview.spec.ts`

**Interfaces:**
- Produces: `previewCsv(file: File, delimiter?: string): Promise<{headers: string[]; sampleRow: string[]}>` — consumed by the wizard page (Task 24) to build the mapping step without uploading the file first.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/csv-preview.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { previewCsv } from './csv-preview';

function csvFile(content: string): File {
  return new File([content], 'sample.csv', { type: 'text/csv' });
}

describe('previewCsv', () => {
  it('parses headers and the first sample row', async () => {
    const preview = await previewCsv(csvFile('first_name,surname,email\nJohn,Smith,john@example.com\n'));
    expect(preview.headers).toEqual(['first_name', 'surname', 'email']);
    expect(preview.sampleRow).toEqual(['John', 'Smith', 'john@example.com']);
  });

  it('respects quoted fields containing the delimiter', async () => {
    const preview = await previewCsv(csvFile('name,address\n"Doe, Jane","123 Main St"\n'));
    expect(preview.sampleRow).toEqual(['Doe, Jane', '123 Main St']);
  });

  it('respects a custom delimiter', async () => {
    const preview = await previewCsv(csvFile('a;b\n1;2\n'), ';');
    expect(preview.headers).toEqual(['a', 'b']);
    expect(preview.sampleRow).toEqual(['1', '2']);
  });

  it('returns an empty sample row when the file has only a header', async () => {
    const preview = await previewCsv(csvFile('a,b\n'));
    expect(preview.sampleRow).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @schemaiq/web test -- csv-preview.spec.ts`
Expected: FAIL — `./csv-preview` doesn't exist yet.

- [ ] **Step 3: Implement `apps/web/lib/csv-preview.ts`**

A lightweight, quote-aware line splitter — not a full RFC 4180 parser. It only needs to produce a header list and one sample row for the mapping UI; the backend remains the authority on actual parsing during import.

```ts
export interface CsvPreview {
  headers: string[];
  sampleRow: string[];
}

const PREVIEW_BYTES = 65_536;

export async function previewCsv(file: File, delimiter = ','): Promise<CsvPreview> {
  const text = await file.slice(0, PREVIEW_BYTES).text();
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.length > 0);
  const headerLine = lines[0];
  const sampleLine = lines[1];
  return {
    headers: headerLine ? splitCsvLine(headerLine, delimiter) : [],
    sampleRow: sampleLine ? splitCsvLine(sampleLine, delimiter) : [],
  };
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @schemaiq/web test -- csv-preview.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/csv-preview.ts apps/web/lib/csv-preview.spec.ts
git commit -m "feat(web): add lightweight client-side CSV header/sample preview"
```

---

### Task 21: `StepIndicator`, `FileDropzone`, `FileSummary`

**Files:**
- Create: `apps/web/components/imports/step-indicator.tsx`
- Create: `apps/web/components/imports/file-dropzone.tsx`
- Create: `apps/web/components/imports/file-summary.tsx`
- Test: `apps/web/components/imports/step-indicator.spec.tsx`
- Test: `apps/web/components/imports/file-dropzone.spec.tsx`
- Test: `apps/web/components/imports/file-summary.spec.tsx`

**Interfaces:**
- Consumes: `formatBytes` (Task 5).
- Produces: `StepIndicator({steps, currentStep})`, `FileDropzone({onFileSelected, error?})`, `FileSummary({file, onChange})` — consumed by the wizard page (Task 24).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/imports/step-indicator.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StepIndicator } from './step-indicator';

describe('StepIndicator', () => {
  it('marks the current step with aria-current and leaves other steps unmarked', () => {
    render(<StepIndicator steps={['Upload', 'Destination', 'Map Columns', 'Review', 'Import']} currentStep={2} />);

    expect(screen.getByText('Map Columns').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Import').closest('li')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Upload').closest('li')).not.toHaveAttribute('aria-current');
  });
});
```

Create `apps/web/components/imports/file-dropzone.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FileDropzone } from './file-dropzone';

describe('FileDropzone', () => {
  it('calls onFileSelected when a file is chosen via the picker', async () => {
    const onFileSelected = vi.fn();
    const user = userEvent.setup();
    render(<FileDropzone onFileSelected={onFileSelected} />);
    const file = new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' });

    await user.upload(screen.getByLabelText('Upload CSV file'), file);

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it('calls onFileSelected when a file is dropped', () => {
    const onFileSelected = vi.fn();
    const file = new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' });
    const { container } = render(<FileDropzone onFileSelected={onFileSelected} />);
    const dropzone = container.querySelector('[data-testid="file-dropzone"]') as HTMLElement;

    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it('shows a validation error message near the uploader', () => {
    render(<FileDropzone onFileSelected={vi.fn()} error="Unsupported file type" />);
    expect(screen.getByText('Unsupported file type')).toBeInTheDocument();
  });
});
```

Create `apps/web/components/imports/file-summary.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FileSummary } from './file-summary';

describe('FileSummary', () => {
  it('renders the file name and formatted size, and calls onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const file = new File(['a'.repeat(2048)], 'customers_2026.csv', { type: 'text/csv' });
    render(<FileSummary file={file} onChange={onChange} />);

    expect(screen.getByText('customers_2026.csv')).toBeInTheDocument();
    expect(screen.getByText(/2.0 KB/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Change' }));
    expect(onChange).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @schemaiq/web test -- step-indicator.spec.tsx file-dropzone.spec.tsx file-summary.spec.tsx`
Expected: FAIL — none of the three components exist yet.

- [ ] **Step 3: Implement**

Create `apps/web/components/imports/step-indicator.tsx`:

```tsx
import { Check } from 'lucide-react';

interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((step, index) => {
        const state = index < currentStep ? 'complete' : index === currentStep ? 'current' : 'upcoming';
        return (
          <li key={step} aria-current={state === 'current' ? 'step' : undefined} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                state === 'complete'
                  ? 'bg-blue-600 text-white'
                  : state === 'current'
                    ? 'border-2 border-blue-600 text-blue-600'
                    : 'border border-slate-300 text-slate-400'
              }`}
            >
              {state === 'complete' ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span className={state === 'upcoming' ? 'text-slate-400' : 'text-slate-900'}>{step}</span>
            {index < steps.length - 1 && <span aria-hidden="true" className="mx-2 h-px w-6 bg-slate-300" />}
          </li>
        );
      })}
    </ol>
  );
}
```

Create `apps/web/components/imports/file-dropzone.tsx`:

```tsx
'use client';

import { UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';

interface FileDropzoneProps {
  onFileSelected: (file: File) => void;
  error?: string;
}

export function FileDropzone({ onFileSelected, error }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null): void {
    const file = files?.[0];
    if (file) onFileSelected(file);
  }

  return (
    <div>
      <div
        data-testid="file-dropzone"
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center ${
          isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-white'
        }`}
      >
        <UploadCloud className="h-10 w-10 text-blue-600" aria-hidden="true" />
        <p className="mt-4 text-base font-medium text-slate-900">Drop your CSV file here</p>
        <p className="mt-1 text-sm text-slate-500">
          or{' '}
          <button type="button" onClick={() => inputRef.current?.click()} className="font-medium text-blue-600 hover:text-blue-700">
            choose a file
          </button>
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="Upload CSV file"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

Create `apps/web/components/imports/file-summary.tsx`:

```tsx
import { FileText } from 'lucide-react';

import { formatBytes } from '../../lib/format';

interface FileSummaryProps {
  file: File;
  onChange: () => void;
}

export function FileSummary({ file, onChange }: FileSummaryProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-blue-600" aria-hidden="true" />
        <div>
          <p className="font-medium text-slate-900">{file.name}</p>
          <p className="text-sm text-slate-500">{formatBytes(file.size)} · CSV</p>
        </div>
      </div>
      <button type="button" onClick={onChange} className="text-sm font-medium text-blue-600 hover:text-blue-700">
        Change
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @schemaiq/web test -- step-indicator.spec.tsx file-dropzone.spec.tsx file-summary.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/imports/step-indicator.tsx apps/web/components/imports/file-dropzone.tsx apps/web/components/imports/file-summary.tsx apps/web/components/imports/step-indicator.spec.tsx apps/web/components/imports/file-dropzone.spec.tsx apps/web/components/imports/file-summary.spec.tsx
git commit -m "feat(web): add StepIndicator, FileDropzone, and FileSummary"
```

---

### Task 22: Required-column helper and `DestinationStep`

**Files:**
- Create: `apps/web/lib/target-columns.ts`
- Create: `apps/web/components/imports/destination-step.tsx`
- Test: `apps/web/lib/target-columns.spec.ts`
- Test: `apps/web/components/imports/destination-step.spec.tsx`

**Interfaces:**
- Consumes: `useImportSchemas`, `useImportTables`, `useImportTableDetails` (Task 16); `ImportTargetColumnResponse` from `@schemaiq/types`.
- Produces: `isRequiredColumn(column): boolean`, `requiredColumns(columns): ImportTargetColumnResponse[]` — this exact predicate is reused unchanged by `column-mapping.ts` (Task 23) so the "required" definition never diverges between the destination summary and the mapping validation; `DestinationStep({schema, table, onSchemaChange, onTableChange})` — consumed by the wizard page (Task 24).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/target-columns.spec.ts`:

```ts
import type { ImportTargetColumnResponse } from '@schemaiq/types';
import { describe, expect, it } from 'vitest';

import { isRequiredColumn, requiredColumns } from './target-columns';

function column(overrides: Partial<ImportTargetColumnResponse> = {}): ImportTargetColumnResponse {
  return {
    dataType: 'text',
    hasDefault: false,
    isGenerated: false,
    isIdentity: false,
    isNullable: false,
    name: 'value',
    ...overrides,
  };
}

describe('isRequiredColumn', () => {
  it('is required when not nullable, no default, not generated, and not an identity column', () => {
    expect(isRequiredColumn(column())).toBe(true);
  });

  it('is not required when nullable', () => {
    expect(isRequiredColumn(column({ isNullable: true }))).toBe(false);
  });

  it('is not required when it has a default', () => {
    expect(isRequiredColumn(column({ hasDefault: true }))).toBe(false);
  });

  it('is not required when generated', () => {
    expect(isRequiredColumn(column({ isGenerated: true }))).toBe(false);
  });

  it('is not required when an identity column', () => {
    expect(isRequiredColumn(column({ isIdentity: true }))).toBe(false);
  });
});

describe('requiredColumns', () => {
  it('filters to only the required columns', () => {
    const columns = [column({ name: 'a' }), column({ isNullable: true, name: 'b' })];
    expect(requiredColumns(columns).map((entry) => entry.name)).toEqual(['a']);
  });
});
```

Create `apps/web/components/imports/destination-step.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useImportSchemasMock = vi.fn();
const useImportTablesMock = vi.fn();
const useImportTableDetailsMock = vi.fn();

vi.mock('../../lib/queries/imports-queries', () => ({
  useImportSchemas: () => useImportSchemasMock(),
  useImportTableDetails: (...args: unknown[]) => useImportTableDetailsMock(...args),
  useImportTables: (...args: unknown[]) => useImportTablesMock(...args),
}));

import { DestinationStep } from './destination-step';

describe('DestinationStep', () => {
  beforeEach(() => {
    useImportSchemasMock.mockReturnValue({ data: [{ name: 'public' }, { name: 'analytics' }] });
    useImportTablesMock.mockReturnValue({ data: [] });
    useImportTableDetailsMock.mockReturnValue({ data: undefined });
  });

  it('lists schemas and reports the selection', async () => {
    const onSchemaChange = vi.fn();
    const user = userEvent.setup();
    render(<DestinationStep schema={null} table={null} onSchemaChange={onSchemaChange} onTableChange={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('Schema'), 'public');

    expect(onSchemaChange).toHaveBeenCalledWith('public');
  });

  it('only shows the table select once a schema is chosen', () => {
    render(<DestinationStep schema={null} table={null} onSchemaChange={vi.fn()} onTableChange={vi.fn()} />);
    expect(screen.queryByLabelText('Table')).not.toBeInTheDocument();
  });

  it('shows column, required-field, and generated-field counts once details load', () => {
    useImportTablesMock.mockReturnValue({ data: [{ columnCount: 3, name: 'customers' }] });
    useImportTableDetailsMock.mockReturnValue({
      data: {
        columns: [
          { dataType: 'uuid', hasDefault: true, isGenerated: false, isIdentity: false, isNullable: false, name: 'id' },
          { dataType: 'text', hasDefault: false, isGenerated: false, isIdentity: false, isNullable: false, name: 'email' },
          { dataType: 'timestamptz', hasDefault: true, isGenerated: false, isIdentity: false, isNullable: true, name: 'created_at' },
        ],
        schema: 'public',
        table: 'customers',
      },
    });

    render(<DestinationStep schema="public" table="customers" onSchemaChange={vi.fn()} onTableChange={vi.fn()} />);

    expect(screen.getByText('public.customers')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @schemaiq/web test -- target-columns.spec.ts destination-step.spec.tsx`
Expected: FAIL — neither module exists yet.

- [ ] **Step 3: Implement**

Create `apps/web/lib/target-columns.ts`:

```ts
import type { ImportTargetColumnResponse } from '@schemaiq/types';

export function isRequiredColumn(column: ImportTargetColumnResponse): boolean {
  return !column.isNullable && !column.hasDefault && !column.isGenerated && !column.isIdentity;
}

export function requiredColumns(columns: ImportTargetColumnResponse[]): ImportTargetColumnResponse[] {
  return columns.filter(isRequiredColumn);
}
```

Create `apps/web/components/imports/destination-step.tsx`:

```tsx
'use client';

import { useImportSchemas, useImportTableDetails, useImportTables } from '../../lib/queries/imports-queries';
import { requiredColumns } from '../../lib/target-columns';

interface DestinationStepProps {
  schema: string | null;
  table: string | null;
  onSchemaChange: (schema: string | null) => void;
  onTableChange: (table: string | null) => void;
}

export function DestinationStep({ schema, table, onSchemaChange, onTableChange }: DestinationStepProps) {
  const schemas = useImportSchemas();
  const tables = useImportTables(schema);
  const details = useImportTableDetails(schema, table);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <label htmlFor="target-schema" className="text-sm font-medium text-slate-700">
          Schema
        </label>
        <select
          id="target-schema"
          value={schema ?? ''}
          onChange={(event) => {
            onSchemaChange(event.target.value || null);
            onTableChange(null);
          }}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
        >
          <option value="">Select a schema…</option>
          {schemas.data?.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      {schema && (
        <div>
          <label htmlFor="target-table" className="text-sm font-medium text-slate-700">
            Table
          </label>
          <select
            id="target-table"
            value={table ?? ''}
            onChange={(event) => onTableChange(event.target.value || null)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
          >
            <option value="">Select a table…</option>
            {tables.data?.map((item) => (
              <option key={item.name} value={item.name}>{`${item.name} (${item.columnCount} columns)`}</option>
            ))}
          </select>
        </div>
      )}

      {schema && table && details.data && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Target</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{`${schema}.${table}`}</p>
          <dl className="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Columns</dt>
              <dd className="text-slate-900">{details.data.columns.length}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Required fields</dt>
              <dd className="text-slate-900">{requiredColumns(details.data.columns).length}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Generated/default fields</dt>
              <dd className="text-slate-900">
                {details.data.columns.filter((column) => column.isGenerated || column.hasDefault || column.isIdentity).length}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @schemaiq/web test -- target-columns.spec.ts destination-step.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/target-columns.ts apps/web/components/imports/destination-step.tsx apps/web/lib/target-columns.spec.ts apps/web/components/imports/destination-step.spec.tsx
git commit -m "feat(web): add DestinationStep with schema/table selection and required-field summary"
```

---

### Task 23: Column-mapping logic and `ColumnMappingTable`

**Files:**
- Create: `apps/web/lib/column-mapping.ts`
- Create: `apps/web/components/imports/column-mapping-table.tsx`
- Test: `apps/web/lib/column-mapping.spec.ts`
- Test: `apps/web/components/imports/column-mapping-table.spec.tsx`

**Interfaces:**
- Consumes: `requiredColumns` (Task 22); `ImportTargetColumnResponse` from `@schemaiq/types`.
- Produces: `ColumnMapping {csvHeader, sample, targetColumn}`, `initializeMapping(csvHeaders, sampleRow, targetColumns): ColumnMapping[]`, `mappingRowStatus(row): 'matched'|'review'|'unmapped'`, `summarizeMapping(mapping, targetColumns): {matched, review, unmapped, missingRequiredColumns}`, `mappingToColumnMapping(mapping): Record<string,string>` (the exact shape the backend's `columnMapping` field expects, per spec §2.1) — all consumed by the wizard page (Task 24). `ColumnMappingTable({mapping, targetColumns, onChange})` — consumed by the wizard page (Task 24).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/column-mapping.spec.ts`:

```ts
import type { ImportTargetColumnResponse } from '@schemaiq/types';
import { describe, expect, it } from 'vitest';

import { initializeMapping, mappingRowStatus, mappingToColumnMapping, summarizeMapping } from './column-mapping';

const targetColumns: ImportTargetColumnResponse[] = [
  { dataType: 'text', hasDefault: false, isGenerated: false, isIdentity: false, isNullable: false, name: 'email' },
  { dataType: 'text', hasDefault: false, isGenerated: false, isIdentity: false, isNullable: false, name: 'last_name' },
  { dataType: 'uuid', hasDefault: true, isGenerated: false, isIdentity: false, isNullable: false, name: 'id' },
];

describe('initializeMapping', () => {
  it('auto-matches CSV headers that exactly match a target column name and leaves the rest unmapped', () => {
    const mapping = initializeMapping(['email', 'surname'], ['john@example.com', 'Smith'], targetColumns);
    expect(mapping).toEqual([
      { csvHeader: 'email', sample: 'john@example.com', targetColumn: 'email' },
      { csvHeader: 'surname', sample: 'Smith', targetColumn: null },
    ]);
  });
});

describe('mappingRowStatus', () => {
  it('is matched when the csv header equals its target column', () => {
    expect(mappingRowStatus({ csvHeader: 'email', sample: '', targetColumn: 'email' })).toBe('matched');
  });

  it('is review when mapped to a differently named target column', () => {
    expect(mappingRowStatus({ csvHeader: 'surname', sample: '', targetColumn: 'last_name' })).toBe('review');
  });

  it('is unmapped when there is no target column', () => {
    expect(mappingRowStatus({ csvHeader: 'unknown_code', sample: '', targetColumn: null })).toBe('unmapped');
  });
});

describe('summarizeMapping', () => {
  it('counts matched, review, and unmapped rows', () => {
    const mapping = [
      { csvHeader: 'email', sample: '', targetColumn: 'email' },
      { csvHeader: 'surname', sample: '', targetColumn: 'last_name' },
      { csvHeader: 'unknown_code', sample: '', targetColumn: null },
    ];

    expect(summarizeMapping(mapping, targetColumns)).toEqual({ matched: 1, missingRequiredColumns: [], review: 1, unmapped: 1 });
  });

  it('reports a required target column with no mapping', () => {
    const mapping = [{ csvHeader: 'email', sample: '', targetColumn: 'email' }];

    expect(summarizeMapping(mapping, targetColumns).missingRequiredColumns).toEqual(['last_name']);
  });
});

describe('mappingToColumnMapping', () => {
  it('converts to a csvHeader-to-targetColumn record, omitting unmapped rows', () => {
    const mapping = [
      { csvHeader: 'email', sample: '', targetColumn: 'email' },
      { csvHeader: 'unknown_code', sample: '', targetColumn: null },
    ];

    expect(mappingToColumnMapping(mapping)).toEqual({ email: 'email' });
  });
});
```

Create `apps/web/components/imports/column-mapping-table.spec.tsx`:

```tsx
import type { ImportTargetColumnResponse } from '@schemaiq/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ColumnMappingTable } from './column-mapping-table';

const targetColumns: ImportTargetColumnResponse[] = [
  { dataType: 'text', hasDefault: false, isGenerated: false, isIdentity: false, isNullable: false, name: 'email' },
  { dataType: 'text', hasDefault: false, isGenerated: false, isIdentity: false, isNullable: false, name: 'last_name' },
];

const mapping = [
  { csvHeader: 'email', sample: 'john@example.com', targetColumn: 'email' },
  { csvHeader: 'surname', sample: 'Smith', targetColumn: null },
];

describe('ColumnMappingTable', () => {
  it('shows Matched for an exact-name auto-mapped column and Unmapped for one with no target', () => {
    render(<ColumnMappingTable mapping={mapping} targetColumns={targetColumns} onChange={vi.fn()} />);
    expect(screen.getByText('Matched')).toBeInTheDocument();
    expect(screen.getByText('Unmapped')).toBeInTheDocument();
  });

  it('calls onChange with the row index and the newly selected target column', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColumnMappingTable mapping={mapping} targetColumns={targetColumns} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Target column for surname'), 'last_name');

    expect(onChange).toHaveBeenCalledWith(1, 'last_name');
  });

  it('calls onChange with null when Do not import is selected', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColumnMappingTable mapping={mapping} targetColumns={targetColumns} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Target column for email'), '');

    expect(onChange).toHaveBeenCalledWith(0, null);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @schemaiq/web test -- column-mapping.spec.ts column-mapping-table.spec.tsx`
Expected: FAIL — neither module exists yet.

- [ ] **Step 3: Implement**

Create `apps/web/lib/column-mapping.ts`:

```ts
import type { ImportTargetColumnResponse } from '@schemaiq/types';

import { requiredColumns } from './target-columns';

export interface ColumnMapping {
  csvHeader: string;
  sample: string;
  targetColumn: string | null;
}

export type MappingRowStatus = 'matched' | 'review' | 'unmapped';

export function initializeMapping(csvHeaders: string[], sampleRow: string[], targetColumns: ImportTargetColumnResponse[]): ColumnMapping[] {
  const targetNames = new Set(targetColumns.map((column) => column.name));
  return csvHeaders.map((csvHeader, index) => ({
    csvHeader,
    sample: sampleRow[index] ?? '',
    targetColumn: targetNames.has(csvHeader) ? csvHeader : null,
  }));
}

export function mappingRowStatus(row: ColumnMapping): MappingRowStatus {
  if (!row.targetColumn) return 'unmapped';
  return row.targetColumn === row.csvHeader ? 'matched' : 'review';
}

export interface MappingSummary {
  matched: number;
  review: number;
  unmapped: number;
  missingRequiredColumns: string[];
}

export function summarizeMapping(mapping: ColumnMapping[], targetColumns: ImportTargetColumnResponse[]): MappingSummary {
  let matched = 0;
  let review = 0;
  let unmapped = 0;
  const mappedTargets = new Set<string>();
  for (const row of mapping) {
    const status = mappingRowStatus(row);
    if (status === 'matched') matched += 1;
    else if (status === 'review') review += 1;
    else unmapped += 1;
    if (row.targetColumn) mappedTargets.add(row.targetColumn);
  }
  const missingRequiredColumns = requiredColumns(targetColumns)
    .filter((column) => !mappedTargets.has(column.name))
    .map((column) => column.name);
  return { matched, missingRequiredColumns, review, unmapped };
}

export function mappingToColumnMapping(mapping: ColumnMapping[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of mapping) {
    if (row.targetColumn) result[row.csvHeader] = row.targetColumn;
  }
  return result;
}
```

Create `apps/web/components/imports/column-mapping-table.tsx`:

```tsx
'use client';

import type { ImportTargetColumnResponse } from '@schemaiq/types';

import { mappingRowStatus, type ColumnMapping } from '../../lib/column-mapping';

interface ColumnMappingTableProps {
  mapping: ColumnMapping[];
  targetColumns: ImportTargetColumnResponse[];
  onChange: (index: number, targetColumn: string | null) => void;
}

const STATUS_LABEL = { matched: 'Matched', review: 'Review', unmapped: 'Unmapped' } as const;
const STATUS_CLASS = {
  matched: 'bg-emerald-100 text-emerald-700',
  review: 'bg-amber-100 text-amber-700',
  unmapped: 'bg-slate-100 text-slate-600',
} as const;

export function ColumnMappingTable({ mapping, targetColumns, onChange }: ColumnMappingTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">CSV Column</th>
            <th className="px-4 py-3">Sample</th>
            <th className="px-4 py-3">Postgres Column</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {mapping.map((row, index) => {
            const status = mappingRowStatus(row);
            return (
              <tr key={row.csvHeader}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.csvHeader}</td>
                <td className="px-4 py-3 text-slate-500">{row.sample || '—'}</td>
                <td className="px-4 py-3">
                  <select
                    aria-label={`Target column for ${row.csvHeader}`}
                    value={row.targetColumn ?? ''}
                    onChange={(event) => onChange(index, event.target.value || null)}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Do not import</option>
                    {targetColumns.map((column) => (
                      <option key={column.name} value={column.name}>
                        {`${column.name} (${column.dataType}${
                          !column.isNullable && !column.hasDefault && !column.isGenerated && !column.isIdentity ? ', required' : ''
                        })`}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @schemaiq/web test -- column-mapping.spec.ts column-mapping-table.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/column-mapping.ts apps/web/components/imports/column-mapping-table.tsx apps/web/lib/column-mapping.spec.ts apps/web/components/imports/column-mapping-table.spec.tsx
git commit -m "feat(web): add column-mapping logic and ColumnMappingTable"
```

---

### Task 24: `ImportSummary` and the wizard page

**Files:**
- Create: `apps/web/components/imports/import-summary.tsx`
- Create: `apps/web/app/dashboard/imports/new/page.tsx`
- Test: `apps/web/components/imports/import-summary.spec.tsx`
- Test: `apps/web/app/dashboard/imports/new/page.spec.tsx`

**Interfaces:**
- Consumes: everything from Tasks 20-23 (`previewCsv`, `initializeMapping`/`summarizeMapping`/`mappingToColumnMapping`, `StepIndicator`, `FileDropzone`/`FileSummary`, `DestinationStep`, `ColumnMappingTable`), `useImportConfig`/`useImportTableDetails` (Task 16), `useCreateImport` (Task 16), `ProgressBar` (Task 12), `formatBytes` (Task 5).
- Produces: `ImportSummary({fileName, fileSize, schema, table, matchedCount, ignoredCount, totalColumns, isLarge, onBack, onStart})` — used only by this page. The wizard's reducer/state shape is page-local (no other task imports it), matching the design's "state in a single reducer local to the page component."

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/imports/import-summary.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ImportSummary } from './import-summary';

describe('ImportSummary', () => {
  it('renders the file, destination, mapping, and processing-mode summary', () => {
    render(
      <ImportSummary
        fileName="customers_2026.csv"
        fileSize="382.4 MB"
        schema="public"
        table="customers"
        matchedCount={18}
        ignoredCount={2}
        totalColumns={20}
        isLarge
        onBack={vi.fn()}
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText('customers_2026.csv')).toBeInTheDocument();
    expect(screen.getByText('382.4 MB')).toBeInTheDocument();
    expect(screen.getByText('public.customers')).toBeInTheDocument();
    expect(screen.getByText('20 CSV columns')).toBeInTheDocument();
    expect(screen.getByText('18 imported · 2 ignored')).toBeInTheDocument();
    expect(screen.getByText('Background import')).toBeInTheDocument();
  });

  it('describes immediate processing for a small file', () => {
    render(
      <ImportSummary
        fileName="small.csv"
        fileSize="4 KB"
        schema="public"
        table="customers"
        matchedCount={2}
        ignoredCount={0}
        totalColumns={2}
        isLarge={false}
        onBack={vi.fn()}
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText('Immediate import')).toBeInTheDocument();
  });

  it('calls onBack and onStart', async () => {
    const onBack = vi.fn();
    const onStart = vi.fn();
    const user = userEvent.setup();
    render(
      <ImportSummary
        fileName="small.csv"
        fileSize="4 KB"
        schema="public"
        table="customers"
        matchedCount={2}
        ignoredCount={0}
        totalColumns={2}
        isLarge={false}
        onBack={onBack}
        onStart={onStart}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Start Import' }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledOnce();
  });
});
```

Create `apps/web/app/dashboard/imports/new/page.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const useImportConfigMock = vi.fn();
const useImportTableDetailsMock = vi.fn();
vi.mock('../../../../lib/queries/imports-queries', () => ({
  useImportConfig: () => useImportConfigMock(),
  useImportTableDetails: (...args: unknown[]) => useImportTableDetailsMock(...args),
}));

const mutateAsync = vi.fn();
vi.mock('../../../../lib/queries/imports-mutations', () => ({
  useCreateImport: () => ({ mutateAsync }),
}));

vi.mock('../../../../components/imports/file-dropzone', () => ({
  FileDropzone: ({ onFileSelected }: { onFileSelected: (file: File) => void }) => (
    <button
      onClick={() => onFileSelected(new File(['email,last_name\njohn@example.com,Smith'], 'customers.csv', { type: 'text/csv' }))}
    >
      mock-upload
    </button>
  ),
}));
vi.mock('../../../../components/imports/file-summary', () => ({
  FileSummary: ({ file }: { file: File }) => <div>{file.name}</div>,
}));
vi.mock('../../../../components/imports/destination-step', () => ({
  DestinationStep: ({
    onSchemaChange,
    onTableChange,
  }: {
    onSchemaChange: (schema: string) => void;
    onTableChange: (table: string) => void;
  }) => (
    <div>
      <button onClick={() => onSchemaChange('public')}>mock-select-schema</button>
      <button onClick={() => onTableChange('customers')}>mock-select-table</button>
    </div>
  ),
}));
vi.mock('../../../../components/imports/column-mapping-table', () => ({
  ColumnMappingTable: () => <div>mock-mapping-table</div>,
}));
vi.mock('../../../../components/imports/import-summary', () => ({
  ImportSummary: ({ onStart }: { onStart: () => void }) => <button onClick={onStart}>mock-start-import</button>,
}));

import NewImportPage from './page';

const requiredColumn = { dataType: 'text', hasDefault: false, isGenerated: false, isIdentity: false, isNullable: false, name: 'email' };
const matchedColumn = { dataType: 'text', hasDefault: false, isGenerated: false, isIdentity: false, isNullable: false, name: 'last_name' };

describe('NewImportPage', () => {
  beforeEach(() => {
    pushMock.mockClear();
    mutateAsync.mockClear();
    useImportConfigMock.mockReturnValue({ data: { queueThresholdBytes: 5_242_880 } });
    useImportTableDetailsMock.mockReturnValue({
      data: { columns: [requiredColumn, matchedColumn], schema: 'public', table: 'customers' },
    });
  });

  it('does not allow continuing past Upload until a file is chosen', async () => {
    const user = userEvent.setup();
    render(<NewImportPage />);

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await user.click(screen.getByText('mock-upload'));

    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled();
  });

  it('does not allow continuing past Destination until schema and table are chosen', async () => {
    const user = userEvent.setup();
    render(<NewImportPage />);
    await user.click(screen.getByText('mock-upload'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await user.click(screen.getByText('mock-select-schema'));
    await user.click(screen.getByText('mock-select-table'));

    expect(screen.getByRole('button', { name: 'Continue' })).not.toBeDisabled();
  });

  it('starts the import with the auto-matched column mapping and navigates to the detail page on success', async () => {
    mutateAsync.mockResolvedValue({ data: { id: 'import-123' }, status: 201 });
    const user = userEvent.setup();
    render(<NewImportPage />);

    await user.click(screen.getByText('mock-upload'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByText('mock-select-schema'));
    await user.click(screen.getByText('mock-select-table'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByText('mock-start-import'));

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          columnMapping: { email: 'email', last_name: 'last_name' },
          targetSchema: 'public',
          targetTable: 'customers',
        }),
      }),
    );
    await vi.waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard/imports/import-123'));
  });

  it('shows a friendly error and does not navigate when starting the import fails', async () => {
    mutateAsync.mockRejectedValue(new Error('SchemaIQ could not reach the server. Check your connection and try again.'));
    const user = userEvent.setup();
    render(<NewImportPage />);

    await user.click(screen.getByText('mock-upload'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByText('mock-select-schema'));
    await user.click(screen.getByText('mock-select-table'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByText('mock-start-import'));

    await screen.findByText("We couldn't start the import");
    expect(screen.getByText(/SchemaIQ could not reach the server/)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @schemaiq/web test -- import-summary.spec.tsx app/dashboard/imports/new/page.spec.tsx`
Expected: FAIL — neither module exists yet.

- [ ] **Step 3: Implement**

Create `apps/web/components/imports/import-summary.tsx`:

```tsx
interface ImportSummaryProps {
  fileName: string;
  fileSize: string;
  schema: string;
  table: string;
  matchedCount: number;
  ignoredCount: number;
  totalColumns: number;
  isLarge: boolean;
  onBack: () => void;
  onStart: () => void;
}

export function ImportSummary({
  fileName,
  fileSize,
  schema,
  table,
  matchedCount,
  ignoredCount,
  totalColumns,
  isLarge,
  onBack,
  onStart,
}: ImportSummaryProps) {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-slate-900">Review import</h2>
      <div className="grid gap-6 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">File</p>
          <p className="mt-1 text-slate-900">{fileName}</p>
          <p className="text-sm text-slate-500">{fileSize}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Destination</p>
          <p className="mt-1 text-slate-900">SchemaIQ PostgreSQL</p>
          <p className="text-sm text-slate-500">{`${schema}.${table}`}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mapping</p>
          <p className="mt-1 text-slate-900">{totalColumns} CSV columns</p>
          <p className="text-sm text-slate-500">
            {matchedCount} imported · {ignoredCount} ignored
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Processing</p>
          <p className="mt-1 text-slate-900">{isLarge ? 'Background import' : 'Immediate import'}</p>
          <p className="text-sm text-slate-500">
            {isLarge
              ? 'Large files are automatically queued and streamed into PostgreSQL.'
              : 'This file will be imported immediately.'}
          </p>
        </div>
      </div>
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        SchemaIQ uses PostgreSQL&apos;s bulk import pipeline. The CSV is streamed rather than loaded entirely into application memory.
      </p>
      <div className="flex justify-between">
        <button type="button" onClick={onBack} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700">
          Back
        </button>
        <button type="button" onClick={onStart} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
          Start Import
        </button>
      </div>
    </div>
  );
}
```

Create `apps/web/app/dashboard/imports/new/page.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useReducer } from 'react';

import { ColumnMappingTable } from '../../../../components/imports/column-mapping-table';
import { DestinationStep } from '../../../../components/imports/destination-step';
import { FileDropzone } from '../../../../components/imports/file-dropzone';
import { FileSummary } from '../../../../components/imports/file-summary';
import { ImportSummary } from '../../../../components/imports/import-summary';
import { StepIndicator } from '../../../../components/imports/step-indicator';
import { PageHeader } from '../../../../components/ui/page-header';
import { ProgressBar } from '../../../../components/ui/progress-bar';
import { initializeMapping, mappingToColumnMapping, summarizeMapping, type ColumnMapping } from '../../../../lib/column-mapping';
import { previewCsv } from '../../../../lib/csv-preview';
import { formatBytes } from '../../../../lib/format';
import { useCreateImport } from '../../../../lib/queries/imports-mutations';
import { useImportConfig, useImportTableDetails } from '../../../../lib/queries/imports-queries';

const STEPS = ['Upload', 'Destination', 'Map Columns', 'Review', 'Import'];

interface WizardState {
  step: number;
  file: File | null;
  csvHeaders: string[];
  sampleRow: string[];
  schema: string | null;
  table: string | null;
  mapping: ColumnMapping[];
  uploadProgress: number | null;
  submitError: string | null;
}

type WizardAction =
  | { type: 'SET_FILE'; file: File; csvHeaders: string[]; sampleRow: string[] }
  | { type: 'CLEAR_FILE' }
  | { type: 'GO_TO_STEP'; step: number }
  | { type: 'SET_SCHEMA'; schema: string | null }
  | { type: 'SET_TABLE'; table: string | null }
  | { type: 'INIT_MAPPING'; mapping: ColumnMapping[] }
  | { type: 'UPDATE_MAPPING_ROW'; index: number; targetColumn: string | null }
  | { type: 'SET_UPLOAD_PROGRESS'; progress: number | null }
  | { type: 'SET_SUBMIT_ERROR'; message: string | null };

const INITIAL_STATE: WizardState = {
  csvHeaders: [],
  file: null,
  mapping: [],
  sampleRow: [],
  schema: null,
  step: 0,
  submitError: null,
  table: null,
  uploadProgress: null,
};

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_FILE':
      return { ...state, csvHeaders: action.csvHeaders, file: action.file, sampleRow: action.sampleRow };
    case 'CLEAR_FILE':
      return { ...INITIAL_STATE };
    case 'GO_TO_STEP':
      return { ...state, step: action.step };
    case 'SET_SCHEMA':
      return { ...state, mapping: [], schema: action.schema, table: null };
    case 'SET_TABLE':
      return { ...state, mapping: [], table: action.table };
    case 'INIT_MAPPING':
      return { ...state, mapping: action.mapping };
    case 'UPDATE_MAPPING_ROW':
      return {
        ...state,
        mapping: state.mapping.map((row, index) => (index === action.index ? { ...row, targetColumn: action.targetColumn } : row)),
      };
    case 'SET_UPLOAD_PROGRESS':
      return { ...state, uploadProgress: action.progress };
    case 'SET_SUBMIT_ERROR':
      return { ...state, submitError: action.message };
    default:
      return state;
  }
}

export default function NewImportPage() {
  const router = useRouter();
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_STATE);
  const config = useImportConfig();
  const details = useImportTableDetails(state.schema, state.table);
  const createImport = useCreateImport();

  useEffect(() => {
    if (details.data && state.file && state.mapping.length === 0) {
      dispatch({ mapping: initializeMapping(state.csvHeaders, state.sampleRow, details.data.columns), type: 'INIT_MAPPING' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details.data, state.file, state.csvHeaders, state.sampleRow, state.mapping.length]);

  const summary = details.data ? summarizeMapping(state.mapping, details.data.columns) : null;
  const isLarge = Boolean(config.data && state.file && state.file.size > config.data.queueThresholdBytes);
  const canContinueFromMapping = summary ? summary.missingRequiredColumns.length === 0 : false;

  async function handleFileSelected(file: File): Promise<void> {
    const preview = await previewCsv(file);
    dispatch({ csvHeaders: preview.headers, file, sampleRow: preview.sampleRow, type: 'SET_FILE' });
  }

  async function handleStartImport(): Promise<void> {
    if (!state.file || !state.schema || !state.table) return;
    dispatch({ message: null, type: 'SET_SUBMIT_ERROR' });
    dispatch({ progress: 0, type: 'SET_UPLOAD_PROGRESS' });
    try {
      const result = await createImport.mutateAsync({
        input: {
          columnMapping: mappingToColumnMapping(state.mapping),
          delimiter: ',',
          file: state.file,
          targetSchema: state.schema,
          targetTable: state.table,
        },
        onProgress: (percent) => dispatch({ progress: percent, type: 'SET_UPLOAD_PROGRESS' }),
      });
      router.push(`/dashboard/imports/${result.data.id}`);
    } catch (error) {
      dispatch({ progress: null, type: 'SET_UPLOAD_PROGRESS' });
      dispatch({ message: error instanceof Error ? error.message : 'The import could not be started.', type: 'SET_SUBMIT_ERROR' });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Data Imports" title="Import CSV" description="Upload, map, and start a new CSV import." />
      <StepIndicator steps={STEPS} currentStep={state.step} />

      {state.step === 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-slate-900">Upload your CSV</h2>
          <p className="text-sm text-slate-600">
            Choose the CSV file you want to import. Large files are automatically processed in the background.
          </p>
          {state.file ? (
            <FileSummary file={state.file} onChange={() => dispatch({ type: 'CLEAR_FILE' })} />
          ) : (
            <FileDropzone onFileSelected={(file) => void handleFileSelected(file)} />
          )}
          {isLarge && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <p className="font-medium">Large file detected</p>
              <p>This import will run in the background. You can safely leave this page after the upload is queued.</p>
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!state.file}
              onClick={() => dispatch({ step: 1, type: 'GO_TO_STEP' })}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {state.step === 1 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-slate-900">Choose where to import the data</h2>
          <DestinationStep
            schema={state.schema}
            table={state.table}
            onSchemaChange={(schema) => dispatch({ schema, type: 'SET_SCHEMA' })}
            onTableChange={(table) => dispatch({ table, type: 'SET_TABLE' })}
          />
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => dispatch({ step: 0, type: 'GO_TO_STEP' })}
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!state.schema || !state.table}
              onClick={() => dispatch({ step: 2, type: 'GO_TO_STEP' })}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {state.step === 2 && details.data && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-slate-900">Match your CSV columns</h2>
          <p className="text-sm text-slate-600">Confirm where each CSV column should be imported.</p>
          {summary && (
            <p className="text-sm text-slate-600">
              {summary.matched} matched · {summary.review} need review · {summary.unmapped} ignored
              {summary.missingRequiredColumns.length > 0 && ` · ${summary.missingRequiredColumns.length} required fields missing`}
            </p>
          )}
          <ColumnMappingTable
            mapping={state.mapping}
            targetColumns={details.data.columns}
            onChange={(index, targetColumn) => dispatch({ index, targetColumn, type: 'UPDATE_MAPPING_ROW' })}
          />
          {summary && summary.missingRequiredColumns.length > 0 && (
            <p className="text-sm text-red-600">
              Required column{summary.missingRequiredColumns.length > 1 ? 's' : ''} not mapped: {summary.missingRequiredColumns.join(', ')}
            </p>
          )}
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => dispatch({ step: 1, type: 'GO_TO_STEP' })}
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!canContinueFromMapping}
              onClick={() => dispatch({ step: 3, type: 'GO_TO_STEP' })}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {state.step === 3 && state.file && state.schema && state.table && summary && (
        <ImportSummary
          fileName={state.file.name}
          fileSize={formatBytes(state.file.size)}
          schema={state.schema}
          table={state.table}
          matchedCount={summary.matched + summary.review}
          ignoredCount={summary.unmapped}
          totalColumns={state.mapping.length}
          isLarge={isLarge}
          onBack={() => dispatch({ step: 2, type: 'GO_TO_STEP' })}
          onStart={() => {
            dispatch({ step: 4, type: 'GO_TO_STEP' });
            void handleStartImport();
          }}
        />
      )}

      {state.step === 4 && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          {state.submitError ? (
            <>
              <p className="text-lg font-semibold text-slate-900">We couldn&apos;t start the import</p>
              <p className="max-w-md text-sm text-slate-600">{state.submitError}</p>
              <button
                type="button"
                onClick={() => dispatch({ step: 3, type: 'GO_TO_STEP' })}
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
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @schemaiq/web test -- import-summary.spec.tsx app/dashboard/imports/new/page.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full web test suite and commit**

Run: `pnpm --filter @schemaiq/web test`
Expected: PASS — every test from Tasks 5-24.

```bash
git add apps/web/components/imports/import-summary.tsx apps/web/app/dashboard/imports/new/page.tsx apps/web/components/imports/import-summary.spec.tsx apps/web/app/dashboard/imports/new/page.spec.tsx
git commit -m "feat(web): add the 5-step CSV import wizard"
```

---

## Part G — Import detail page

### Task 25: `ImportProgress` and `ErrorPanel`

**Files:**
- Create: `apps/web/components/imports/import-progress.tsx`
- Create: `apps/web/components/imports/error-panel.tsx`
- Test: `apps/web/components/imports/import-progress.spec.tsx`
- Test: `apps/web/components/imports/error-panel.spec.tsx`

**Interfaces:**
- Consumes: `ProgressBar` (Task 12), `formatBytes`/`formatRowCount` (Task 5), `friendlyImportErrorMessage` (Task 9).
- Produces: `ImportProgress({percent, processedBytes, fileSizeBytes, processedRows, totalRows})`, `ErrorPanel({errorCode, errorMessage})` — consumed by the import detail page (Task 26).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/components/imports/import-progress.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ImportProgress } from './import-progress';

describe('ImportProgress', () => {
  it('shows the progress bar and processed/total bytes', () => {
    render(
      <ImportProgress percent={74} processedBytes="3006477107" fileSizeBytes="4080218931" processedRows="36400000" totalRows="49180000" />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '74');
    expect(screen.getByText(/2.8 GB \/ 3.8 GB processed/)).toBeInTheDocument();
    expect(screen.getByText('36,400,000 rows processed')).toBeInTheDocument();
  });

  it('does not fabricate a row count when totalRows is unknown', () => {
    render(<ImportProgress percent={40} processedBytes="1000" fileSizeBytes="5000" processedRows={null} totalRows={null} />);
    expect(screen.queryByText(/rows processed/)).not.toBeInTheDocument();
  });
});
```

Create `apps/web/components/imports/error-panel.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ErrorPanel } from './error-panel';

describe('ErrorPanel', () => {
  it('shows a friendly message and keeps the raw code collapsed by default', () => {
    render(<ErrorPanel errorCode="IMPORT_POSTGRES_TYPE_ERROR" errorMessage="CSV values do not match the target column types" />);
    expect(screen.getByText(/don't match the column types/)).toBeInTheDocument();
    expect(screen.queryByText('IMPORT_POSTGRES_TYPE_ERROR')).not.toBeInTheDocument();
  });

  it('reveals the technical details on demand', async () => {
    const user = userEvent.setup();
    render(<ErrorPanel errorCode="IMPORT_POSTGRES_TYPE_ERROR" errorMessage="CSV values do not match the target column types" />);

    await user.click(screen.getByRole('button', { name: 'Technical details' }));

    expect(screen.getByText('IMPORT_POSTGRES_TYPE_ERROR')).toBeInTheDocument();
    expect(screen.getByText('CSV values do not match the target column types')).toBeInTheDocument();
  });

  it('falls back to the generic safe message when there is no error code', () => {
    render(<ErrorPanel errorCode={null} errorMessage={null} />);
    expect(screen.getByText("The import couldn't be completed safely. No partial data was written.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @schemaiq/web test -- import-progress.spec.tsx error-panel.spec.tsx`
Expected: FAIL — neither component exists yet.

- [ ] **Step 3: Implement**

Create `apps/web/components/imports/import-progress.tsx`:

```tsx
import { formatBytes, formatRowCount } from '../../lib/format';
import { ProgressBar } from '../ui/progress-bar';

interface ImportProgressProps {
  percent: number;
  processedBytes: string;
  fileSizeBytes: string;
  processedRows: string | null;
  totalRows: string | null;
}

export function ImportProgress({ percent, processedBytes, fileSizeBytes, processedRows, totalRows }: ImportProgressProps) {
  return (
    <div className="flex flex-col gap-3">
      <ProgressBar percent={percent} label="Importing data" />
      <p className="text-sm text-slate-600">
        {formatBytes(processedBytes)} / {formatBytes(fileSizeBytes)} processed
      </p>
      {totalRows && processedRows && <p className="text-sm text-slate-500">{formatRowCount(processedRows)} rows processed</p>}
    </div>
  );
}
```

Create `apps/web/components/imports/error-panel.tsx`:

```tsx
'use client';

import { useState } from 'react';

import { friendlyImportErrorMessage } from '../../lib/error-copy';

interface ErrorPanelProps {
  errorCode: string | null;
  errorMessage: string | null;
}

export function ErrorPanel({ errorCode, errorMessage }: ErrorPanelProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5">
      <h3 className="text-base font-semibold text-red-900">Import could not be completed</h3>
      <p className="mt-2 text-sm text-red-800">{friendlyImportErrorMessage(errorCode)}</p>
      {(errorCode || errorMessage) && (
        <div className="mt-4">
          <button type="button" onClick={() => setShowDetails((value) => !value)} className="text-sm font-medium text-red-700 underline">
            Technical details
          </button>
          {showDetails && (
            <dl className="mt-2 flex flex-col gap-1 rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-600">
              {errorCode && (
                <div className="flex gap-2">
                  <dt className="font-semibold">Code:</dt>
                  <dd>{errorCode}</dd>
                </div>
              )}
              {errorMessage && (
                <div className="flex gap-2">
                  <dt className="font-semibold">Message:</dt>
                  <dd>{errorMessage}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @schemaiq/web test -- import-progress.spec.tsx error-panel.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/imports/import-progress.tsx apps/web/components/imports/error-panel.tsx apps/web/components/imports/import-progress.spec.tsx apps/web/components/imports/error-panel.spec.tsx
git commit -m "feat(web): add ImportProgress and ErrorPanel"
```

---

### Task 26: Import detail page (all statuses, polling, retry/cancel)

**Files:**
- Create: `apps/web/app/dashboard/imports/[id]/page.tsx`
- Test: `apps/web/app/dashboard/imports/[id]/page.polling.spec.tsx` (exercises the real `useImport` hook's polling against a mocked `importsApi.get`)
- Test: `apps/web/app/dashboard/imports/[id]/page.spec.tsx` (exercises per-status rendering and actions against mocked hooks)

**Interfaces:**
- Consumes: `useImport`, `useRetryImport`, `useCancelImport` (Task 16), `ImportStatusBadge` (Task 11), `ImportProgress`/`ErrorPanel` (Task 25), `ConfirmDialog` (Task 14), `Skeleton`/`PageHeader` (Task 10), `formatBytes`/`formatDuration`/`formatRowCount` (Task 5).

Two separate spec files are required here (not two `describe` blocks in one file) because `vi.mock` is hoisted file-wide: the polling test needs the **real** `useImport` hook (only `importsApi.get` mocked), while the per-status test needs `useImport`/`useRetryImport`/`useCancelImport` themselves mocked — the two cannot coexist in one file.

- [ ] **Step 1: Write the failing polling test**

Create `apps/web/app/dashboard/imports/[id]/page.polling.spec.tsx`:

```tsx
import { DataImportProcessingMode, DataImportStatus } from '@schemaiq/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'import-1' }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import * as apiClient from '../../../../lib/api-client';
import { OrganizationProvider } from '../../../../lib/organization-context';
import ImportDetailPage from './page';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrganizationProvider>
        <ImportDetailPage />
      </OrganizationProvider>
    </QueryClientProvider>,
  );
}

const baseImport = {
  completedAt: null,
  createdAt: '2026-09-05T09:45:00.000Z',
  delimiter: ',',
  errorCode: null,
  errorMessage: null,
  failedRows: '0',
  fileSizeBytes: '4080218931',
  hasHeader: true,
  id: 'import-1',
  mimeType: 'text/csv',
  originalFileName: 'customers_2026.csv',
  processedBytes: '0',
  processedRows: '0',
  processingMode: DataImportProcessingMode.Queued,
  progressPercent: 0,
  startedAt: null,
  status: DataImportStatus.Processing,
  successfulRows: '0',
  targetSchema: 'public',
  targetTable: 'customers',
  totalRows: null,
  updatedAt: '2026-09-05T09:45:00.000Z',
} as const;

describe('ImportDetailPage polling', () => {
  beforeEach(() => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('keeps polling roughly every 2.5s while non-terminal and stops once completed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const get = vi.spyOn(apiClient.importsApi, 'get').mockResolvedValue({ ...baseImport, status: DataImportStatus.Processing });

    renderPage();
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    get.mockResolvedValue({ ...baseImport, progressPercent: 40, status: DataImportStatus.Processing });
    await vi.advanceTimersByTimeAsync(2_500);
    expect(get).toHaveBeenCalledTimes(2);

    get.mockResolvedValue({
      ...baseImport,
      completedAt: '2026-09-05T09:49:00.000Z',
      processedBytes: baseImport.fileSizeBytes,
      progressPercent: 100,
      startedAt: '2026-09-05T09:45:05.000Z',
      status: DataImportStatus.Completed,
      successfulRows: '2431994',
      totalRows: '2431994',
    });
    await vi.advanceTimersByTimeAsync(2_500);
    expect(get).toHaveBeenCalledTimes(3);
    await vi.waitFor(() => expect(screen.getByText('Import completed')).toBeInTheDocument());

    await vi.advanceTimersByTimeAsync(10_000);
    expect(get).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run the polling test to verify it fails**

Run: `pnpm --filter @schemaiq/web test -- page.polling.spec.tsx`
Expected: FAIL — the page doesn't exist yet.

- [ ] **Step 3: Write the failing per-status test**

Create `apps/web/app/dashboard/imports/[id]/page.spec.tsx`:

```tsx
import { DataImportProcessingMode, DataImportStatus } from '@schemaiq/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'import-1' }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const useImportMock = vi.fn();
const retryMutate = vi.fn();
const cancelMutate = vi.fn();
vi.mock('../../../../lib/queries/imports-queries', () => ({
  useImport: (...args: unknown[]) => useImportMock(...args),
}));
vi.mock('../../../../lib/queries/imports-mutations', () => ({
  useCancelImport: () => ({ isPending: false, mutate: cancelMutate }),
  useRetryImport: () => ({ isPending: false, mutate: retryMutate }),
}));

import ImportDetailPage from './page';

const base = {
  completedAt: null,
  createdAt: '2026-09-05T09:45:00.000Z',
  delimiter: ',',
  errorCode: null,
  errorMessage: null,
  failedRows: '0',
  fileSizeBytes: '4080218931',
  hasHeader: true,
  id: 'import-1',
  mimeType: 'text/csv',
  originalFileName: 'customers_2026.csv',
  processedBytes: '3006477107',
  processedRows: '36400000',
  processingMode: DataImportProcessingMode.Queued,
  progressPercent: 74,
  startedAt: '2026-09-05T09:45:05.000Z',
  status: DataImportStatus.Processing,
  successfulRows: '0',
  targetSchema: 'public',
  targetTable: 'customers',
  totalRows: '49180000',
  updatedAt: '2026-09-05T09:45:00.000Z',
} as const;

describe('ImportDetailPage per-status rendering', () => {
  beforeEach(() => {
    retryMutate.mockClear();
    cancelMutate.mockClear();
  });

  it('shows a loading skeleton while pending', () => {
    useImportMock.mockReturnValue({ data: undefined, isError: false, isPending: true });
    const { container } = render(<ImportDetailPage />);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('shows a friendly message when the import cannot be loaded', () => {
    useImportMock.mockReturnValue({ data: undefined, isError: true, isPending: false });
    render(<ImportDetailPage />);
    expect(screen.getByText(/couldn't load this import/)).toBeInTheDocument();
  });

  it('shows the queued state with no fabricated percentage and a working Cancel Import action', async () => {
    useImportMock.mockReturnValue({
      data: { ...base, progressPercent: 0, status: DataImportStatus.Queued },
      isError: false,
      isPending: false,
    });
    const user = userEvent.setup();
    render(<ImportDetailPage />);

    expect(screen.getByText('Waiting in queue')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel Import' }));
    const confirmButtons = screen.getAllByRole('button', { name: 'Cancel Import' });
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    expect(cancelMutate).toHaveBeenCalledWith('import-1');
  });

  it('shows the validating state', () => {
    useImportMock.mockReturnValue({ data: { ...base, status: DataImportStatus.Validating }, isError: false, isPending: false });
    render(<ImportDetailPage />);
    expect(screen.getByText('Checking your CSV')).toBeInTheDocument();
  });

  it('shows real progress, byte counts, and row counts while processing', () => {
    useImportMock.mockReturnValue({ data: base, isError: false, isPending: false });
    render(<ImportDetailPage />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '74');
    expect(screen.getByText('36,400,000 rows processed')).toBeInTheDocument();
  });

  it('shows the completed summary with real numbers', () => {
    useImportMock.mockReturnValue({
      data: {
        ...base,
        completedAt: '2026-09-05T09:49:00.000Z',
        processedBytes: base.fileSizeBytes,
        progressPercent: 100,
        status: DataImportStatus.Completed,
        successfulRows: '2431994',
      },
      isError: false,
      isPending: false,
    });
    render(<ImportDetailPage />);

    expect(screen.getByText('Import completed')).toBeInTheDocument();
    expect(screen.getByText('2,431,994')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Import Another File' })).toBeInTheDocument();
  });

  it('shows the ErrorPanel and a working Retry action when failed, with no Review Mapping action', async () => {
    useImportMock.mockReturnValue({
      data: {
        ...base,
        errorCode: 'IMPORT_POSTGRES_TYPE_ERROR',
        errorMessage: 'CSV values do not match the target column types',
        status: DataImportStatus.Failed,
      },
      isError: false,
      isPending: false,
    });
    const user = userEvent.setup();
    render(<ImportDetailPage />);

    expect(screen.getByText('Import could not be completed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review Mapping' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry Import' }));
    expect(retryMutate).toHaveBeenCalledWith('import-1');
  });

  it('shows a plain cancelled state', () => {
    useImportMock.mockReturnValue({ data: { ...base, status: DataImportStatus.Cancelled }, isError: false, isPending: false });
    render(<ImportDetailPage />);
    expect(screen.getByText('Import cancelled')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run both tests to verify they fail**

Run: `pnpm --filter @schemaiq/web test -- page.polling.spec.tsx "app/dashboard/imports/[id]/page.spec.tsx"`
Expected: FAIL — `apps/web/app/dashboard/imports/[id]/page.tsx` doesn't exist yet.

- [ ] **Step 5: Implement `apps/web/app/dashboard/imports/[id]/page.tsx`**

```tsx
'use client';

import { DataImportStatus } from '@schemaiq/types';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { ErrorPanel } from '../../../../components/imports/error-panel';
import { ImportProgress } from '../../../../components/imports/import-progress';
import { ImportStatusBadge } from '../../../../components/imports/import-status-badge';
import { ConfirmDialog } from '../../../../components/ui/confirm-dialog';
import { PageHeader } from '../../../../components/ui/page-header';
import { Skeleton } from '../../../../components/ui/skeleton';
import { formatBytes, formatDuration, formatRowCount } from '../../../../lib/format';
import { useCancelImport, useRetryImport } from '../../../../lib/queries/imports-mutations';
import { useImport } from '../../../../lib/queries/imports-queries';

export default function ImportDetailPage() {
  const params = useParams<{ id: string }>();
  const importQuery = useImport(params.id);
  const retry = useRetryImport();
  const cancel = useCancelImport();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  if (importQuery.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (importQuery.isError || !importQuery.data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        We couldn&apos;t load this import. It may not exist, or you may not have access to it.
      </div>
    );
  }

  const data = importQuery.data;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Data Imports"
        title={data.originalFileName}
        description={`Target: ${data.targetSchema}.${data.targetTable}`}
        action={<ImportStatusBadge status={data.status} />}
      />

      {data.status === DataImportStatus.Uploaded && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="text-base font-semibold text-slate-900">Preparing your import</h3>
          <p className="mt-2 text-sm text-slate-600">Your file was uploaded and will be validated shortly.</p>
        </div>
      )}

      {data.status === DataImportStatus.Validating && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h3 className="text-base font-semibold text-amber-900">Checking your CSV</h3>
          <p className="mt-2 text-sm text-amber-800">SchemaIQ is validating the file structure and target columns before importing.</p>
        </div>
      )}

      {data.status === DataImportStatus.Queued && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h3 className="text-base font-semibold text-amber-900">Waiting in queue</h3>
          <p className="mt-2 text-sm text-amber-800">
            Your file has been uploaded successfully and will start when an import worker is available.
          </p>
          <button
            type="button"
            onClick={() => setConfirmingCancel(true)}
            className="mt-4 rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
          >
            Cancel Import
          </button>
        </div>
      )}

      {data.status === DataImportStatus.Processing && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="text-base font-semibold text-slate-900">Importing data</h3>
          <div className="mt-4">
            <ImportProgress
              percent={data.progressPercent}
              processedBytes={data.processedBytes}
              fileSizeBytes={data.fileSizeBytes}
              processedRows={data.totalRows ? data.processedRows : null}
              totalRows={data.totalRows}
            />
          </div>
        </div>
      )}

      {data.status === DataImportStatus.Completed && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
          <h3 className="text-base font-semibold text-emerald-900">Import completed</h3>
          <p className="mt-2 text-sm text-emerald-800">
            Your CSV was successfully imported into {data.targetSchema}.{data.targetTable}.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-emerald-700">Rows imported</dt>
              <dd className="text-emerald-900">{formatRowCount(data.successfulRows)}</dd>
            </div>
            <div>
              <dt className="text-emerald-700">Data processed</dt>
              <dd className="text-emerald-900">{formatBytes(data.processedBytes)}</dd>
            </div>
            <div>
              <dt className="text-emerald-700">Duration</dt>
              <dd className="text-emerald-900">{formatDuration(data.startedAt, data.completedAt)}</dd>
            </div>
            <div>
              <dt className="text-emerald-700">Completed</dt>
              <dd className="text-emerald-900">{data.completedAt ? new Date(data.completedAt).toLocaleTimeString() : '—'}</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard/imports/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Import Another File
            </Link>
            <Link
              href="/dashboard/imports"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Return to Imports
            </Link>
          </div>
        </div>
      )}

      {data.status === DataImportStatus.Failed && (
        <div className="flex flex-col gap-4">
          <ErrorPanel errorCode={data.errorCode} errorMessage={data.errorMessage} />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => retry.mutate(data.id)}
              disabled={retry.isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Retry Import
            </button>
            <Link
              href="/dashboard/imports/new"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Import Another File
            </Link>
          </div>
        </div>
      )}

      {data.status === DataImportStatus.Cancelled && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="text-base font-semibold text-slate-900">Import cancelled</h3>
          <div className="mt-4">
            <Link href="/dashboard/imports/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Import Another File
            </Link>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmingCancel}
        title="Cancel this import?"
        description="The file will not be imported."
        confirmLabel="Cancel Import"
        destructive
        onConfirm={() => {
          cancel.mutate(data.id);
          setConfirmingCancel(false);
        }}
        onCancel={() => setConfirmingCancel(false)}
      />
    </div>
  );
}
```

Note: no "Review Mapping" action is rendered for `FAILED` — retry always reuses the original file and mapping (spec §2.1); implying mapping is editable would misrepresent what the backend actually does.

- [ ] **Step 6: Run both tests to verify they pass**

Run: `pnpm --filter @schemaiq/web test -- page.polling.spec.tsx "app/dashboard/imports/[id]/page.spec.tsx"`
Expected: PASS.

- [ ] **Step 7: Run the full web test suite and commit**

Run: `pnpm --filter @schemaiq/web test && pnpm --filter @schemaiq/web typecheck && pnpm --filter @schemaiq/web lint`
Expected: all green — this closes out every frontend component/page in this milestone.

```bash
git add "apps/web/app/dashboard/imports/[id]"
git commit -m "feat(web): add import detail page with live polling and all status views"
```

---

## Part H — End-to-end tests (real stack)

Prerequisite facts verified for this Part (do not re-derive): `docker-compose.yml` defines `postgres` (db `schemaiq`, user `schemaiq`, password `schemaiq-local-password`, port `5432`) and `redis` (password `schemaiq-local-password`, port `6379`) — matching `.env.example` defaults. The `organizations` table (`apps/api/src/database/migrations/1725321600000-initial-foundation.ts`) only requires `name` and `slug` (both NOT NULL; `id`/timestamps default); `data_imports.organization_id` has a hard foreign key to `organizations.id`, so a real row must exist — there is no HTTP API to create one (organizations has no controller), so E2E setup inserts it directly via `psql` (already installed in this environment). `PostgresImportTargetPolicyService` is a blocklist (specific internal table names), so a new `public.e2e_customers` fixture table is allowed as an import target without any policy change.

### Task 27: E2E scaffolding, fixtures, and the small-CSV happy path

**Files:**
- Modify: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/global-setup.ts`
- Create: `apps/web/e2e/e2e-env.ts`
- Create: `apps/web/e2e/fixtures.ts`
- Create: `apps/web/e2e/happy-path.spec.ts`

**Interfaces:**
- Produces: `e2eOrganizationId(): string`, `seedOrganization(page, organizationId): Promise<void>`, `generateSmallCsv(): string`, `generateLargeCsv(thresholdBytes: number): string`, `generateInvalidCsv(): string` — reused by Tasks 28-29.

- [ ] **Step 1: Wire Playwright's global setup and web server**

Replace `apps/web/playwright.config.ts` in full:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  fullyParallel: false,
  globalSetup: './e2e/global-setup.ts',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: 'list',
  testDir: './e2e',
  timeout: 120_000,
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @schemaiq/web dev',
    reuseExistingServer: true,
    timeout: 60_000,
    url: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
  },
  workers: 1,
});
```

Note: `webServer` only starts the **web app**. Postgres, Redis, and the API server are separate long-running processes started manually in Step 2 below — Playwright does not orchestrate the whole stack, only its own frontend.

Create `apps/web/e2e/global-setup.ts` — creates the shared E2E fixture table (idempotent) and a fresh `organizations` row per run, writing the org id to a small state file the tests read:

```ts
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgresql://schemaiq:schemaiq-local-password@localhost:5432/schemaiq';

export default function globalSetup(): void {
  execSync(
    `psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -c "` +
      'CREATE TABLE IF NOT EXISTS e2e_customers (' +
      'id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ' +
      'name text NOT NULL, ' +
      'email text NOT NULL, ' +
      'age integer, ' +
      'created_at timestamptz NOT NULL DEFAULT now()' +
      '); TRUNCATE e2e_customers;"',
  );

  const slug = `e2e-${Date.now()}`;
  const organizationId = execSync(
    `psql "${DATABASE_URL}" -t -A -v ON_ERROR_STOP=1 -c "INSERT INTO organizations (name, slug) VALUES ('SchemaIQ E2E', '${slug}') RETURNING id;"`,
  )
    .toString()
    .trim();

  writeFileSync(path.join(import.meta.dirname, '.e2e-state.json'), JSON.stringify({ organizationId }));
}
```

Create `apps/web/e2e/e2e-env.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';

export function e2eOrganizationId(): string {
  const raw = readFileSync(path.join(import.meta.dirname, '.e2e-state.json'), 'utf-8');
  return (JSON.parse(raw) as { organizationId: string }).organizationId;
}
```

Create `apps/web/e2e/fixtures.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Page } from '@playwright/test';

export async function seedOrganization(page: Page, organizationId: string): Promise<void> {
  await page.addInitScript((id) => {
    window.localStorage.setItem('schemaiq.organizationId', id);
  }, organizationId);
}

function writeCsvFixture(name: string, content: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'schemaiq-e2e-'));
  const filePath = path.join(dir, name);
  writeFileSync(filePath, content);
  return filePath;
}

export function generateSmallCsv(): string {
  return writeCsvFixture('customers-test.csv', 'name,email,age\nAda Lovelace,ada@example.com,36\nGrace Hopper,grace@example.com,85\n');
}

export function generateLargeCsv(thresholdBytes: number): string {
  const header = 'name,email,age\n';
  const row = 'Test User,test.user@example.com,42\n';
  const rowsNeeded = Math.ceil((thresholdBytes * 1.2) / row.length);
  let content = header;
  for (let index = 0; index < rowsNeeded; index += 1) content += row;
  return writeCsvFixture('customers-large.csv', content);
}

export function generateInvalidCsv(): string {
  return writeCsvFixture('customers-invalid.csv', 'name,email,age\nBad Row,bad@example.com,twenty five\n');
}
```

Create `apps/web/e2e/happy-path.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import { e2eOrganizationId } from './e2e-env';
import { generateSmallCsv, seedOrganization } from './fixtures';

test('imports a small CSV end to end and shows it as completed history', async ({ page }) => {
  const organizationId = e2eOrganizationId();
  await seedOrganization(page, organizationId);
  const csvPath = generateSmallCsv();

  await page.goto('/dashboard/imports/new');
  await page.getByLabel('Upload CSV file').setInputFiles(csvPath);
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByLabel('Schema').selectOption('public');
  await page.getByLabel('Table').selectOption('e2e_customers');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Start Import' }).click();

  await expect(page).toHaveURL(/\/dashboard\/imports\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.getByText('Import completed')).toBeVisible({ timeout: 30_000 });

  await page.goto('/dashboard/imports');
  await expect(page.getByText('customers-test.csv')).toBeVisible();
  await expect(page.getByText('Completed').first()).toBeVisible();
});
```

- [ ] **Step 2: Start the real dev stack**

Run, in order (this environment has Docker and the `psql`/`redis-cli` clients available):

```bash
test -f .env || cp .env.example .env
docker compose up -d postgres redis
until docker compose exec -T postgres pg_isready -U schemaiq -d schemaiq; do sleep 1; done
pnpm --filter @schemaiq/api migration:run
```

Then start the API server so it keeps running for the E2E run (background process — e.g. `run_in_background: true` if using the Bash tool, or a separate terminal):

```bash
pnpm --filter @schemaiq/api dev
```

Confirm it's up: `curl -sf http://localhost:3001/api/v1/health` should return `{"status":"ok",...}`.

- [ ] **Step 3: Run the happy-path test against the real stack**

Run: `pnpm --filter @schemaiq/web e2e -- happy-path.spec.ts`
Expected: PASS — the test drives the real browser against the real Next.js dev server (auto-started by Playwright's `webServer`), which calls the real API, which writes to the real Postgres via `COPY`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/e2e
git commit -m "test(web): add E2E scaffolding, fixtures, and the small-CSV happy-path test"
```

---

### Task 28: Large queued-CSV E2E test

**Files:**
- Create: `apps/web/e2e/large-queued.spec.ts`

**Interfaces:**
- Consumes: `e2eOrganizationId`, `seedOrganization`, `generateLargeCsv` (Task 27).

- [ ] **Step 1: Write the test**

Create `apps/web/e2e/large-queued.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import { e2eOrganizationId } from './e2e-env';
import { generateLargeCsv, seedOrganization } from './fixtures';

test('queues a large CSV in the background and transitions through processing to completed', async ({ page, request }) => {
  const organizationId = e2eOrganizationId();
  await seedOrganization(page, organizationId);

  const apiBaseUrl = process.env.E2E_API_URL ?? 'http://localhost:3001/api/v1';
  const configResponse = await request.get(`${apiBaseUrl}/imports/config`, { headers: { 'x-organization-id': organizationId } });
  const config = (await configResponse.json()) as { queueThresholdBytes: number };
  const csvPath = generateLargeCsv(config.queueThresholdBytes);

  await page.goto('/dashboard/imports/new');
  await page.getByLabel('Upload CSV file').setInputFiles(csvPath);
  await expect(page.getByText('Large file detected')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByLabel('Schema').selectOption('public');
  await page.getByLabel('Table').selectOption('e2e_customers');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Background import')).toBeVisible();
  await page.getByRole('button', { name: 'Start Import' }).click();

  await expect(page).toHaveURL(/\/dashboard\/imports\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.getByText(/Waiting in queue|Importing data/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Import completed')).toBeVisible({ timeout: 120_000 });
});
```

- [ ] **Step 2: Run it against the real stack**

Run: `pnpm --filter @schemaiq/web e2e -- large-queued.spec.ts`
Expected: PASS — the generated file exceeds the real `queueThresholdBytes` from `GET /imports/config` (never a hardcoded guess), the upload returns `202`/`QUEUED`, and the detail page transitions `QUEUED`/`PROCESSING` → `COMPLETED`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/large-queued.spec.ts
git commit -m "test(web): add large-CSV queued-import E2E test"
```

---

### Task 29: Failed-import E2E test

**Files:**
- Create: `apps/web/e2e/failed-import.spec.ts`

**Interfaces:**
- Consumes: `e2eOrganizationId`, `seedOrganization`, `generateInvalidCsv` (Task 27).

- [ ] **Step 1: Write the test**

Create `apps/web/e2e/failed-import.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import { e2eOrganizationId } from './e2e-env';
import { generateInvalidCsv, seedOrganization } from './fixtures';

test('shows a safe failure with technical details and a working retry for an incompatible CSV value', async ({ page }) => {
  const organizationId = e2eOrganizationId();
  await seedOrganization(page, organizationId);
  const csvPath = generateInvalidCsv();

  await page.goto('/dashboard/imports/new');
  await page.getByLabel('Upload CSV file').setInputFiles(csvPath);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Schema').selectOption('public');
  await page.getByLabel('Table').selectOption('e2e_customers');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start Import' }).click();

  await expect(page).toHaveURL(/\/dashboard\/imports\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.getByText('Import could not be completed')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/SQLSTATE|at Object\.|node_modules/i)).toHaveCount(0);

  await page.getByRole('button', { name: 'Technical details' }).click();
  await expect(page.getByText('IMPORT_POSTGRES_TYPE_ERROR')).toBeVisible();

  await page.getByRole('button', { name: 'Retry Import' }).click();
  await expect(page.getByText(/Waiting in Queue|Validating|Importing|Failed/)).toBeVisible({ timeout: 15_000 });
});
```

Note: the CSV's bad `age` value ("twenty five") will fail the same way on retry — this test proves Retry re-queues and re-renders safely, not that the same bad data magically succeeds. Timing between `Waiting in Queue`/`Validating`/`Importing`/`Failed` is not asserted precisely; any of them appearing without an error proves the retry round-trip works.

- [ ] **Step 2: Run it against the real stack**

Run: `pnpm --filter @schemaiq/web e2e -- failed-import.spec.ts`
Expected: PASS — confirms no raw SQL/stack-trace text ever reaches the DOM, and Retry visibly re-triggers the import.

- [ ] **Step 3: Run the full E2E suite together and commit**

Run: `pnpm --filter @schemaiq/web e2e`
Expected: all three E2E specs pass in one run against the real stack.

```bash
git add apps/web/e2e/failed-import.spec.ts
git commit -m "test(web): add failed-import E2E test verifying safe error display and retry"
```

---

## Part I — Documentation and final verification

### Task 30: Update `docs/ARCHITECTURE.md`, `CLAUDE.md`, and `AGENTS.md`

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Add a CSV Import Frontend section to `docs/ARCHITECTURE.md`**

Read the file in full first, then add this as a new subsection near wherever `apps/web`/the frontend is already described (append; don't restructure existing content):

```markdown
### CSV Import Frontend

`apps/web/app/dashboard/imports/**` implements the CSV import UI on top of the existing `imports` backend module. A single typed API client (`apps/web/lib/api-client.ts`) and TanStack Query hooks (`apps/web/lib/queries/imports-*.ts`) are the only way the frontend talks to `/api/v1/imports/**`; every enum and response shape is imported from `@schemaiq/types`, never redefined.

**Upload workflow** — `/dashboard/imports/new` is a single page with page-local reducer state, walking Upload → Destination → Map Columns → Review → Import. Destination and mapping are driven by real PostgreSQL metadata via the target-metadata endpoints below (`ImportTargetSchemaResponse`/`ImportTargetTableResponse`/`ImportTargetDetailsResponse`) — the frontend never lets a user submit a schema/table the backend hasn't already validated exists, though the backend remains the authority at submit time regardless.

**Import monitoring** — `/dashboard/imports/:id` polls `GET /imports/:id` via TanStack Query `refetchInterval`, active only while status is `UPLOADED`/`VALIDATING`/`QUEUED`/`PROCESSING` and stopped once terminal (`COMPLETED`/`FAILED`/`CANCELLED`).

**Backend additions supporting the UI** (all inside the existing `imports` module, read-only, no schema change): `GET /imports/targets/schemas`, `GET /imports/targets/schemas/:schema/tables`, `GET /imports/targets/schemas/:schema/tables/:table` (destination picker, via the already-existing `PostgresTableMetadataService`); `GET /imports/config` (exposes the real `queueThresholdBytes`/`maxFileSizeBytes` instead of a hardcoded frontend guess); `GET /imports/summary` (organization-scoped import counts and completed-row total for the overview metrics strip); and activation of the previously-ignored `status`/`search` filters on `GET /imports`.
```

- [ ] **Step 2: Add frontend conventions to `CLAUDE.md` and `AGENTS.md`**

Read both files in full first, then append these rules to whichever existing rules section fits best (a "Never" list, an engineering-rules list, etc. — append, don't restructure):

```markdown
- Frontend API calls to the SchemaIQ backend go through `apps/web/lib/api-client.ts` only. Never scatter `fetch(...)` calls across components.
- Frontend code imports backend enums and response types from `@schemaiq/types` verbatim. Never redefine `DataImportStatus`/`DataImportProcessingMode`/response shapes locally.
- Status polling (e.g. import detail) uses TanStack Query `refetchInterval` keyed off the resource's own status field, stopped once the status is terminal. Never hand-roll `setInterval`/`clearInterval` for polling.
```

- [ ] **Step 3: Commit**

```bash
git add docs/ARCHITECTURE.md CLAUDE.md AGENTS.md
git commit -m "docs: document the CSV import frontend and its new conventions"
```

---

### Task 31: Full verification and roadmap completion

**Files:**
- Modify: `docs/ROADMAP.md` (only in Step 6, gated on everything else passing)

- [ ] **Step 1: Full lint**

Run: `pnpm lint`
Expected: PASS across every workspace (`apps/api`, `apps/web`, `packages/*`). Fix anything it flags before continuing — do not disable rules to force a pass.

- [ ] **Step 2: Full typecheck**

Run: `pnpm typecheck`
Expected: PASS across every workspace, strict mode intact.

- [ ] **Step 3: Full test suite**

Run: `pnpm test`
Expected: PASS — every backend Jest spec (including the four modified/new specs from Part A) and every frontend Vitest spec (Tasks 5-26) green.

- [ ] **Step 4: Full build**

Run: `pnpm build`
Expected: PASS — `apps/api` and `apps/web` both build cleanly (`next build --webpack` included).

- [ ] **Step 5: Full E2E suite against the real stack**

With Postgres, Redis, and the API server still running (Task 27 Step 2), run: `pnpm --filter @schemaiq/web e2e`
Expected: all three specs (happy path, large queued, failed import) PASS in one run.

- [ ] **Step 6: Mark Milestone 3.6 complete**

Only once Steps 1-5 are all green: open `docs/ROADMAP.md`, find the `| 3.6 | CSV Import Frontend | Planned |` row, and change `Planned` to `Completed`.

```bash
git add docs/ROADMAP.md
git commit -m "docs: mark Milestone 3.6 (CSV Import Frontend) complete after full E2E verification"
```
