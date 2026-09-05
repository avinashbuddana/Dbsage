import { Pool } from 'pg';

import type { AppConfigService } from '../../config/app-config.service';
import { BulkImportPostgresProvider } from './bulk-import-postgres.provider';

jest.mock('pg', () => ({ Pool: jest.fn() }));

const pool = { connect: jest.fn(), end: jest.fn() };
const PoolConstructor = Pool as unknown as jest.Mock<unknown, unknown[]>;

describe('BulkImportPostgresProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PoolConstructor.mockReturnValue(pool);
  });

  it('uses a bounded application PostgreSQL pool and always releases its client', async () => {
    const client = { release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    const provider = new BulkImportPostgresProvider(
      {
        csvImport: { postgresPoolMax: 3 },
        database: { host: 'db', name: 'schemaiq', password: 'secret', port: 5432, ssl: true, user: 'app' },
      } as unknown as AppConfigService,
    );

    await expect(provider.withClient(() => Promise.resolve('copied'))).resolves.toBe('copied');

    expect(PoolConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'db', max: 3, ssl: { rejectUnauthorized: true } }),
    );
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('releases a client after a COPY failure and closes the bounded pool at shutdown', async () => {
    const client = { release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    const provider = new BulkImportPostgresProvider(
      {
        csvImport: { postgresPoolMax: 3 },
        database: { host: 'db', name: 'schemaiq', password: 'secret', port: 5432, ssl: false, user: 'app' },
      } as unknown as AppConfigService,
    );

    await expect(provider.withClient(async () => Promise.reject(new Error('COPY failed')))).rejects.toThrow('COPY failed');
    await provider.onApplicationShutdown();

    expect(client.release).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});
