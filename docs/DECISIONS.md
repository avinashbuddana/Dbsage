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
- **Context:** Later milestones will need shared ephemeral cache/job infrastructure.
- **Decision:** Establish one lifecycle-managed Redis client with connect, ping, and disconnect only.
- **Reason:** Redis supplies cross-process ephemeral storage without relying on application memory.
- **Consequences:** Caching and queues remain unimplemented until required.

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

- **Status:** Accepted
- **Context:** Customer databases vary by engine and scale, with different lifecycle and security requirements from internal data.
- **Decision:** Future `DatabaseConnectionManager` and `DatabaseConnector` implementations use native drivers such as `mysql2`.
- **Reason:** A dedicated abstraction can enforce bounded pools, read-only policy, credential isolation, and engine-specific behavior.
- **Consequences:** The Nest TypeORM module contains only internal entities and one internal PostgreSQL pool.
