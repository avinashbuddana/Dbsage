import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { BulkImportPostgresProvider } from './bulk-import-postgres.provider';
import type { PostgresIdentifierService } from './postgres-identifier.service';
import type { PostgresImportTargetPolicyService } from './postgres-import-target-policy.service';
import { PostgresTableMetadataService } from './postgres-table-metadata.service';

describe('PostgresTableMetadataService', () => {
  function setup() {
    const client = { query: jest.fn() };
    const postgres = {
      withClient: jest.fn(async (work: (candidate: typeof client) => Promise<unknown>) => work(client)),
    };
    const policy = { assertAllowed: jest.fn() };
    const identifiers = { validateNewIdentifier: jest.fn((value: string) => value) };
    const service = new PostgresTableMetadataService(
      postgres as unknown as BulkImportPostgresProvider,
      policy as unknown as PostgresImportTargetPolicyService,
      identifiers as unknown as PostgresIdentifierService,
    );
    return { client, identifiers, policy, service };
  }

  it('retrieves importable columns with parameterized schema and table names', async () => {
    const { client, policy, service } = setup();
    client.query
      .mockResolvedValueOnce({ rows: [{ exists: true }] })
      .mockResolvedValueOnce({ rows: [{ exists: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            column_name: 'id',
            data_type: 'uuid',
            has_default: true,
            is_generated: false,
            is_identity: false,
            is_nullable: false,
          },
          {
            column_name: 'name',
            data_type: 'text',
            has_default: false,
            is_generated: false,
            is_identity: false,
            is_nullable: false,
          },
        ],
      });

    await expect(service.getTable('public', 'customer_records')).resolves.toMatchObject({
      schema: 'public',
      table: 'customer_records',
      columns: [{ name: 'id' }, { name: 'name' }],
    });

    expect(policy.assertAllowed).toHaveBeenCalledWith('public', 'customer_records');
    expect(client.query).toHaveBeenCalledWith(expect.any(String), ['public']);
    expect(client.query).toHaveBeenCalledWith(expect.any(String), ['public', 'customer_records']);
  });

  it('does not query columns when the requested schema does not exist', async () => {
    const { client, service } = setup();
    client.query.mockResolvedValueOnce({ rows: [{ exists: false }] });

    await expect(service.getTable('absent', 'customer_records')).rejects.toThrow(NotFoundException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('reports whether a table exists', async () => {
    const { client, service } = setup();
    client.query.mockResolvedValueOnce({ rows: [{ exists: true }] });

    await expect(service.tableExists('public', 'new_customers')).resolves.toBe(true);
    expect(client.query).toHaveBeenCalledWith(expect.any(String), ['public', 'new_customers']);
  });

  it('creates a table with the requested column types after validating identifiers and policy', async () => {
    const { client, identifiers, policy, service } = setup();
    client.query.mockResolvedValue({ rows: [] });

    await service.createTable('public', 'new_customers', [
      { name: 'name', type: 'text' },
      { name: 'created_at', type: 'timestamp' },
    ]);

    expect(policy.assertAllowed).toHaveBeenCalledWith('public', 'new_customers');
    expect(identifiers.validateNewIdentifier).toHaveBeenCalledWith('public');
    expect(identifiers.validateNewIdentifier).toHaveBeenCalledWith('new_customers');
    expect(identifiers.validateNewIdentifier).toHaveBeenCalledWith('name');
    expect(identifiers.validateNewIdentifier).toHaveBeenCalledWith('created_at');
    expect(client.query).toHaveBeenCalledWith(
      'CREATE TABLE "public"."new_customers" ("name" text, "created_at" timestamp, "updated_at" timestamptz NOT NULL DEFAULT now())',
    );
    expect(client.query).toHaveBeenCalledWith(
      'CREATE TRIGGER "trg_new_customers_set_updated_at" BEFORE UPDATE ON "public"."new_customers" FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
    );
  });

  it('auto-adds created_at and updated_at with an update trigger when neither is requested', async () => {
    const { client, service } = setup();
    client.query.mockResolvedValue({ rows: [] });

    await service.createTable('public', 'new_customers', [{ name: 'name', type: 'text' }]);

    expect(client.query).toHaveBeenCalledWith(
      'CREATE TABLE "public"."new_customers" ("name" text, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now())',
    );
    expect(client.query).toHaveBeenCalledWith(
      'CREATE TRIGGER "trg_new_customers_set_updated_at" BEFORE UPDATE ON "public"."new_customers" FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
    );
  });

  it('does not duplicate created_at or updated_at when the caller already supplied both', async () => {
    const { client, service } = setup();
    client.query.mockResolvedValue({ rows: [] });

    await service.createTable('public', 'new_customers', [
      { name: 'name', type: 'text' },
      { name: 'created_at', type: 'timestamptz' },
      { name: 'updated_at', type: 'timestamptz' },
    ]);

    expect(client.query).toHaveBeenCalledWith(
      'CREATE TABLE "public"."new_customers" ("name" text, "created_at" timestamptz, "updated_at" timestamptz)',
    );
    expect(client.query).toHaveBeenCalledWith(
      'CREATE TRIGGER "trg_new_customers_set_updated_at" BEFORE UPDATE ON "public"."new_customers" FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
    );
  });

  it('skips the update trigger when the caller supplied a non-timestamptz updated_at column', async () => {
    const { client, service } = setup();
    client.query.mockResolvedValue({ rows: [] });

    await service.createTable('public', 'new_customers', [
      { name: 'name', type: 'text' },
      { name: 'updated_at', type: 'text' },
    ]);

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(
      'CREATE TABLE "public"."new_customers" ("name" text, "updated_at" text, "created_at" timestamptz NOT NULL DEFAULT now())',
    );
  });

  it('refuses to create a table with no columns', async () => {
    const { service } = setup();

    await expect(service.createTable('public', 'new_customers', [])).rejects.toThrow(BadRequestException);
  });

  it('refuses to create a table with duplicate column names', async () => {
    const { service } = setup();

    await expect(
      service.createTable('public', 'new_customers', [
        { name: 'name', type: 'text' },
        { name: 'name', type: 'text' },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to create a table with a column type outside the allowlist', async () => {
    const { service } = setup();

    await expect(
      service.createTable('public', 'new_customers', [{ name: 'name', type: 'text; DROP TABLE users; --' }]),
    ).rejects.toThrow(BadRequestException);
  });
});
