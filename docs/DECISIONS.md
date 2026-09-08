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

## ADR-008 — pgvector for verified datasource knowledge

- **Status:** Accepted
- **Context:** Verified datasource knowledge needs tenant-scoped semantic retrieval without introducing a second data platform.
- **Decision:** Enable PostgreSQL `vector` and store embeddings only for verified, versioned datasource knowledge.
- **Reason:** SchemaIQ already operates PostgreSQL; structured snapshot metadata remains the source of truth.
- **Consequences:** pgvector dimensions are validated against embedding configuration. No customer rows, credentials, or raw Markdown are embedded.

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
- **Decision:** `DatabaseConnectionManager` creates customer `DataSource`/SSH-tunnel instances lazily on first use, caps total active instances at `MYSQL_MAX_ACTIVE_DATASOURCES`, uses small per-datasource pools (`MYSQL_CUSTOMER_POOL_SIZE`, default 3), evicts idle instances via one shared cleanup timer, bounds in-flight initialization, and deduplicates concurrent initialization for the same datasource so N simultaneous requests create exactly one `DataSource`.
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

## ADR-018 — Customer databases are dynamic datasource records, never static environment configuration

- **Status:** Accepted; implemented in Milestone 1
- **Context:** Static customer database environment variables couple deployments to one customer and make credential rotation or adding a datasource require a restart.
- **Decision:** `DATABASE_*` configures only SchemaIQ's internal PostgreSQL database. Each customer MySQL connection starts with an organization-scoped datasource record, resolves its encrypted credential through `CredentialProvider`, and is created by `DatabaseConnectionManager`. `INTEGRATION_MYSQL_*` is reserved for the Docker test fixture and cannot be read by application services.
- **Reason:** Datasource-scoped, encrypted configuration supports tenant isolation and removes customer credentials from process configuration.
- **Consequences:** Production configuration never accepts customer MySQL host, username, password, or connection URL values. Raw database URLs are rejected at the DTO boundary and never persisted.

## ADR-019 — Config-selected Ollama/OpenRouter behind a provider interface

- **Status:** Accepted; gateway foundation implemented
- **Context:** Specification extraction and semantic matching need structured model output while model availability, capability, and cost will change over time.
- **Decision:** Business services call `LlmService`, which depends on the `LLM_PROVIDER` interface. Local configuration selects loopback `OllamaLlmProvider`; production configuration selects `OpenRouterLlmProvider`. A retryable selected-provider failure may use the configured counterpart. Both providers use JSON-schema structured output and independent Zod validation. `LLM_REASONING_MODEL` is configuration only until a separately authorized escalation policy uses it.
- **Reason:** The ordered path avoids a single cloud-model dependency while retaining server-side keys, bounded concurrency, timeouts, retries, normalized failures, and non-content telemetry. Local Ollama provides a no-Docker development fallback without allowing prompts to be redirected to an arbitrary host.
- **Consequences:** Sonnet can incur OpenRouter charges only when it is selected as a fallback. Model names, API keys, raw provider errors, prompts, and completions do not enter usage records, logs, audits, or Redis. The user-requested queued datasource analysis is the explicit persistence exception: it temporarily encrypts the Markdown source to permit background work, clears it at the terminal state, and retains the final compatibility report with safe job status so the user can return to it. `llm_usage` tracks only organization/resource IDs, task/prompt version, provider/model, token counts, latency, success, and time. LLMs remain unable to access credentials, customer connections, SQL execution, or arbitrary database data; the application supplies only a bounded read-only metadata snapshot for spec chat.

## ADR-020 — Only compatibility-eligible specifications activate datasource knowledge

- **Status:** Accepted; implemented
- **Context:** A user-uploaded specification can be unrelated to a customer database or incomplete.
- **Decision:** Persist structured specification versions, schema snapshots, checks, findings, and mappings before knowledge generation. Only `ELIGIBLE` (`STRONG_MATCH`/`MATCHED`) checks may queue a versioned knowledge build; previous active versions are superseded rather than deleted.
- **Reason:** RAG must not turn an unverified requirement into a claimed database fact.
- **Consequences:** Refresh compares stored extracted requirements with a new schema snapshot without retaining raw Markdown. This rebuilds datasource knowledge; it does not fine-tune or train a model.

## ADR-021 — Hybrid retrieval is schema-authoritative and snapshot-versioned

- **Status:** Accepted; implemented
- **Context:** Vector similarity alone can retrieve a semantically plausible but stale or lower-authority statement.
- **Decision:** Build datasource context from the latest persisted schema snapshot, exact metadata matching, bounded foreign-key expansion, active versioned knowledge, pgvector candidates, and active compatibility findings. Include knowledge-derived sources only when their active knowledge version references the selected snapshot; otherwise return `SCHEMA_CHANGED` and exclude them. Reranking applies explicit authority before relevance, similarity, confidence, and importance.
- **Reason:** This keeps database facts traceable to metadata while retaining useful semantic retrieval.
- **Consequences:** pgvector is filtered by organization, datasource, active knowledge version, active state, and embedding dimension. Context packages are budgeted and safe to pass to `LlmService`, but they are not SQL prompts and cannot cause execution.

## ADR-022 — Models propose structured read-only query plans; the application compiles SQL

- **Status:** Accepted; implemented for MySQL SQL previews only
- **Context:** Natural-language data questions require semantic interpretation, but raw model SQL cannot safely control customer databases.
- **Decision:** `LlmService` returns a Zod-validated `SqlQueryPlan`, not executable SQL. Application services bind it to the current snapshot, validate identifiers/foreign keys/complexity/sensitive fields, compile parameterized MySQL SQL, then parse the compiled result with `node-sql-parser`. Only validated SELECT previews are persisted with redacted parameter metadata.
- **Reason:** Structured plans keep semantic decisions bounded while deterministic code remains responsible for identifiers, literals, read-only policy, and SQL safety.
- **Consequences:** No generated query executes or opens a customer connection. A later, separately authorized execution milestone must re-check the recorded snapshot, require read-only database permissions, add runtime timeout/cancellation/result limits, and audit execution.
