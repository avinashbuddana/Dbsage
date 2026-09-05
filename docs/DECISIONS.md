# Architecture decisions

## ADR-001 — TypeScript only

- **Status:** Accepted
- **Context:** Backend, frontend, tools, and agents need one enforceable type system.
- **Decision:** Application source uses strict TypeScript.
- **Reason:** Shared tooling and compile-time guarantees reduce unsafe integration changes.
- **Consequences:** JavaScript application files and weakening compiler flags are rejected.

## ADR-002 — NestJS backend

- **Status:** Accepted
- **Context:** The API needs explicit modules, dependency injection, validation, guards, filters, and lifecycle hooks.
- **Decision:** Build the HTTP backend with NestJS.
- **Reason:** Nest provides these conventions without custom framework scaffolding.
- **Consequences:** Controllers remain thin and providers are never manually instantiated in application code.

## ADR-003 — Modular monolith

- **Status:** Accepted
- **Context:** Early product boundaries matter, but distributed operations do not yet add value.
- **Decision:** Keep deployable application code in a modular monolith.
- **Reason:** Module boundaries preserve clarity with the lowest operational cost.
- **Consequences:** No microservices are introduced without a measured need and a new ADR.

## ADR-004 — PostgreSQL internal application database

- **Status:** Accepted
- **Context:** SchemaIQ needs durable relational storage for users, organizations, memberships, audit data, and later metadata.
- **Decision:** Use PostgreSQL for internal application data.
- **Reason:** Relational constraints, transactions, JSONB, and mature operations fit the domain.
- **Consequences:** Local development and production require PostgreSQL; schema changes use migrations.

## ADR-005 — TypeORM internal ORM

- **Status:** Accepted
- **Context:** SchemaIQ uses NestJS and needs repository integration, entities, transactions, migrations, QueryBuilder, and lower-level SQL control.
- **Decision:** Use TypeORM for the internal SchemaIQ PostgreSQL database.
- **Reason:** It provides strong NestJS integration, dependency-injected repositories, decorators/entities, migrations, QueryBuilder, transactions, and raw SQL when necessary.
- **Consequences:** TypeORM is not the dynamic customer database connector; customer connections use separate native-driver adapters.

## ADR-006 — Redis

- **Status:** Accepted
- **Context:** Shared cache/job infrastructure needs one controlled client lifecycle.
- **Decision:** Establish one lifecycle-managed Redis client for health checks and explicitly authorized bounded jobs.
- **Reason:** Redis supplies cross-process ephemeral storage without relying on application memory.
- **Consequences:** The CSV import module may adapt the singleton for BullMQ; caching remains unimplemented until required.

## ADR-007 — pnpm monorepo

- **Status:** Accepted
- **Context:** API, web, and small shared packages need reproducible dependency management.
- **Decision:** Use pnpm workspaces and one lockfile.
- **Reason:** pnpm provides strict, efficient dependency isolation and workspace linking.
- **Consequences:** npm and Yarn commands or lockfiles are not accepted.

## ADR-008 — No vector database initially

- **Status:** Accepted
- **Context:** Milestone 0 has no retrieval workload or measured vector-search requirement.
- **Decision:** Do not add a vector database.
- **Reason:** It would add cost and operational complexity without current behavior.
- **Consequences:** Revisit only when retrieval requirements and scale are known.

## ADR-009 — No microservices initially

- **Status:** Accepted
- **Context:** Current workloads do not require independent scaling or failure domains.
- **Decision:** Keep the modular monolith.
- **Reason:** One deployable is easier to change, test, and operate at this stage.
- **Consequences:** Future extraction requires evidence and an ADR.

## ADR-010 — LLM never directly connects to customer databases

- **Status:** Accepted
- **Context:** Model output is untrusted and must not control credentials, connections, or execution.
- **Decision:** Future LLM actions pass through controlled tools, policy/schema validation, and connectors.
- **Reason:** Deterministic code must enforce access and query safety.
- **Consequences:** Credentials never enter model context; direct model-to-database paths are forbidden.

## ADR-011 — TypeORM never manages dynamic customer connections

- **Status:** Accepted; implemented in Milestone 1
- **Context:** Customer databases vary by engine and scale, with different lifecycle and security requirements from internal data.
- **Decision:** `DatabaseConnectionManager` and `DatabaseConnector` implementations use dynamic `new DataSource(...)` instances built with native drivers such as `mysql2`, never `TypeOrmModule.forRoot()`/`forRootAsync()`.
- **Reason:** A dedicated abstraction can enforce bounded pools, read-only policy, credential isolation, and engine-specific behavior.
- **Consequences:** The Nest TypeORM module contains only internal entities and one internal PostgreSQL pool. `MySqlDatabaseConnector` is the first implementation; `mysql2` is its driver.

