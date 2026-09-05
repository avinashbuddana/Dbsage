# Architecture

## Current: foundation, secure connectivity, and CSV import backend

```text
Next.js web
    ↓
NestJS API ──→ Redis
    ↓
TypeORM
    ↓
SchemaIQ PostgreSQL
```

SchemaIQ is a modular monolith in a pnpm workspace. `apps/web` owns the browser experience; `apps/api` owns HTTP, application logic, persistence, health, security middleware, and managed resource lifecycles. Shared packages stay small and framework-neutral.

`DatabaseModule` and TypeORM manage **only the internal SchemaIQ PostgreSQL database**. Nest creates one application DataSource/pool and TypeORM closes it during application shutdown. The TypeORM CLI DataSource exists only in migration processes and is never created by the running API.

Redis is one Nest-managed client with connection, ping, and graceful-disconnect lifecycles. The import module adapts that client for its bounded BullMQ queue; no general cache is implemented.

## Implemented: Milestone 3.5 — PostgreSQL CSV bulk imports

```text
multipart CSV upload
    ↓ stream (no whole-file buffer)
ImportFileStorage → LocalImportFileStorage
    ↓
CSV header + PostgreSQL metadata validation
    ├── small: PostgresCopyService → COPY FROM STDIN → response
    └── large: BullMQ one-import job → worker → COPY FROM STDIN
```

`ImportsModule` owns import history, status transitions, target-table policy, local file retention, and the queue worker. TypeORM remains the system of record for `DataImportEntity`; a dedicated, bounded native `pg` pool exists only inside `BulkImportPostgresProvider` for `pg-copy-streams` COPY protocol support. `PostgresIdentifierService` accepts identifiers only after metadata validation, and `PostgresImportTargetPolicyService` blocks system schemas and SchemaIQ security/application tables.

`LocalImportFileStorage` writes uploads to a generated UUID filename with stream backpressure. It is suitable for single-instance development/MVP deployments only: horizontally scaled API and worker processes require a shared persistent volume. Production should use an S3-compatible `ImportFileStorage` implementation.

The versioned [CSV Import API reference](./api/README.md) includes the OpenAPI 3.1 contract and an importable Postman collection. It documents the development-only organization-context header, import lifecycle, safe response fields, and error envelope.

## Implemented: Milestone 3.6 — CSV Import Frontend

`apps/web/app/dashboard/imports/**` implements the CSV import UI on top of the Milestone 3.5 `imports` backend module above. A single typed API client (`apps/web/lib/api-client.ts`) and TanStack Query hooks (`apps/web/lib/queries/imports-*.ts`) are the only way the frontend talks to `/api/v1/imports/**`; every enum and response shape is imported from `@schemaiq/types`, never redefined.

**Application shell.** `apps/web/components/layout/*` (Sidebar, Header, DashboardShell) wraps every route under `app/dashboard/**`. A dev-only `OrganizationProvider` (`apps/web/lib/organization-context.tsx`) persists an organization UUID to `localStorage` and attaches it as the `x-organization-id` header on every API call — there is no authentication yet, and no organizations API to fetch a valid id from, so this is a UI convenience only; the backend remains the sole authorization boundary.

**Upload workflow.** `/dashboard/imports/new` is a single page with page-local `useReducer` state, walking Upload → Destination → Map Columns → Review → Import. Destination and mapping are driven by real PostgreSQL metadata via the target-metadata endpoints below (`ImportTargetSchemaResponse`/`ImportTargetTableResponse`/`ImportTargetDetailsResponse`) — the frontend never lets a user submit a schema/table the backend hasn't already validated exists, though the backend remains authoritative at submit time regardless. Column mapping auto-matches CSV headers to identically-named target columns and blocks continuing when a required (non-nullable, no default, not generated/identity) target column is left unmapped.

**Import monitoring.** `/dashboard/imports/:id` polls `GET /imports/:id` via TanStack Query `refetchInterval`, active only while status is `UPLOADED`/`VALIDATING`/`QUEUED`/`PROCESSING` and stopped once terminal (`COMPLETED`/`FAILED`/`CANCELLED`). Failure detail is limited to the backend's flat `errorCode`/`errorMessage` — there is no per-row/column failure detail anywhere in the contract, so the UI never fabricates it.

**Backend additions supporting the UI** (all inside the existing `imports` module, read-only, no schema change): `GET /imports/targets/schemas`, `GET /imports/targets/schemas/:schema/tables`, `GET /imports/targets/schemas/:schema/tables/:table` (destination picker, via the already-existing `PostgresTableMetadataService`); `GET /imports/config` (exposes the real `queueThresholdBytes`/`maxFileSizeBytes` instead of a hardcoded frontend guess); `GET /imports/summary` (organization-scoped import counts and completed-row total for the overview metrics strip); and activation of the previously-defined-but-ignored `status`/`search` filters on `GET /imports`.

