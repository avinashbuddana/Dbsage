# Security

## Secrets

Never commit, log, or return secrets. Environment configuration is validated at startup and accessed through `AppConfigService`. Logs explicitly redact authorization, cookies, passwords, tokens, secrets, API keys, database passwords, SSH passwords, private keys and their passphrases, encrypted payload fields (`encryptedValue`, `iv`, `authTag`), uploaded Markdown and its encrypted analysis fields, `DATASOURCE_ENCRYPTION_KEY`, and connection strings.

Production errors return a fixed envelope with a request ID. They do not expose stack traces, file paths, SQL driver details, environment values, credentials, or database URLs.

## LLM gateway privacy

`OPENROUTER_API_KEY` is a server-only startup secret. It is validated by Zod, accessed only through `AppConfigService`, added to Pino redaction, and used solely as the outbound OpenRouter bearer credential. It is never exposed by an API, included in Redis payloads, audit metadata, usage records, exception messages, or frontend code.

`OLLAMA_BASE_URL` is configuration, not user input, and is validated to loopback HTTP (`127.0.0.1`, `::1`, or `localhost`) before startup. Development uses configured Ollama first; other environments use it after retryable OpenRouter failures. It cannot be configured to send customer metadata to an arbitrary remote host.

LLM calls flow only through `LlmService` and the injected `LLM_PROVIDER` interface. The direct spec-chat and queued spec-analysis workflows supply only the user-provided Markdown and a bounded, read-only metadata snapshot of the selected database; they have no dependency on datasource credential resolution, customer connection management, or TypeORM customer connections. `LlmDataPolicyService` rejects recognizable private-key blocks, credential-bearing database URLs, and inline secret assignments before a request is sent. This is defense in depth, not an authorization substitute: business modules must never construct prompts from credentials, customer rows, or unrelated customer data.

`llm_usage` records task/prompt version, provider/model, token totals, latency, success, resource IDs, and timestamps only. It never stores an API key, prompt, completion, raw provider error, database password, connection URL, SSH credential, or encryption key. Structured output is Zod-validated before a business service receives it; invalid responses are not persistable.

## Verified datasource knowledge and embeddings

Compatibility is a gate, not a training process. `MISMATCH` and `NOT_RELEVANT` specifications are retained only as history/findings and cannot activate knowledge or vector chunks; `PARTIALLY_MATCHED` and `NEEDS_REVIEW` remain pending review. Knowledge versions are auditable through both their specification version and schema snapshot, and activation scopes every structured/vector record to organization and datasource.

Embeddings receive only verified semantic schema/specification facts: table/field/relationship mappings, constraints, and unmet requirements. They never receive customer rows, CSV data, PII, raw Markdown, passwords, connection URLs, SSH credentials, tokens, or encryption keys. Content-hash reuse is scoped to the same organization and datasource, preventing cross-tenant vector reuse.

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

The direct-MySQL browser form submits the password only through the shared datasource API client. It does not place credentials in local storage, query-cache data, rendered lists, or client logs, and clears the form after a successful save.

Spec chat and queued analysis accept only a Markdown file of at most 15 MiB. Only their JSON routes have a 32 MiB parser limit; all other JSON routes remain capped at 100 KB. For a large file, deterministic relevance selection limits the context sent to the model. A queued analysis temporarily stores the Markdown AES-256-GCM encrypted using the existing datasource encryption key so the worker can finish after the browser leaves; it clears every encrypted source field on either terminal state. Redis receives IDs only. The safe status, structured specification requirements, bounded metadata schema snapshot, compatibility evidence, and final report are retained for audit/recheck; raw Markdown and customer rows are never returned, logged, or added to audit metadata. The API validates database names against `SHOW DATABASES`, uses parameterized fixed queries against `information_schema`, excludes system databases, and caps the snapshot at 250 tables / 2,000 columns. Audit records contain only IDs, database name, and safe state metadata.

They must never be sent to LLM providers or appear in logs, errors, audit entries, or analytics.

Production environment configuration contains no customer MySQL host, username, password, URL, or connection-string values. Those values are either validated as separate datasource input fields and persisted without the password, or stored encrypted per datasource. Raw connection URLs are not accepted by datasource DTOs and are never persisted. `INTEGRATION_MYSQL_*` values are Docker-fixture configuration only and are not read by production services.

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

