# SchemaIQ agent guide

SchemaIQ is a modular-monolith SaaS foundation for an AI Database Intelligence platform. Implement only explicitly authorized milestones; Milestones 0, 1, 3.5, 3.6 (CSV Import Frontend), the Milestone 5 LLM gateway, and verified datasource knowledge foundation are currently present.

## Engineering rules

- Use strict TypeScript throughout NestJS and Next.js application source.
- Keep NestJS controllers HTTP-only; application logic belongs in injected services and persistence uses injected TypeORM repositories.
- TypeORM and `DatabaseModule` manage only the internal SchemaIQ PostgreSQL database. Customer databases use a separate connector architecture (`DatabaseConnectionManager` / `DatabaseConnector`), never TypeORM's Nest module.
- Validate external input, return sanitized errors, enforce tenant authorization on future tenant resources, and never commit, log, or return secrets.
- Keep PostgreSQL and Redis clients singleton and lifecycle-managed. Do not add unbounded process memory, timers, listeners, or per-request clients.
- Use migrations with `synchronize: false`. Migrations are reversible and immutable after deployment.
- Add only dependencies needed by the current milestone; inspect and reuse existing code before adding abstractions.
- Write focused Jest tests for behavior and failure paths. Do not add meaningless coverage tests.

## Customer MySQL connectivity (Milestone 1)

- Customer MySQL connections must go through `DatabaseConnectionManager`. Never create a customer `DataSource` directly from a controller, another service, or a one-off script.
- Never dynamically register a customer database through TypeORM's Nest module (`forRoot`/`forRootAsync`). Customer `DataSource` instances are created and destroyed directly by the connection-management infrastructure.
- Never cache decrypted credentials. Decrypt only immediately before building a connection; never attach plaintext to long-lived objects, logs, or Redis.
- Never introduce static production customer database credentials into `.env`; every customer operation begins with an organization-scoped `datasourceId`.
- Never expose datasource secrets (password, SSH password/private key/passphrase, encrypted payload fields) through any controller, DTO, or API response.
- Always close customer `DataSource` and SSH tunnel resources through the connection manager's lifecycle (invalidate/idle-cleanup/shutdown) — never leave a customer connection or tunnel open outside its managed lifecycle.
- Browser datasource requests go through the shared `datasourcesApi`; never persist, cache, log, or render customer passwords in the web application.
- Datasource schema discovery uses `DatabaseConnectionManager` and fixed, parameterized metadata queries only; never accept raw SQL or send customer rows, credentials, or connection details to an LLM.

## PostgreSQL CSV imports (Milestone 3.5)

- Never implement CSV imports with row-by-row `INSERT` loops. Use `PostgresCopyService` and `COPY FROM STDIN`.
- Never load an import file into a `Buffer`, string, or in-memory row collection. Upload and process it as a stream.
- Never create COPY SQL from unchecked request identifiers. Validate against PostgreSQL metadata and quote through `PostgresIdentifierService`.
- Large imports must use the bounded BullMQ import queue; jobs contain identifiers only, never file contents or secrets.

## CSV Import Frontend (Milestone 3.6)

- Frontend API calls to the SchemaIQ backend go through `apps/web/lib/api-client.ts` only. Never scatter `fetch(...)` calls across components.
- Frontend code imports backend enums and response types from `@schemaiq/types` verbatim. Never redefine `DataImportStatus`/`DataImportProcessingMode`/response shapes locally.
- Status polling (e.g. import detail) uses TanStack Query `refetchInterval` keyed off the resource's own status field, stopped once the status is terminal. Never hand-roll `setInterval`/`clearInterval` for polling.

## LLM gateway foundation (Milestone 5)

- Business modules call `LlmService` / the `LLM_PROVIDER` abstraction; they must never call OpenRouter or another model API directly.
- Development uses a configured loopback-only Ollama model first, then OpenRouter; other environments use OpenRouter first, then configured Ollama. Resolve cloud models and prompt versions through `LlmModelConfigService`; never put model slugs in business logic.
- Use `generateStructured` with a Zod schema for extraction and matching. Never persist output that fails its schema validation.
- Never send customer credentials, connection strings, SSH keys, application secrets, API keys, or authentication tokens to an LLM. Prompts and raw completions are not stored in usage records or logs.
- LLM usage rows contain only organization/resource identifiers, task/prompt version, provider/model, token totals, latency, result status, and timestamps. Do not add prompt/response columns without an approved retention and privacy decision. The user-requested datasource background analysis is the only exception: its temporary encrypted Markdown is cleared at the terminal state, while its safe final compatibility report is retained for the user to revisit.

## Natural-language SQL generation

- SQL generation never executes SQL or opens a customer database connection. Execution requires its own explicitly authorized milestone.
- Reject mutation intents. Never trust an LLM table, column, relationship, function, or operator without validation against the selected persisted schema snapshot.
- Never allow system-schema access from natural-language queries, interpolate literals into generated SQL, or bypass AST/read-only safety validation.
- Business services never depend directly on Ollama, OpenRouter, or embedding implementations. Use `LlmService` and `EmbeddingService` only.
- Knowledge is not model training. A mismatched or review-pending specification must never activate RAG knowledge or embeddings.
- Never embed datasource credentials, connection data, customer rows, PII, CSV contents, or raw specification Markdown. Keep vector operations tenant- and datasource-scoped.

## Commands

Use pnpm only: `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and the root `migration:*` commands.

## Definition of done

A change is complete when its focused tests and the relevant lint, typecheck, test, and build commands pass; security/lifecycle implications are handled; and architecture documentation is updated when a decision changes.
