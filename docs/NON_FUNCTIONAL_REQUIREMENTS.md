# Non-functional requirements

| ID      | Requirement                                          | Current state                                        |
| ------- | ---------------------------------------------------- | ---------------------------------------------------- |
| NFR-001 | No plaintext customer credentials                    | Implemented — AES-256-GCM encrypted secrets           |
| NFR-002 | No secrets in logs                                   | Implemented with structured redaction                |
| NFR-003 | Strict TypeScript                                    | Implemented in the shared base config                |
| NFR-004 | No unbounded in-memory caches                        | Implemented; no cache exists                         |
| NFR-005 | All long-lived connections support graceful shutdown | Implemented for PostgreSQL and Redis                 |
| NFR-006 | No PostgreSQL/Redis connections per request          | Implemented with Nest-managed singletons             |
| NFR-007 | Validate API input                                   | Implemented with the global validation pipe          |
| NFR-008 | Production errors do not expose internals            | Implemented by the global filter                     |
| NFR-009 | Avoid persistent process-local state                 | Implemented in the foundation                        |
| NFR-010 | Future customer DB access is read-only in V1         | Planned                                              |
| NFR-011 | TypeORM `synchronize=false`                          | Implemented                                          |
| NFR-012 | Customer database connections never use TypeORM's Nest module | Implemented — dynamic `DataSource` per connector, never registered via `TypeOrmModule` |
| NFR-013 | CSV imports remain memory-bounded and lifecycle-managed | Implemented — streaming upload/COPY, bounded queue/pool, and retained-file cleanup |
