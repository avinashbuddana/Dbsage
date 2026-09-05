# SchemaIQ

SchemaIQ is an AI Database Intelligence platform. The implemented foundation includes Milestones 0, 1, the explicitly authorized Milestone 3.5 CSV backend, and Milestone 3.6 (CSV Import Frontend). Do not implement future milestones unless explicitly requested.

## Architecture

- Backend: NestJS + strict TypeScript
- Frontend: Next.js App Router + strict TypeScript + Tailwind CSS
- Internal database: PostgreSQL + TypeORM
- Redis: managed lifecycle with bounded CSV-import jobs
- Deployment shape: pnpm modular monolith

TypeORM manages **only** the SchemaIQ internal PostgreSQL database. Never dynamically register customer databases through TypeORM. Future customer connectivity will use `DatabaseConnectionManager` and `DatabaseConnector` implementations.

Future work includes schema introspection, relationship discovery, natural-language querying, SQL generation/execution/optimization, and documentation generation.

## Never

- Use JavaScript when TypeScript is supported or weaken strict TypeScript.
- Add unnecessary `any`, hardcoded secrets, credential logging, or scattered `process.env` access.
- Create database clients per request, global mutable state, unbounded caches, timers, or listeners.
- Set TypeORM `synchronize: true` or place persistence/business logic in controllers.
- Add microservices, Kubernetes, vector databases, LLM SDKs, queues outside authorized modules, or future features prematurely.
- Disable useful lint rules to make checks pass or introduce circular/multi-purpose services.

## Customer MySQL connectivity (Milestone 1)

- Customer MySQL connections MUST go through `DatabaseConnectionManager`. Never create a customer `DataSource` directly from a controller, another service, or a one-off script.
- Never dynamically register a customer database through `TypeOrmModule.forRoot()`/`forRootAsync()`. Customer `DataSource` instances are always `new DataSource({...})` + `.initialize()`/`.destroy()`.
- Never cache decrypted credentials. Decrypt only immediately before building a connection; never attach plaintext to long-lived objects, logs, or Redis.
- Never introduce static production customer database credentials into `.env`; every customer operation begins with an organization-scoped `datasourceId`.
- Never expose datasource secrets (password, SSH password/private key/passphrase, `encryptedValue`, `iv`, `authTag`) through any controller, DTO, or API response.
- Always close customer `DataSource` and SSH tunnel resources through `DatabaseConnectionManager`'s lifecycle (invalidate/idle-cleanup/shutdown) — never leave a customer connection or tunnel open outside its managed lifecycle.

## PostgreSQL CSV imports (Milestone 3.5)

- Never use row-by-row `INSERT` loops or full-file buffers for CSV imports; use the stream-based `PostgresCopyService`.
- COPY identifiers must come from validated PostgreSQL metadata and be quoted by `PostgresIdentifierService`.
- Large files go through the bounded import queue with identifier-only job payloads.

## CSV Import Frontend (Milestone 3.6)

- Frontend API calls to the SchemaIQ backend go through `apps/web/lib/api-client.ts` only. Never scatter `fetch(...)` calls across components.
- Frontend code imports backend enums and response types from `@schemaiq/types` verbatim. Never redefine `DataImportStatus`/`DataImportProcessingMode`/response shapes locally.
- Status polling (e.g. import detail) uses TanStack Query `refetchInterval` keyed off the resource's own status field, stopped once the status is terminal. Never hand-roll `setInterval`/`clearInterval` for polling.

## Completion

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Do not claim success for checks that did not pass.
