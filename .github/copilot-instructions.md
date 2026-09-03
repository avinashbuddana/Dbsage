# SchemaIQ Copilot instructions

- Work only within the requested milestone; current scope is Milestone 0 foundation.
- Use strict TypeScript, NestJS for the backend, and Next.js App Router for the frontend. Do not add `any`.
- PostgreSQL + TypeORM manage only SchemaIQ's internal data. Customer databases must use the future connector architecture, never TypeORM.
- Keep controllers thin, put application logic in injected services, and inject repositories.
- Validate untrusted inputs. Never hardcode, log, return, or place secrets in errors or audit metadata.
- Keep PostgreSQL and Redis connections singleton and lifecycle-managed.
- Run relevant tests and `pnpm typecheck`; run the full validation chain before completion.
