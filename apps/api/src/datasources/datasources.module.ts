import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { DatabaseConnectionsModule } from '../database-connections/database-connections.module';
import { NetworkModule } from '../network/network.module';
import { DatasourceSshConfigEntity } from './entities/datasource-ssh-config.entity';
import { DatasourceEntity } from './entities/datasource.entity';
import { DatasourcesController } from './datasources.controller';
import { DatasourcesService } from './datasources.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DatasourceEntity, DatasourceSshConfigEntity]),
    AuditModule,
    AuthModule,
    CredentialsModule,
    DatabaseConnectionsModule,
    NetworkModule,
  ],
  controllers: [DatasourcesController],
  providers: [DatasourcesService],
})
export class DatasourcesModule {}