## ADR-012 — AES-256-GCM as an interim credential store, behind a CredentialProvider interface

- **Status:** Accepted
- **Context:** Milestone 1 needs to store customer database and SSH credentials now, but the long-term plan is an external secret manager (Vault, Infisical, AWS Secrets Manager/KMS).
- **Decision:** Encrypt secrets with AES-256-GCM (Node's built-in `crypto`) in SchemaIQ PostgreSQL, reached only through a `CredentialProvider` interface; the rest of the application depends on the interface, not the concrete `EncryptedDatabaseCredentialProvider`.
- **Reason:** GCM gives authenticated encryption with a fresh IV per secret; the interface boundary lets the storage backend change later without touching callers.
- **Consequences:** `DATASOURCE_ENCRYPTION_KEY` must be a validated 32-byte base64 key or the app fails to start. `encryptionVersion` is stored per secret to support a future migration. A `VaultCredentialProvider` (or similar) can later implement the same interface.

## ADR-013 — DIRECT and SSH_TUNNEL connectivity first; Private Connector and VPN remain planned

- **Status:** Accepted
- **Context:** Customer MySQL instances are reachable either directly (public/allowlisted endpoint) or only from inside a private network via an SSH bastion. A future private-connector agent and VPN-based connectivity are anticipated but not yet designed in detail.
- **Decision:** Implement `DatasourceConnectionMode.DIRECT` and `.SSH_TUNNEL` now. `PRIVATE_CONNECTOR` and `VPN` exist only as enum values; the API rejects them.
- **Reason:** DIRECT and SSH_TUNNEL cover the common cases without building an outbound connector agent or VPN dependency prematurely.
- **Consequences:** `docs/ARCHITECTURE.md` documents the future Private Connector and VPN shapes without implementing them; adding either requires a new ADR when it is scheduled.

## ADR-014 — Customer connection pools are bounded and lazy

- **Status:** Accepted
- **Context:** Naively pooling every customer datasource (e.g. 10 connections × 100 customers) risks exhausting database and file-descriptor limits.
- **Decision:** `DatabaseConnectionManager` creates customer `DataSource`/SSH-tunnel instances lazily on first use, caps total active instances at `MYSQL_MAX_ACTIVE_DATASOURCES`, uses small per-datasource pools (`MYSQL_POOL_SIZE`, default 3), evicts idle instances via one shared cleanup timer, and deduplicates concurrent initialization for the same datasource so N simultaneous requests create exactly one `DataSource`.
- **Reason:** Bounded, lazy, deduplicated pooling keeps SchemaIQ's total customer connection footprint predictable regardless of tenant count.
- **Consequences:** A request for a new datasource at capacity either evicts a safe (idle, zero-active-operations) LRU entry or fails with a typed `DATASOURCE_RESOURCE_LIMIT` error — it never silently exceeds the configured maximum.

## ADR-015 — CSV bulk import uses PostgreSQL COPY FROM STDIN

- **Status:** Accepted
- **Context:** Row-by-row INSERTs are slow and require unbounded application work for large CSV files.
- **Decision:** CSV import uses `COPY FROM STDIN` through a streaming source and transaction.
- **Reason:** PostgreSQL performs the bulk load efficiently while Node stream backpressure bounds memory.
- **Consequences:** COPY failures roll back the import transaction; V1 does not offer row-level recovery or generic UPSERT behavior.

## ADR-016 — Native pg is isolated to the COPY provider

- **Status:** Accepted
- **Context:** TypeORM manages ordinary SchemaIQ persistence but does not expose the COPY streaming protocol.
- **Decision:** `BulkImportPostgresProvider` owns one bounded native `pg` pool used only by `PostgresCopyService` and `pg-copy-streams`.
- **Reason:** This preserves TypeORM as the primary ORM without depending on TypeORM private internals or creating per-import pools.
- **Consequences:** The pool is lifecycle-managed and shares validated internal PostgreSQL configuration; native pg is not used elsewhere.

## ADR-017 — Large imports use one BullMQ job and storage is abstracted

- **Status:** Accepted
- **Context:** One Redis job per CSV row would exhaust Redis and complicate atomic import retries.
- **Decision:** One import maps to one bounded BullMQ job that streams a stored file; `ImportFileStorage` hides the initial local implementation.
- **Reason:** Jobs remain small, COPY remains transactional, and object storage can replace local disk without changing import processing.
- **Consequences:** Local storage is limited to a single shared volume; multi-machine production deployments need S3-compatible storage.
