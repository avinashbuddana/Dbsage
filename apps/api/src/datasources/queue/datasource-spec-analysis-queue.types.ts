export const DATASOURCE_SPEC_ANALYSIS_QUEUE_NAME = 'schemaiq-datasource-spec-analysis';

export enum DatasourceSpecAnalysisQueueJobName {
  Analyze = 'analyze-specification',
}

export interface DatasourceSpecAnalysisQueuePayload {
  analysisId: string;
  organizationId: string;
}
