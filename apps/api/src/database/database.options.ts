import type { DataSourceOptions } from 'typeorm';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

import { AuditLogEntity } from '../audit/audit-log.entity';
import type { AppConfigService } from '../config/app-config.service';
import type { Environment } from '../config/environment';
import { DatasourceSecretEntity } from '../credentials/datasource-secret.entity';
import { DatasourceSshConfigEntity } from '../datasources/entities/datasource-ssh-config.entity';
import { DatasourceSpecAnalysisEntity } from '../datasources/entities/datasource-spec-analysis.entity';
import { DatasourceEntity } from '../datasources/entities/datasource.entity';
import { GeneratedQueryEntity } from '../datasources/query/generated-query.entity';
import { DatabaseKnowledgeEntity } from '../datasources/knowledge/entities/database-knowledge.entity';
import { DatasourceKnowledgeVersionEntity } from '../datasources/knowledge/entities/datasource-knowledge-version.entity';
import { DatasourceSchemaSnapshotEntity } from '../datasources/knowledge/entities/datasource-schema-snapshot.entity';
import { DatasourceSpecificationEntity } from '../datasources/knowledge/entities/datasource-specification.entity';
import { DatasourceSpecificationVersionEntity } from '../datasources/knowledge/entities/datasource-specification-version.entity';
import { KnowledgeChunkEntity } from '../datasources/knowledge/entities/knowledge-chunk.entity';
import { SpecificationCompatibilityCheckEntity } from '../datasources/knowledge/entities/specification-compatibility-check.entity';
import { SpecificationDatabaseFindingEntity } from '../datasources/knowledge/entities/specification-database-finding.entity';
import {
  SpecificationEntityMappingEntity,
  SpecificationFieldMappingEntity,
  SpecificationRelationshipMappingEntity,
} from '../datasources/knowledge/entities/specification-mapping.entity';
import { DataImportErrorEntity } from '../imports/entities/data-import-error.entity';
import { DataImportEntity } from '../imports/entities/data-import.entity';
import { LlmUsageEntity } from '../llm/entities/llm-usage.entity';
import { OrganizationMemberEntity } from '../organizations/organization-member.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { UserEntity } from '../users/user.entity';
import { InitialFoundation1725321600000 } from './migrations/1725321600000-initial-foundation';
import { SecureMysqlDatasources1788393600000 } from './migrations/1788393600000-secure-mysql-datasources';
import { PostgreSqlCsvImports1788480000000 } from './migrations/1788480000000-postgresql-csv-imports';
import { CsvImportDuplicateProtection1788500000000 } from './migrations/1788500000000-csv-import-duplicate-protection';
import { CsvImportUpdatedAtTrigger1788510000000 } from './migrations/1788510000000-csv-import-updated-at-trigger';
import { CsvImportPartiallyCompletedStatus1788520000000 } from './migrations/1788520000000-csv-import-partially-completed-status';
import { CsvImportTransformationEngine1788530000000 } from './migrations/1788530000000-csv-import-transformation-engine';
import { LlmUsage1788540000000 } from './migrations/1788540000000-llm-usage';
import { DatasourceSpecAnalyses1788550000000 } from './migrations/1788550000000-datasource-spec-analyses';
import { DatasourceSpecAnalysisReport1788560000000 } from './migrations/1788560000000-datasource-spec-analysis-report';
import { VerifiedDatasourceKnowledge1788570000000 } from './migrations/1788570000000-verified-datasource-knowledge';
import { DatabaseContextVectorIndex1788580000000 } from './migrations/1788580000000-database-context-vector-index';
import { GeneratedQueries1788590000000 } from './migrations/1788590000000-generated-queries';

const entities = [
  UserEntity,
  OrganizationEntity,
  OrganizationMemberEntity,
  AuditLogEntity,
  DatasourceEntity,
  GeneratedQueryEntity,
  DatasourceSshConfigEntity,
  DatasourceSpecAnalysisEntity,
  DatasourceSpecificationEntity,
  DatasourceSpecificationVersionEntity,
  DatasourceSchemaSnapshotEntity,
  SpecificationCompatibilityCheckEntity,
  SpecificationDatabaseFindingEntity,
  SpecificationEntityMappingEntity,
  SpecificationFieldMappingEntity,
  SpecificationRelationshipMappingEntity,
  DatasourceKnowledgeVersionEntity,
  DatabaseKnowledgeEntity,
  KnowledgeChunkEntity,
  DatasourceSecretEntity,
  DataImportEntity,
  DataImportErrorEntity,
  LlmUsageEntity,
];
const migrations = [
  InitialFoundation1725321600000,
  SecureMysqlDatasources1788393600000,
  PostgreSqlCsvImports1788480000000,
  CsvImportDuplicateProtection1788500000000,
  CsvImportUpdatedAtTrigger1788510000000,
  CsvImportPartiallyCompletedStatus1788520000000,
  CsvImportTransformationEngine1788530000000,
  LlmUsage1788540000000,
  DatasourceSpecAnalyses1788550000000,
  DatasourceSpecAnalysisReport1788560000000,
  VerifiedDatasourceKnowledge1788570000000,
  DatabaseContextVectorIndex1788580000000,
  GeneratedQueries1788590000000,
];

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
