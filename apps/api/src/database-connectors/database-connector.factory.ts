import { Injectable } from '@nestjs/common';

import { DatasourceConnectionError } from '../database-connections/datasource-connection.error';
import { DatasourceType } from '../datasources/enums/datasource.enums';
import type { DatabaseConnector } from './database-connector.interface';
import { MySqlDatabaseConnector } from './mysql-database.connector';

@Injectable()
export class DatabaseConnectorFactory {
  constructor(private readonly mySql: MySqlDatabaseConnector) {}

  get(type: DatasourceType): DatabaseConnector {
    switch (type) {
      // DatasourceType has one member today; this branch stays exhaustive as more
      // types are added (PostgreSQL, MSSQL, ...) and guards untyped runtime values.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      case DatasourceType.MySql:
        return this.mySql;
      default:
        throw new DatasourceConnectionError(
          'DATASOURCE_CONNECTION_FAILED',
          'Unsupported datasource type',
        );
    }
  }
}
