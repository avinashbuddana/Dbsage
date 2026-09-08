export const DATASOURCE_KNOWLEDGE_BUILD_QUEUE_NAME = 'schemaiq-datasource-knowledge-build';

export enum DatasourceKnowledgeBuildQueueJobName {
  Build = 'build-knowledge',
}

export interface DatasourceKnowledgeBuildQueuePayload {
  organizationId: string;
  datasourceId: string;
  specificationVersionId: string;
  schemaSnapshotId: string;
  compatibilityCheckId: string;
  knowledgeVersionId: string;
}
