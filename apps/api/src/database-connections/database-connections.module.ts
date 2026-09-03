import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CredentialsModule } from '../credentials/credentials.module';
import { DatabaseConnectorsModule } from '../database-connectors/database-connectors.module';
import { DatasourceSshConfigEntity } from '../datasources/entities/datasource-ssh-config.entity';
import { DatasourceEntity } from '../datasources/entities/datasource.entity';
import { NetworkModule } from '../network/network.module';
import { SshModule } from '../ssh/ssh.module';
import { DatabaseConnectionManager } from './database-connection.manager';
import { DatasourceConfigResolver } from './datasource-config.resolver';

@Module({
  imports: [
    TypeOrmModule.forFeature([DatasourceEntity, DatasourceSshConfigEntity]),
    CredentialsModule,
    DatabaseConnectorsModule,
    NetworkModule,
    SshModule,
  ],
  providers: [DatasourceConfigResolver, DatabaseConnectionManager],
  exports: [DatabaseConnectionManager],
})
export class DatabaseConnectionsModule {}
