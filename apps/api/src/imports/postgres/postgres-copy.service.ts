import { Injectable } from '@nestjs/common';
import { from as copyFrom } from 'pg-copy-streams';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { AppConfigService } from '../../config/app-config.service';
import { BulkImportPostgresProvider } from './bulk-import-postgres.provider';

export interface PostgresCopyInput {
  command: string;
  source: Readable;
  onProgress?: (processedBytes: number) => Promise<void> | void;
}

export interface PostgresCopyResult {
  processedBytes: number;
  rowCount: number;
}

@Injectable()
export class PostgresCopyService {
  constructor(
    private readonly postgres: BulkImportPostgresProvider,
    private readonly config: AppConfigService,
  ) {}

  async copy(input: PostgresCopyInput): Promise<PostgresCopyResult> {
    return this.postgres.withClient(async (client) => {
      let transactionStarted = false;
      try {
        await client.query('BEGIN');
        transactionStarted = true;
        await client.query(`SELECT set_config('statement_timeout', $1, true)`, [
          String(this.config.csvImport.jobTimeoutMs),
        ]);

        let processedBytes = 0;
        const meter = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            processedBytes += chunk.length;
            Promise.resolve(input.onProgress?.(processedBytes)).then(
              () => {
                callback(null, chunk);
              },
              (error: unknown) => {
                callback(error instanceof Error ? error : new Error('Progress update failed'));
              },
            );
          },
        });
        const destination = client.query(copyFrom(input.command));
        await pipeline(input.source, meter, destination);
        await client.query('COMMIT');
        transactionStarted = false;
        return { processedBytes, rowCount: destination.rowCount };
      } catch (error) {
        input.source.destroy();
        if (transactionStarted) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // Preserve the COPY failure; the released client will not be reused if PostgreSQL closed it.
          }
        }
        throw error;
      }
    });
  }
}
