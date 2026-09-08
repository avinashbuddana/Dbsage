import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LlmModule } from '../../llm/llm.module';
import { DatasourceEntity } from '../entities/datasource.entity';
import { DatabaseKnowledgeEntity } from '../knowledge/entities/database-knowledge.entity';
import { DatasourceKnowledgeVersionEntity } from '../knowledge/entities/datasource-knowledge-version.entity';
import { DatasourceSchemaSnapshotEntity } from '../knowledge/entities/datasource-schema-snapshot.entity';
import { KnowledgeChunkEntity } from '../knowledge/entities/knowledge-chunk.entity';
import { SpecificationDatabaseFindingEntity } from '../knowledge/entities/specification-database-finding.entity';
import { EmbeddingService } from '../knowledge/embedding.service';
import { EMBEDDING_PROVIDER } from '../knowledge/embedding-provider.interface';
import { OllamaEmbeddingProvider } from '../knowledge/ollama-embedding.provider';
import { CompatibilityFindingRetrievalService } from './compatibility-finding-retrieval.service';
import { ContextBudgetService } from './context-budget.service';
import { ContextDeduplicationService } from './context-deduplication.service';
import { ContextRerankingService } from './context-reranking.service';
import { DatabaseAnalyzerService } from './database-analyzer.service';
import { DatabaseContextRequestAnalyzer } from './database-context-request-analyzer.service';
import { DatabaseContextService } from './database-context.service';
import { DatabaseMetadataRetrievalService } from './database-metadata-retrieval.service';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { RelationshipExpansionService } from './relationship-expansion.service';
import { VectorKnowledgeSearchService } from './vector-knowledge-search.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DatasourceEntity,
      DatasourceSchemaSnapshotEntity,
      DatasourceKnowledgeVersionEntity,
      DatabaseKnowledgeEntity,
      KnowledgeChunkEntity,
      SpecificationDatabaseFindingEntity,
    ]),
    LlmModule,
  ],
  providers: [
    CompatibilityFindingRetrievalService,
    ContextBudgetService,
    ContextDeduplicationService,
    ContextRerankingService,
    DatabaseAnalyzerService,
    DatabaseContextRequestAnalyzer,
    DatabaseContextService,
    DatabaseMetadataRetrievalService,
    OllamaEmbeddingProvider,
    { provide: EMBEDDING_PROVIDER, useExisting: OllamaEmbeddingProvider },
    EmbeddingService,
    KnowledgeRetrievalService,
    RelationshipExpansionService,
    VectorKnowledgeSearchService,
  ],
  exports: [DatabaseAnalyzerService, DatabaseContextService, EmbeddingService],
})
export class DatabaseContextModule {}
