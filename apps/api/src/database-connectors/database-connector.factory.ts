import { Injectable } from '@nestjs/common';

import { DatasourceType } from '../datasources/enums/datasource.enums';
import type { DatabaseConnector } from './database-connector.interface';
import { MySqlDatabaseConnector } from './mysql-database.connector';

@Injectable()
export class DatabaseConnectorFactory {
  constructor(private readonly mySql: MySqlDatabaseConnector) {}

  get(type: DatasourceType): DatabaseConnector {
    if (type === DatasourceType.MySql) return this.mySql;
    throw new Error('Unsupported datasource type');
  }
}
