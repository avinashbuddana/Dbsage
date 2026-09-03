import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppConfigService } from '../config/app-config.service';
import { ConfigurationModule } from '../config/configuration.module';
import { createNestTypeOrmOptions } from './database.options';

// Internal SchemaIQ PostgreSQL only. Customer databases use future connector providers.
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigurationModule],
      inject: [AppConfigService],
      useFactory: createNestTypeOrmOptions,
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
