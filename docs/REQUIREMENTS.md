# Functional requirements

Statuses are `PLANNED`, `IN_PROGRESS`, or `IMPLEMENTED`. Requirements move to implemented only when their authorized milestone is delivered.

| ID     | Requirement                     | Status  |
| ------ | ------------------------------- | ------- |
| FR-001 | User authentication             | PLANNED |
| FR-002 | Organization management         | PLANNED |
| FR-003 | Datasource management           | IMPLEMENTED |
| FR-004 | Secure credential management    | IMPLEMENTED |
| FR-005 | MySQL connectivity              | IMPLEMENTED |
| FR-006 | Schema introspection            | PLANNED |
| FR-007 | Relationship discovery          | PLANNED |
| FR-008 | Schema questions                | PLANNED |
| FR-009 | Natural-language SQL generation | PLANNED |
| FR-010 | Read-only SQL execution         | PLANNED |
| FR-011 | Query optimization              | PLANNED |
| FR-012 | Documentation generation        | PLANNED |
| FR-013 | Schema synchronization          | PLANNED |
| FR-014 | Audit logging                   | PLANNED |
| FR-015 | Query history                   | PLANNED |
| FR-016 | PostgreSQL CSV bulk import      | IMPLEMENTED |

The User, Organization, OrganizationMember, and AuditLog persistence schemas are foundation infrastructure; they do not mark their corresponding product workflows implemented.
