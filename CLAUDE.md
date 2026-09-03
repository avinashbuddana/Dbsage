# SchemaIQ

SchemaIQ is an AI Database Intelligence platform. The current scope is **MILESTONE 0 — FOUNDATION**. Do not implement future milestones unless explicitly requested.

## Architecture

- Backend: NestJS + strict TypeScript
- Frontend: Next.js App Router + strict TypeScript + Tailwind CSS
- Internal database: PostgreSQL + TypeORM
- Redis: managed cache/jobs foundation only
- Deployment shape: pnpm modular monolith

TypeORM manages **only** the SchemaIQ internal PostgreSQL database. Never dynamically register customer databases through TypeORM. Future customer connectivity will use `DatabaseConnectionManager` and `DatabaseConnector` implementations.

Future work includes customer MySQL connectivity, schema introspection, relationship discovery, natural-language querying, SQL generation/execution/optimization, and documentation generation. None is implemented in Milestone 0.

## Never

- Use JavaScript when TypeScript is supported or weaken strict TypeScript.
- Add unnecessary `any`, hardcoded secrets, credential logging, or scattered `process.env` access.
- Create database clients per request, global mutable state, unbounded caches, timers, or listeners.
- Set TypeORM `synchronize: true` or place persistence/business logic in controllers.
- Add microservices, Kubernetes, vector databases, LLM SDKs, queues, or future features prematurely.
- Disable useful lint rules to make checks pass or introduce circular/multi-purpose services.

## Completion

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Do not claim success for checks that did not pass.
