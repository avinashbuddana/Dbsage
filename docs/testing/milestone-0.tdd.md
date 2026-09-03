# Milestone 0 TDD evidence

## Source

Journeys and acceptance criteria were derived from the supplied Milestone 0 foundation specification. No workspace plan file was provided.

## User journeys

1. As an operator, I need invalid configuration to stop startup without exposing secret values.
2. As an operator, I need liveness and readiness endpoints that reveal status without infrastructure details.
3. As an operator, I need bounded request IDs propagated through logs and sanitized error responses.
4. As a developer, I need services to use dependency-injected TypeORM repositories.
5. As an operator, I need Redis failures and shutdown to terminate without reconnect loops or hanging the process.

## RED and GREEN evidence

| Behavior                      | RED evidence                                                                                                                                | GREEN evidence                               | Guarantee                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Config and health             | `pnpm --filter @schemaiq/api exec jest --runInBand --runTestsByPath ...` failed with `TS2307` for the intentionally missing implementations | `pnpm test`                                  | Required configuration is coerced/validated; health and readiness return sanitized contracts               |
| Request ID and repository use | Focused Jest command failed with `TS2307` for `request-id`, `UserEntity`, and `UsersService`                                                | `pnpm test`                                  | Safe bounded IDs are reused, unsafe IDs become UUIDs, and user lookup delegates to the injected repository |
| Redis shutdown                | Focused Jest test failed because reconnect controls and `destroy()` were absent                                                             | Focused test passed, then `pnpm test` passed | Redis uses a 5-second connect timeout, no reconnect loop, and immediate client destruction on shutdown     |

Final test result: 6 suites passed, 13 tests passed, 0 skipped.

## Test specification

| #   | What is guaranteed                                                | Test target              | Type             | Result |
| --- | ----------------------------------------------------------------- | ------------------------ | ---------------- | ------ |
| 1   | Ports and booleans become typed values                            | `environment.spec.ts`    | Unit             | PASS   |
| 2   | Missing secrets and production wildcard CORS fail validation      | `environment.spec.ts`    | Unit             | PASS   |
| 3   | Liveness does not expose infrastructure                           | `health.service.spec.ts` | Unit             | PASS   |
| 4   | Readiness requires PostgreSQL and Redis and sanitizes failures    | `health.service.spec.ts` | Unit             | PASS   |
| 5   | `/api/v1/health` and `/api/v1/health/ready` serve their contracts | `health.e2e-spec.ts`     | HTTP integration | PASS   |
| 6   | Incoming request IDs are bounded and safe                         | `request-id.spec.ts`     | Unit             | PASS   |
| 7   | `UsersService` uses its injected repository                       | `users.service.spec.ts`  | Unit             | PASS   |
| 8   | Redis has bounded connection and shutdown behavior                | `redis.service.spec.ts`  | Unit             | PASS   |

## Coverage and additional checks

`pnpm test:coverage` passed the configured 80% global threshold: 94.73% statements, 86.95% branches, 100% functions, and 95.91% lines across the targeted configuration, request-ID, and health surface.

The initial TypeORM migration was also run, reverted, and reapplied against PostgreSQL 17. Live probes returned HTTP 200 for both health routes, a sanitized request-ID-bearing 404 envelope, and HTTP 200 for `/`, `/login`, and `/dashboard`. SIGTERM released the API listener after the Redis lifecycle correction.

## Known gaps

The entity migration is live-tested rather than run from Jest to keep unit tests independent of Docker. Authentication and all later product milestones are intentionally absent. Git metadata did not exist during the RED/GREEN cycles, so no checkpoint commits were created.
