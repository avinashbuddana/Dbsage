# Architecture

## Current: Milestone 0

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

Redis is one Nest-managed client. It currently supports connection, ping, and graceful disconnect only; no cache or queue behavior exists.

## Future customer database architecture — not implemented

```text
NestJS
    ↓
DatabaseConnectionManager
    ↓
DatabaseConnector
    ├── MySQLConnector
    ├── PostgreSQLConnector
    ├── MSSQLConnector
    └── MongoDBConnector
    ↓
Customer databases
```

Customer connections will use database-native drivers behind connector interfaces. They must never be dynamically registered in TypeORM.

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
