import { NotFoundException } from '@nestjs/common';

import type { BulkImportPostgresProvider } from './bulk-import-postgres.provider';
import type { PostgresImportTargetPolicyService } from './postgres-import-target-policy.service';
import { PostgresTableMetadataService } from './postgres-table-metadata.service';

describe('PostgresTableMetadataService', () => {
  function setup() {
    const client = { query: jest.fn() };
    const postgres = {
      withClient: jest.fn(async (work: (candidate: typeof client) => Promise<unknown>) => work(client)),
    };
    const policy = { assertAllowed: jest.fn() };
    const service = new PostgresTableMetadataService(
      postgres as unknown as BulkImportPostgresProvider,
      policy as unknown as PostgresImportTargetPolicyService,
    );
    return { client, policy, service };
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
});
