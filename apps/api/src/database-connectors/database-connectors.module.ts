import { Module } from '@nestjs/common';

import { DatabaseConnectorFactory } from './database-connector.factory';
import { MySqlDatabaseConnector } from './mysql-database.connector';

@Module({
  providers: [MySqlDatabaseConnector, DatabaseConnectorFactory],
  exports: [DatabaseConnectorFactory],
})
export class DatabaseConnectorsModule {}