Customer MySQL connections are never created ad hoc: `DatabaseConnectionManager` is the only owner of customer `DataSource` instances, bounded by `MYSQL_MAX_ACTIVE_DATASOURCES` with LRU eviction of idle (zero active-operation) connections, small per-datasource pools (`MYSQL_CUSTOMER_POOL_SIZE`, default 3), a bounded in-flight initialization map, and a bounded `MYSQL_CONNECT_TIMEOUT_MS`. Concurrent requests for the same datasource are deduplicated to exactly one `DataSource` initialization. One shared, unref'd timer performs idle cleanup — never one timer per datasource. Every customer `DataSource` and SSH tunnel is destroyed on idle timeout, invalidation, deletion, or `OnApplicationShutdown`; nothing is left open across a restart.

## Read-only customer database user

SchemaIQ customers should create a dedicated MySQL user for SchemaIQ with only `SELECT` and `SHOW VIEW` privileges (future schema-introspection milestones will also need `INFORMATION_SCHEMA` visibility). Do not grant `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, or `CREATE`. SchemaIQ does not create database users automatically.

## Safe SQL generation

```text
untrusted question → structured plan → schema/FK/sensitive-column validation
  → parameterized compiler → SQL AST validation → validated preview only
```

Generated queries are SELECT-only previews; this milestone never opens a customer connection or executes SQL. The intent classifier rejects mutation language before planning. The planner sees only a bounded, tenant-scoped `DatabaseContextPackage`; raw rows, credentials, and connection details are never provided. Model output cannot name arbitrary identifiers: table/column/foreign-key joins are validated against the selected current snapshot before compilation. Relative dates use application-resolved UTC boundaries rather than model-invented dates.

The MySQL compiler quotes identifiers only after validation and emits every literal, limit, and offset as a `?` parameter. `GeneratedQueryEntity` stores a redacted plan and parameter type metadata, never raw parameter values. Obvious credential columns (`password`, `secret`, `token`, API key, private key, OTP/PIN/CVV variants) are blocked in projection and filtering; ordinary PII-like fields are marked for future permission policy rather than silently over-blocked.

`node-sql-parser` parses the compiled SQL as defense in depth. The policy rejects multiple statements, non-SELECT ASTs, locking reads, CTEs/subqueries unless separately enabled, comments, file operations, dangerous MySQL functions (`LOAD_FILE`, `BENCHMARK`, `SLEEP`, lock functions), and `information_schema`, `mysql`, `performance_schema`, or `sys`. Prompt-injection text in the question or retrieved specification context is explicitly delimited as untrusted data and cannot bypass deterministic validation.

## Hybrid context retrieval

Database-context endpoints read persisted schema snapshots and verified knowledge from the internal PostgreSQL database only; they never reconnect to the customer database, query customer rows, or return credentials. Every lookup is scoped by organization and datasource in the same repository query. pgvector similarity queries additionally require the active knowledge-version ID, active status, and configured embedding dimension.

The newest persisted snapshot is authoritative. If an active knowledge version points to another snapshot, the response is marked `SCHEMA_CHANGED` and old knowledge/chunks/findings are excluded. Bounded packages contain only safe schema metadata and verified findings. The optional analyzer receives only that package through `LlmService`; its structured claims must cite package item IDs, and prompts/completions are neither logged nor persisted.

## Tenant isolation

All business resources belong to organizations. Every access path must enforce organization authorization on the backend; frontend filtering is never an authorization boundary. Every datasource repository lookup by id is scoped by `organizationId` in the same query (`{ id, organizationId }`), never a separate ownership check after an unscoped fetch, and `organizationId` always comes from the authenticated `OrganizationContext`, never a request body/param.

## Resource safety

PostgreSQL and Redis clients are singletons with shutdown hooks. Do not create per-request clients, unbounded collections or buffers, persistent in-process sessions, repeated listeners, or uncontrolled timers/jobs. The same applies to customer MySQL connections and SSH tunnels: they are owned exclusively by `DatabaseConnectionManager`, bounded, and lifecycle-managed — see "Bounded customer connections and resource cleanup" above.
