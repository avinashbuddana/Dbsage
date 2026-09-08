# SchemaIQ API

The PostgreSQL CSV import API accepts a CSV upload, validates its header and target mapping, then loads it with transactional PostgreSQL `COPY FROM STDIN`.

The datasource analysis API lists databases accessible through an already-saved MySQL datasource and compares one selected database's read-only metadata with a Markdown specification through the configured LLM gateway.

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

## Datasource specification analysis

1. Save and activate a MySQL datasource through the dashboard or datasource API.
2. `GET /datasources/{id}/databases` lists its accessible non-system databases.
3. `POST /datasources/{id}/spec-analyses` accepts one database name and up to 15 MiB of Markdown, then returns `202` with a `QUEUED` analysis. Poll `GET /datasources/{id}/spec-analyses/latest` while its status is `QUEUED` or `PROCESSING`; a completed response includes the retained report, compatibility/specification/snapshot identifiers, and a verified score.
4. `GET /datasources/{id}/specifications/{specificationId}/versions/{versionId}/compatibility` returns the score dimensions, hard-gated status, knowledge eligibility, and finding counts. `GET .../findings` supports paginated `findingType`, `severity`, and `status` filters.
5. `POST .../knowledge/build` queues a build only for `ELIGIBLE` compatibility; `GET /datasources/{id}/knowledge/status` reports active-version staleness and `POST /datasources/{id}/knowledge/refresh` compares the latest extracted specification against a fresh schema snapshot.
4. `POST /datasources/{id}/spec-chat` accepts one database name, up to 15 MiB of Markdown, and at most eight short follow-up chat messages. Large files use relevant excerpts per question so the request stays within the LLM context window.

The service validates the database name against the managed connection and reads only bounded `information_schema` metadata (maximum 250 tables and 2,000 columns). It never reads customer rows, accepts SQL, or returns credentials. A background analysis stores Markdown AES-256-GCM encrypted only while processing, then clears it on success or failure; Redis receives IDs only. PostgreSQL retains structured specification versions, schema snapshots, compatibility evidence, and safe reports. Only compatibility-eligible semantic facts become tenant-scoped pgvector knowledge; raw Markdown, credentials, and customer rows are never embedded.

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
