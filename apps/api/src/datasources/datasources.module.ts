import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { DatabaseConnectionsModule } from '../database-connections/database-connections.module';
import { LlmModule } from '../llm/llm.module';
import { NetworkModule } from '../network/network.module';
import { DatabaseContextModule } from './context/database-context.module';
import { DatabaseQueryModule } from './query/database-query.module';
import { DatasourceSshConfigEntity } from './entities/datasource-ssh-config.entity';
import { DatasourceSpecAnalysisEntity } from './entities/datasource-spec-analysis.entity';
import { DatasourceEntity } from './entities/datasource.entity';
import { DatabaseKnowledgeEntity } from './knowledge/entities/database-knowledge.entity';
import { DatasourceKnowledgeVersionEntity } from './knowledge/entities/datasource-knowledge-version.entity';
import { DatasourceSchemaSnapshotEntity } from './knowledge/entities/datasource-schema-snapshot.entity';
import { DatasourceSpecificationEntity } from './knowledge/entities/datasource-specification.entity';
import { DatasourceSpecificationVersionEntity } from './knowledge/entities/datasource-specification-version.entity';
import { KnowledgeChunkEntity } from './knowledge/entities/knowledge-chunk.entity';
import { SpecificationCompatibilityCheckEntity } from './knowledge/entities/specification-compatibility-check.entity';
import { SpecificationDatabaseFindingEntity } from './knowledge/entities/specification-database-finding.entity';
import {
  SpecificationEntityMappingEntity,
  SpecificationFieldMappingEntity,
  SpecificationRelationshipMappingEntity,
} from './knowledge/entities/specification-mapping.entity';
import { DatasourceCompatibilityService } from './knowledge/datasource-compatibility.service';
import { DatasourceKnowledgeService } from './knowledge/datasource-knowledge.service';
import { DatasourceKnowledgeBuildQueueService } from './knowledge/queue/datasource-knowledge-build-queue.service';
import { DatasourceKnowledgeBuildWorkerService } from './knowledge/queue/datasource-knowledge-build-worker.service';
import { VerifiedKnowledgeBuilderService } from './knowledge/verified-knowledge-builder.service';
import { DatasourcesController } from './datasources.controller';
import { DatasourceAnalysisService } from './datasource-analysis.service';
import { DatasourceSpecAnalysisService } from './datasource-spec-analysis.service';
import { DatasourcesService } from './datasources.service';
import { DatasourceSpecAnalysisQueueService } from './queue/datasource-spec-analysis-queue.service';
import { DatasourceSpecAnalysisWorkerService } from './queue/datasource-spec-analysis-worker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DatasourceEntity,
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
    ]),
    AuditModule,
    AuthModule,
    CredentialsModule,
    DatabaseConnectionsModule,
    LlmModule,
    NetworkModule,
    DatabaseContextModule,
    DatabaseQueryModule,
  ],
  controllers: [DatasourcesController],
  providers: [
    DatasourceAnalysisService,
    DatasourceCompatibilityService,
    DatasourceKnowledgeService,
    DatasourceKnowledgeBuildQueueService,
    VerifiedKnowledgeBuilderService,
    DatasourceKnowledgeBuildWorkerService,
    DatasourceSpecAnalysisQueueService,
    DatasourceSpecAnalysisService,
    DatasourceSpecAnalysisWorkerService,
    DatasourcesService,
  ],
})
export class DatasourcesModule {}
