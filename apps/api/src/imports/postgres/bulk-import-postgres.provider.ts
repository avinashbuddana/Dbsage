import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';

import { AppConfigService } from '../../config/app-config.service';

@Injectable()
export class BulkImportPostgresProvider implements OnApplicationShutdown {
  private readonly pool: Pool;

  constructor(config: AppConfigService) {
    const database = config.database;
    this.pool = new Pool({
      database: database.name,
      host: database.host,
      max: config.csvImport.postgresPoolMax,
      password: database.password,
      port: database.port,
      ssl: database.ssl ? { rejectUnauthorized: true } : false,
      user: database.user,
    });
  }

  async withClient<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await work(client);
    } finally {
      client.release();
    }
  }

  onApplicationShutdown(): Promise<void> {
    return this.pool.end();
  }
}
