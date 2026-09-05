# Milestone 1 datasource configuration and lifecycle TDD evidence

## Source and journeys

The user-provided backend cleanup brief was converted into the following focused guarantees:

1. As an operator, I can configure SchemaIQ's internal PostgreSQL database without supplying any customer MySQL credential at process startup.
2. As a tenant, a disabled datasource cannot decrypt credentials, create a connection, or have its disabled state changed by a connection test.
3. As a platform operator, concurrent requests for one datasource initialize exactly one dynamic connection, while distinct in-flight initializations remain bounded.
4. As a tenant, two datasource IDs remain isolated and an idle connection is cleaned up through the shared lifecycle pass.

## RED → GREEN evidence

| Guarantee | RED evidence | GREEN evidence |
| --- | --- | --- |
| Customer-only pool setting | The focused Jest run showed `MYSQL_CUSTOMER_POOL_SIZE` was absent and the connector received an undefined pool size. | `environment.ts`, `AppConfigService`, and `MySqlDatabaseConnector` use `MYSQL_CUSTOMER_POOL_SIZE`; the focused suite passed. |
| Disabled datasource safety | The resolver decrypted before rejecting and the saved-test path changed `DISABLED` to `CONNECTION_FAILED`. | The resolver and saved-test path reject `DATASOURCE_DISABLED` before credential access or persistence; the focused suite passed. |
| Bounded initialization | A second distinct datasource started initialization while the manager limit was already occupied. | The manager rejects excess distinct in-flight initialization with `DATASOURCE_RESOURCE_LIMIT`; the focused suite passed. |
| Isolation and cleanup | Added direct manager guarantees for 20 callers of one ID, two distinct resolved databases, invalidation isolation, and idle cleanup. | `database-connection.manager.spec.ts` passed with all lifecycle guarantees. |

The RED command was:

```text
corepack pnpm --filter @schemaiq/api exec jest --runInBand src/config/environment.spec.ts src/database-connectors/mysql-database.connector.spec.ts src/database-connections/datasource-config.resolver.spec.ts src/database-connections/database-connection.manager.spec.ts src/datasources/datasources.service.spec.ts
```

It failed only on the five intended gaps. The same focused command passed after the minimal implementation changes (5 suites, 36 tests); the subsequent manager-only verification passed 11 tests after the isolation and idle-cleanup assertions were added.

## Coverage and verification

`corepack pnpm test:coverage` passed with 91.89% statements, 86.77% branches, 90.50% functions, and 92.81% lines for the API coverage target. The final validation also passed: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` (38 API suites / 260 tests and 39 web suites / 149 tests), and `corepack pnpm build`.

## Known gap

The Docker `mysql-test` fixture was not running, so no live two-server MySQL exercise was claimed. The manager test uses two separately resolved datasource configurations and verifies each is passed to a distinct dynamic connection, that invalidating A leaves B reusable, and that idle entries close. A live multi-MySQL integration suite can be added when CI provisions dedicated customer database fixtures.
