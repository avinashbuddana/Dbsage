# Security

## Secrets

Never commit, log, or return secrets. Environment configuration is validated at startup and accessed through `AppConfigService`. Logs explicitly redact authorization, cookies, passwords, tokens, secrets, API keys, database passwords, and connection strings.

Production errors return a fixed envelope with a request ID. They do not expose stack traces, file paths, SQL driver details, environment values, credentials, or database URLs.

## Internal database

TypeORM connects only to SchemaIQ PostgreSQL through one Nest-managed pool. Schema changes use reversible migrations. `synchronize: true` is forbidden.

## Future customer credentials

Customer database credentials will be encrypted. They must never be sent to LLM providers or appear in logs, errors, audit entries, or analytics. Credential storage is not implemented in Milestone 0.

## Future query safety

```text
LLM
 ↓
SQL Parser
 ↓
Policy Validation
 ↓
Schema Validation
 ↓
DatabaseConnector
```

LLMs will never directly control database connections. V1 customer access will be read-only and enforced outside the model.

## Tenant isolation

All future business resources belong to organizations. Every access path must enforce organization authorization on the backend; frontend filtering is never an authorization boundary.

## Resource safety

PostgreSQL and Redis clients are singletons with shutdown hooks. Do not create per-request clients, unbounded collections or buffers, persistent in-process sessions, repeated listeners, or uncontrolled timers/jobs.
