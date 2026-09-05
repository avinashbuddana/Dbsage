# CSV Import API

The PostgreSQL CSV import API accepts a CSV upload, validates its header and target mapping, then loads it with transactional PostgreSQL `COPY FROM STDIN`.

## API artifacts

- [OpenAPI 3.1 specification](./openapi.yaml) — machine-readable endpoint contract.
- [Postman collection](./schemaiq-csv-import.postman_collection.json) — import this into Postman to exercise every import endpoint.

## Local use

Set the Postman collection variables before sending a request:

- `baseUrl`: `http://localhost:3001/api/v1` by default.
- `organizationId`: a UUID for a development organization context.
- `csvFilePath`: an absolute path to a local CSV file for the upload request.
- `importId`: populated from an upload/list response before using status, retry, cancel, or delete.

`x-organization-id` is a development-only context header, not production authentication. The current API rejects all organization-scoped calls in production until authentication is implemented.

## Workflow

1. `POST /imports/csv` uploads one `.csv` file and chooses a target schema/table. `columnMapping` is optional JSON mapping CSV headers to target columns.
2. A small file completes in the request and returns `201`; a large file returns `202` in `QUEUED` mode.
3. Poll `GET /imports/{id}` until the status is terminal: `COMPLETED`, `FAILED`, or `CANCELLED`.
4. Retry a retained `FAILED` file with `POST /imports/{id}/retry`; this always queues a new import attempt.
5. Cancel only while `QUEUED`; delete only terminal import history.

The API streams the upload and COPY payload; it does not accept CSV text or database credentials in JSON. Targets are validated from PostgreSQL metadata, and protected/system tables are rejected.

## Error contract

Every error response has the following sanitized shape. The `x-request-id` response header identifies the corresponding server log entry.

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Invalid request",
  "requestId": "2d64da71-3d0a-45b3-a7f0-cb6252af5378"
}
```

The generic error envelope intentionally does not expose filesystem paths, PostgreSQL diagnostics, credentials, or the uploaded file contents.
