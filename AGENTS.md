# SchemaIQ agent guide

SchemaIQ is a modular-monolith SaaS foundation for an AI Database Intelligence platform. The active scope is Milestone 0 only.

## Engineering rules

- Use strict TypeScript throughout NestJS and Next.js application source.
- Keep NestJS controllers HTTP-only; application logic belongs in injected services and persistence uses injected TypeORM repositories.
- TypeORM and `DatabaseModule` manage only the internal SchemaIQ PostgreSQL database. Customer databases must later use a separate connector architecture.
- Validate external input, return sanitized errors, enforce tenant authorization on future tenant resources, and never commit, log, or return secrets.
- Keep PostgreSQL and Redis clients singleton and lifecycle-managed. Do not add unbounded process memory, timers, listeners, or per-request clients.
- Use migrations with `synchronize: false`. Migrations are reversible and immutable after deployment.
- Add only dependencies needed by the current milestone; inspect and reuse existing code before adding abstractions.
- Write focused Jest tests for behavior and failure paths. Do not add meaningless coverage tests.

## Commands

Use pnpm only: `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and the root `migration:*` commands.

## Definition of done

A change is complete when its focused tests and the relevant lint, typecheck, test, and build commands pass; security/lifecycle implications are handled; and architecture documentation is updated when a decision changes.
