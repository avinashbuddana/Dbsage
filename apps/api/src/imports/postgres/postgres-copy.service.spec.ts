import { PassThrough, Readable } from 'node:stream';

import type { AppConfigService } from '../../config/app-config.service';
import type { BulkImportPostgresProvider } from './bulk-import-postgres.provider';
import { PostgresCopyService } from './postgres-copy.service';

const copyFromMock = jest.fn();

jest.mock('pg-copy-streams', () => ({ from: (command: string): unknown => copyFromMock(command) }));

describe('PostgresCopyService', () => {
  function setup() {
    const client = { query: jest.fn() };
    const provider = {
      withClient: jest.fn(async (work: (candidate: typeof client) => Promise<void>) => work(client)),
    };
    const service = new PostgresCopyService(
      provider as unknown as BulkImportPostgresProvider,
      { csvImport: { jobTimeoutMs: 60_000 } } as unknown as AppConfigService,
    );
    return { client, provider, service };
  }

  it('streams COPY in one transaction and reports bounded byte progress', async () => {
    const { client, service } = setup();
    const copyStream = new PassThrough();
    const chunks: Buffer[] = [];
    copyStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    copyFromMock.mockReturnValue(copyStream);
    client.query.mockImplementation((query: unknown) =>
      typeof query === 'string' ? Promise.resolve() : copyStream,
    );
    const onProgress = jest.fn();

    await service.copy({
      command: 'COPY "public"."customer_records" ("name") FROM STDIN WITH (FORMAT csv, HEADER true)',
      onProgress,
      source: Readable.from(['name\nAda\n']),
    });

    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(Buffer.concat(chunks).toString()).toBe('name\nAda\n');
    expect(onProgress).toHaveBeenLastCalledWith(9);
  });

  it('rolls back and destroys the source if COPY fails', async () => {
    const { client, service } = setup();
    const copyStream = new PassThrough();
    copyFromMock.mockReturnValue(copyStream);
    client.query.mockImplementation((query: unknown) => {
      if (typeof query === 'string') return Promise.resolve();
      queueMicrotask(() => copyStream.destroy(new Error('invalid input syntax for type integer')));
      return copyStream;
    });
    const source = Readable.from(['name\nAda\n']);

    await expect(
      service.copy({
        command: 'COPY "public"."customer_records" ("age") FROM STDIN WITH (FORMAT csv, HEADER true)',
        source,
      }),
    ).rejects.toThrow('invalid input syntax');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(source.destroyed).toBe(true);
  });

  it('rolls back when bounded progress persistence fails', async () => {
    const { client, service } = setup();
    const copyStream = new PassThrough();
    copyFromMock.mockReturnValue(copyStream);
    client.query.mockImplementation((query: unknown) => (typeof query === 'string' ? Promise.resolve() : copyStream));

    await expect(
      service.copy({
        command: 'COPY "public"."customer_records" ("name") FROM STDIN WITH (FORMAT csv, HEADER true)',
        onProgress: () => Promise.reject(new Error('progress persistence failed')),
        source: Readable.from(['name\nAda\n']),
      }),
    ).rejects.toThrow('progress persistence failed');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
});
