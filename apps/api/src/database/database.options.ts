import type { DataSourceOptions } from 'typeorm';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

import { AuditLogEntity } from '../audit/audit-log.entity';
import type { AppConfigService } from '../config/app-config.service';
import type { Environment } from '../config/environment';
import { DatasourceSecretEntity } from '../credentials/datasource-secret.entity';
import { DatasourceSshConfigEntity } from '../datasources/entities/datasource-ssh-config.entity';
import { DatasourceEntity } from '../datasources/entities/datasource.entity';
import { OrganizationMemberEntity } from '../organizations/organization-member.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { UserEntity } from '../users/user.entity';
import { InitialFoundation1725321600000 } from './migrations/1725321600000-initial-foundation';
import { SecureMysqlDatasources1788393600000 } from './migrations/1788393600000-secure-mysql-datasources';

const entities = [
  UserEntity,
  OrganizationEntity,
  OrganizationMemberEntity,
  AuditLogEntity,
  DatasourceEntity,
  DatasourceSshConfigEntity,
  DatasourceSecretEntity,
];
const migrations = [InitialFoundation1725321600000, SecureMysqlDatasources1788393600000];

interface InternalDatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  ssl: boolean;
}

function options(config: InternalDatabaseConfig): DataSourceOptions {
  return {
    type: 'postgres',
    host: config.host,
    port: config.port,
    database: config.name,
    username: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: true } : false,
    entities,
    migrations,
    migrationsRun: false,
    synchronize: false,
    logging: false,
    extra: { max: 10 },
  };
}

export function createNestTypeOrmOptions(config: AppConfigService): TypeOrmModuleOptions {
  return options(config.database);
}

export function createCliDataSourceOptions(environment: Environment): DataSourceOptions {
  return options({
    host: environment.DATABASE_HOST,
    port: environment.DATABASE_PORT,
    name: environment.DATABASE_NAME,
    user: environment.DATABASE_USER,
    password: environment.DATABASE_PASSWORD,
    ssl: environment.DATABASE_SSL,
  });
}
