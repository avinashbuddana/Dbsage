# Security

## Secrets

Never commit, log, or return secrets. Environment configuration is validated at startup and accessed through `AppConfigService`. Logs explicitly redact authorization, cookies, passwords, tokens, secrets, API keys, database passwords, SSH passwords, private keys and their passphrases, encrypted payload fields (`encryptedValue`, `iv`, `authTag`), `DATASOURCE_ENCRYPTION_KEY`, and connection strings.

Production errors return a fixed envelope with a request ID. They do not expose stack traces, file paths, SQL driver details, environment values, credentials, or database URLs.

## Internal database

TypeORM connects only to SchemaIQ PostgreSQL through one Nest-managed pool. Schema changes use reversible migrations. `synchronize: true` is forbidden.

## CSV import security

CSV uploads use multipart streaming with a configured byte limit, bounded multipart fields, generated storage filenames, and no whole-file memory buffer. CSV header parsing is streaming and rejects duplicate/empty/oversized headers; only configured one-character delimiters and supported CSV MIME types are accepted. Source filenames are metadata only and are never used as filesystem paths.

Import target schemas, tables, and columns are checked against PostgreSQL metadata before COPY. Identifiers are quoted only after that metadata validation; no raw user SQL or client COPY options are accepted. System schemas, migration tables, credentials, audit data, and SchemaIQ application/security tables are denied server-side.

Large imports use one bounded BullMQ job whose payload contains only `importId` and `organizationId`. CSV content and database credentials never enter Redis. A lifecycle-managed cleanup timer deletes terminal source files after retention; failed files remain only until retention so a retry is possible. Local storage is single-instance only and must be replaced by shared object storage or a shared volume before horizontally scaling.

## Customer credentials

Customer database passwords and SSH credentials are encrypted with AES-256-GCM (Node's built-in `crypto`, never a third-party crypto library) before they reach PostgreSQL. Each secret (`DatasourceSecretEntity`, keyed by `DatasourceSecretType`: `DATABASE_PASSWORD`, `SSH_PASSWORD`, `SSH_PRIVATE_KEY`, `SSH_PRIVATE_KEY_PASSPHRASE`) gets a fresh `crypto.randomBytes` IV on every encryption; the stored `encryptionVersion` starts at 1 so a future migration to an external secret provider (Vault, Infisical, AWS Secrets Manager/KMS) has a version to key off. Tampered ciphertext or auth tags fail to decrypt.

`DATASOURCE_ENCRYPTION_KEY` is a base64-encoded 32-byte key validated at application startup (`environment.ts`); an invalid or missing key fails the app to start rather than generating or defaulting a key. It is never logged and is included in the Pino redaction list below.

The rest of the application depends only on the `CredentialProvider` interface, never `EncryptedDatabaseCredentialProvider` directly, so swapping in an external secret provider later does not require touching callers. Credentials are decrypted only immediately before a connection is built (`DatasourceConfigResolver`) and are never cached, logged, put in audit metadata, or returned from any API response — `toResponse()` in `DatasourcesService` explicitly whitelists safe fields rather than serializing entities.

They must never be sent to LLM providers or appear in logs, errors, audit entries, or analytics.

## Network / SSRF protection

`DatasourceNetworkPolicyService` validates every DIRECT database host and every SSH bastion host before it is used for a connection attempt (create, update, test, and every pooled reuse). It:

- Rejects input that is not a bare hostname or IP literal (no `http://`, `mysql://`, filesystem paths, or shell metacharacters), both at the DTO layer (`@Matches`) and again in the service.
- Resolves DNS and validates the **resolved** addresses, not just the input string, so a hostname cannot bypass the check.
- Unconditionally blocks cloud metadata addresses: `169.254.0.0/16` (including `169.254.169.254`), IPv6 link-local (`fe80::/10`), the AWS IPv6 metadata address, and known metadata hostnames — this holds even when the local-development override below is enabled.
- Blocks loopback targets (`127.0.0.0/8`, `::1`) unless `ALLOW_LOCAL_DATASOURCES=true`, which defaults to `false` and is rejected outright when `NODE_ENV=production`.
- Does **not** block private (RFC1918) ranges: SSH bastions and SSH-tunneled database targets legitimately live on private networks. The remote database host behind an SSH tunnel is validated more lightly (`validateRemoteTarget`, no DNS resolution) since it is only ever reached through the tunnel by the remote sshd, not resolved locally.

Known residual limitation: because DNS is re-resolved independently by the `mysql2`/`ssh2` drivers at connect time, a narrow DNS-rebinding race exists between the policy check and the actual connection. The window is small — validation happens immediately before every connection attempt, not once at datasource-creation time — but a fully closed race would require pinning the resolved IP through to the driver connection, which trades off TLS hostname/certificate verification for hostname-based customer databases. Not implemented in this milestone.

## SSH connectivity

SSH tunnels use the `ssh2` library (no hand-rolled protocol implementation). `PRIVATE_KEY` and `PASSWORD` authentication are supported; SSH secrets use the same `CredentialProvider`/AES-256-GCM path as database passwords. A local forwarding listener binds to `127.0.0.1` on an OS-assigned ephemeral port (never `0.0.0.0`, never a fixed shared port). Tunnels are reused alongside their pooled `DataSource` and are always closed — on idle cleanup, on datasource invalidation/deletion, and on application shutdown — even on connection failure. Raw `ssh2` errors are normalized to typed codes (`SSH_AUTHENTICATION_FAILED`, `SSH_CONNECTION_REFUSED`, `SSH_TIMEOUT`, `SSH_TUNNEL_FAILED`) before they can reach an API response.

## TLS

TLS-enabled MySQL connections default to `rejectUnauthorized: true` — certificate verification is never disabled by default, and there is no configuration path to `rejectUnauthorized: false` in this milestone. Custom CA certificates are not yet supported.

## Bounded customer connections and resource cleanup

Customer MySQL connections are never created ad hoc: `DatabaseConnectionManager` is the only owner of customer `DataSource` instances, bounded by `MYSQL_MAX_ACTIVE_DATASOURCES` with LRU eviction of idle (zero active-operation) connections, small per-datasource pools (`MYSQL_POOL_SIZE`, default 3), and a bounded `MYSQL_CONNECT_TIMEOUT_MS`. Concurrent requests for the same datasource are deduplicated to exactly one `DataSource` initialization. One shared, unref'd timer performs idle cleanup — never one timer per datasource. Every customer `DataSource` and SSH tunnel is destroyed on idle timeout, invalidation, deletion, or `OnApplicationShutdown`; nothing is left open across a restart.

## Read-only customer database user

SchemaIQ customers should create a dedicated MySQL user for SchemaIQ with only `SELECT` and `SHOW VIEW` privileges (future schema-introspection milestones will also need `INFORMATION_SCHEMA` visibility). Do not grant `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, or `CREATE`. SchemaIQ does not create database users automatically.

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

All business resources belong to organizations. Every access path must enforce organization authorization on the backend; frontend filtering is never an authorization boundary. Every datasource repository lookup by id is scoped by `organizationId` in the same query (`{ id, organizationId }`), never a separate ownership check after an unscoped fetch, and `organizationId` always comes from the authenticated `OrganizationContext`, never a request body/param.

## Resource safety

PostgreSQL and Redis clients are singletons with shutdown hooks. Do not create per-request clients, unbounded collections or buffers, persistent in-process sessions, repeated listeners, or uncontrolled timers/jobs. The same applies to customer MySQL connections and SSH tunnels: they are owned exclusively by `DatabaseConnectionManager`, bounded, and lifecycle-managed — see "Bounded customer connections and resource cleanup" above.