## Implemented: Milestone 1 — secure MySQL datasource connectivity

```text
NestJS API
    ↓
DatasourcesService ──→ CredentialProvider ──→ EncryptedDatabaseCredentialProvider (AES-256-GCM)
    ↓                                              ↓
DatabaseConnectionManager                   SchemaIQ PostgreSQL (encrypted secrets only)
    ↓
DatasourceConfigResolver ──→ DatasourceNetworkPolicyService (SSRF / metadata guard)
    ↓
DatabaseConnector (MySqlDatabaseConnector)
    ↓
new DataSource({ type: 'mysql', ... })   ← dynamic, never TypeOrmModule.forRoot()
    ↓
mysql2 driver
    ↓
Customer MySQL  ── DIRECT (TLS) or SSH_TUNNEL (via SshTunnelService / ssh2)
```

`DatasourceModule` (`datasources/`) owns datasource metadata (`DatasourceEntity`, `DatasourceSshConfigEntity`) through the **internal** TypeORM DataSource, the same PostgreSQL connection used by Milestone 0 — datasource metadata is ordinary internal application data. Encrypted secrets (`DatasourceSecretEntity`, one encrypted row per `DatasourceSecretType`: `DATABASE_PASSWORD`, `SSH_PASSWORD`, `SSH_PRIVATE_KEY`, `SSH_PRIVATE_KEY_PASSPHRASE`) live in the same internal database but are reached only through the `CredentialProvider` interface, never directly.

Customer MySQL connections never use the internal TypeORM DataSource or `TypeOrmModule.forRoot()`/`forRootAsync()`. `DatabaseConnectionManager` is the sole owner of customer `DataSource` instances: it lazily creates them via `MySqlDatabaseConnector.createDataSource()` (`new DataSource({...}).initialize()`), reuses them from a bounded registry (`MYSQL_MAX_ACTIVE_DATASOURCES`, LRU-evicted, one shared idle-cleanup timer), deduplicates concurrent initialization for the same datasource via an in-flight promise map, and destroys every customer `DataSource` (and any SSH tunnel) on idle timeout, invalidation, datasource deletion, or `OnApplicationShutdown`. Customer `DataSource` options are always `entities: []`, `synchronize: false`, `migrationsRun: false`, `logging: false` — SchemaIQ never reads or writes customer schema in this milestone, only `SELECT 1`.

For `SSH_TUNNEL`-mode datasources, `SshTunnelService` (backed by the `ssh2` library) opens a loopback-only (`127.0.0.1`), ephemeral-port local forwarding tunnel to the customer's bastion host; the customer `DataSource` then connects through that local endpoint instead of the remote host directly. Tunnels are reused alongside their `DataSource` and closed together.

Every DIRECT host and SSH bastion host is validated by `DatasourceNetworkPolicyService` before use: it resolves DNS and rejects cloud metadata addresses (`169.254.0.0/16`, IPv6 link-local `fe80::/10`, common metadata hostnames) unconditionally, and rejects loopback targets unless `ALLOW_LOCAL_DATASOURCES` is explicitly enabled (forbidden in production by config validation). SSH-tunneled remote database hosts are intentionally allowed to be private-network addresses, since they are only reachable through the tunnel.

## Future private connector — not implemented

```text
Customer VPC
    ↓
SchemaIQ Private Connector (outbound-initiated, authenticated)
    ↓
Private MySQL (no public listener required)
```

A future connector agent will run inside the customer's network and open an outbound connection back to SchemaIQ, so the customer database never needs a publicly reachable port. `PRIVATE_CONNECTOR` exists today only as a `DatasourceConnectionMode` enum value that the API rejects at validation time — no connector agent, protocol, or networking logic is implemented.

## Future VPN connectivity — not implemented

VPN-based connectivity (e.g. WireGuard, Tailscale) remains planned for datasources that require it. `VPN` exists only as a `DatasourceConnectionMode` enum value that the API rejects; no dependency or connectivity is implemented.

## Future multi-engine connectors — not implemented

```text
DatabaseConnectionManager
    ↓
DatabaseConnector
    ├── MySqlDatabaseConnector (implemented)
    ├── PostgreSQLConnector
    ├── MSSQLConnector
    └── MongoDBConnector
    ↓
Customer databases
```

Additional engines will use database-native drivers behind the same `DatabaseConnector` interface and must never be dynamically registered in TypeORM's Nest module.

## Future AI architecture — not implemented

```text
User
  ↓
AI Orchestrator
  ↓
Controlled Tools
  ↓
Security Validation
  ↓
DatabaseConnector
```

The LLM layer will not receive credentials or directly control connections or query execution.
