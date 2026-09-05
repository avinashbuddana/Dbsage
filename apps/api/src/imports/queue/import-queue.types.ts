export const IMPORT_QUEUE_NAME = 'schemaiq-data-import';

export enum ImportQueueJobName {
  Process = 'process-csv-import',
}

export interface ImportQueuePayload {
  importId: string;
  organizationId: string;
}
