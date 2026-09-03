# SchemaIQ

SchemaIQ is an AI Database Intelligence platform. This repository currently implements **Milestone 0 — Foundation**: a secure, strictly typed modular monolith ready for later product work.

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

Milestone 0 intentionally has no authentication flow, organization APIs, datasource credential storage, customer database connectivity, schema analysis, LLM integration, SQL generation/execution, cache behavior, queues, vector search, or agent framework.

## Next milestone

**Milestone 1 — Secure MySQL Datasource & Connection Manager**

Do not begin Milestone 1 without explicit instruction.
