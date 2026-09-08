# SchemaIQ

SchemaIQ is an AI Database Intelligence platform. The repository implements the secure TypeScript foundation, managed customer MySQL connectivity, PostgreSQL CSV imports and UI, plus an OpenRouter-first LLM gateway with optional local Ollama fallback.

## Architecture

```text
Next.js web → NestJS API → TypeORM → internal PostgreSQL
                         ↘ Redis
```

TypeORM is exclusively for SchemaIQ's internal PostgreSQL database. Future customer connections will use `DatabaseConnectionManager` and native-driver `DatabaseConnector` implementations, never dynamic TypeORM DataSources. See [Architecture](docs/ARCHITECTURE.md) and [Security](docs/SECURITY.md).

## Stack

- Node.js 24 LTS and pnpm 10
- NestJS 11, TypeScript, TypeORM, PostgreSQL
- Next.js App Router, React, Tailwind CSS
- Redis
- Pino structured logging, Zod environment validation, class-validator DTO validation
- Jest and strict ESLint/Prettier tooling

## Prerequisites

- Node.js 24 (`nvm use` reads `.nvmrc`)
- pnpm 10 (`corepack enable`)
- Docker Desktop or compatible Docker Engine with Compose

## Install

```bash
corepack enable
pnpm install
cp .env.example .env
```

Replace every example secret in `.env`. The application validates configuration at startup and will fail fast if required values are missing or malformed. Never commit `.env`.

## Local PostgreSQL and Redis

```bash
docker compose up -d postgres redis
docker compose ps
pnpm migration:run
```

The Compose services use named volumes and health checks. Values come from `.env`, with local-only fallbacks when the file is absent.

## Development

```bash
pnpm dev          # API and web
pnpm dev:api      # http://localhost:3001/api/v1
pnpm dev:web      # http://localhost:3000
```

Available API probes:

```text
GET /api/v1/health
GET /api/v1/health/ready
```

Readiness checks PostgreSQL and Redis but never returns connection details.

## Migrations

Run commands from the repository root after configuring `.env`:

```bash
pnpm migration:create -- src/database/migrations/add-example
pnpm migration:generate -- src/database/migrations/add-example
pnpm migration:show
pnpm migration:run
pnpm migration:revert
```

The CLI DataSource is used only by migration commands. Nest owns the single TypeORM DataSource used by the running API. `synchronize` is always false.

## Quality commands

```bash
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
```

CI runs install with the frozen lockfile, then lint, typecheck, test, and build. It does not deploy.

## Environment variables

| Variable            | Purpose                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `NODE_ENV`          | `development`, `test`, or `production`                                  |
| `API_PORT`          | NestJS listen port                                                      |
| `WEB_PORT`          | Next.js local port                                                      |
| `DATABASE_HOST`     | Internal PostgreSQL host                                                |
| `DATABASE_PORT`     | Internal PostgreSQL port                                                |
| `DATABASE_NAME`     | Internal PostgreSQL database                                            |
| `DATABASE_USER`     | Internal PostgreSQL user                                                |
| `DATABASE_PASSWORD` | Internal PostgreSQL password; never logged                              |
| `DATABASE_SSL`      | Enable verified PostgreSQL TLS                                          |
| `REDIS_HOST`        | Redis host                                                              |
| `REDIS_PORT`        | Redis port                                                              |
| `REDIS_PASSWORD`    | Optional Redis password; never logged                                   |
| `JWT_SECRET`        | Reserved validated secret; auth is not implemented                      |
| `ENCRYPTION_KEY`    | Reserved validated secret; credential storage is not implemented        |
| `DATASOURCE_ENCRYPTION_KEY` | AES-256-GCM key for datasource-scoped credentials; never logged |
| `MYSQL_CUSTOMER_POOL_SIZE` | Per-customer dynamic MySQL pool limit; not a customer credential |
| `MYSQL_MAX_ACTIVE_DATASOURCES` | Maximum managed customer datasource connections |
| `LLM_PROVIDER` | Primary provider: `ollama` for local development or `openrouter` for production |
| `OPENROUTER_API_KEY` | Server-only OpenRouter credential; never logged, returned, or sent to the frontend |
| `OPENROUTER_MODEL` | Configured OpenRouter model; no business code contains its slug |
| `LLM_REASONING_MODEL` | Validated stronger model reserved for a future explicit escalation policy |
| `LLM_FALLBACK_MODELS` | Comma-separated OpenRouter fallback model slugs, in priority order |
| `LLM_TEMPERATURE` | Low deterministic temperature for structured tasks (default `0.1`) |
| `LLM_MAX_OUTPUT_TOKENS` | Per-request completion-token ceiling |
| `LLM_TIMEOUT_MS` | Per-request OpenRouter timeout |
| `LLM_MAX_RETRIES` | Bounded retry count for retryable provider/validation failures |
| `LLM_MAX_CONCURRENCY` | Fail-fast concurrent LLM-request cap; requests are never buffered in memory |
| `OLLAMA_BASE_URL` | Loopback-only local Ollama HTTP endpoint |
| `OLLAMA_MODEL` | Configured local chat model; pull it with Ollama before use |
| `OLLAMA_TIMEOUT_MS` | Per-request local Ollama timeout |
| `OLLAMA_EMBEDDING_MODEL` | Configured local embedding model, separate from the chat model |
| `EMBEDDING_DIMENSIONS` | Required vector length validated before pgvector persistence |
| `INTEGRATION_MYSQL_*` | Docker integration-fixture only; never read by production services |
| `CORS_ORIGIN`       | Comma-separated allowed web origins; wildcard is rejected in production |
| `LOG_LEVEL`         | Pino level: fatal, error, warn, info, debug, or trace                   |

## Project structure

```text
apps/api       NestJS API, internal entities/migrations, Redis, health, security
apps/web       Next.js App Router frontend
packages/shared  Small runtime constants used across apps
packages/types   Shared HTTP contracts
packages/config  Shared strict TypeScript presets
docs           Architecture, security, requirements, decisions, roadmap, AI guidance
.cursor/rules  Focused Cursor instructions
.github        Copilot instructions and validation workflow
```

Repository instructions for AI coding tools live in `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, and `.github/copilot-instructions.md`. The context hierarchy is documented in [AI Development](docs/AI_DEVELOPMENT.md).

## Current limitations

No LLM-driven database access, SQL generation/execution, schema analysis workflow, agent framework, or frontend model selection is implemented. The LLM gateway only provides the validated, server-side provider boundary for a future authorized workflow.

## Next milestone

**Milestone 1 — Secure MySQL Datasource & Connection Manager**

Do not begin Milestone 1 without explicit instruction.
