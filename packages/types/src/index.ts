export interface HealthResponse {
  status: 'ok';
  service: 'schemaiq-api';
}

export interface ReadinessResponse extends HealthResponse {
  checks: {
    postgres: 'up';
    redis: 'up';
  };
}

export enum DataImportStatus {
  Uploaded = 'UPLOADED',
  Validating = 'VALIDATING',
  Queued = 'QUEUED',
  Processing = 'PROCESSING',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
  Cancelled = 'CANCELLED',
}

export enum DataImportProcessingMode {
  Synchronous = 'SYNCHRONOUS',
  Queued = 'QUEUED',
}

export enum DataImportErrorCode {
  CsvFileTooLarge = 'CSV_FILE_TOO_LARGE',
  CsvHeaderInvalid = 'CSV_HEADER_INVALID',
  CsvInvalidFormat = 'CSV_INVALID_FORMAT',
  CsvColumnMappingInvalid = 'CSV_COLUMN_MAPPING_INVALID',
  ImportCopyFailed = 'IMPORT_COPY_FAILED',
  ImportFileNotFound = 'IMPORT_FILE_NOT_FOUND',
  ImportPostgresTypeError = 'IMPORT_POSTGRES_TYPE_ERROR',
  ImportConstraintViolation = 'IMPORT_CONSTRAINT_VIOLATION',
  ImportDuplicateValue = 'IMPORT_DUPLICATE_VALUE',
  ImportForeignKeyViolation = 'IMPORT_FOREIGN_KEY_VIOLATION',
  ImportTargetNotAllowed = 'IMPORT_TARGET_NOT_ALLOWED',
  ImportTimeout = 'IMPORT_TIMEOUT',
  ImportInternalError = 'IMPORT_INTERNAL_ERROR',
}

export interface DataImportApiResponse {
  id: string;
  originalFileName: string;
  fileSizeBytes: string;
  mimeType: string;
  targetSchema: string;
  targetTable: string;
  status: DataImportStatus;
  processingMode: DataImportProcessingMode;
  delimiter: string;
  hasHeader: boolean;
  totalRows: string | null;
  processedRows: string;
  successfulRows: string;
  failedRows: string;
  processedBytes: string;
  progressPercent: number;
  errorCode: DataImportErrorCode | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedDataImportsResponse {
  items: DataImportApiResponse[];
  total: number;
}

export interface DataImportSummaryResponse {
  totalImports: string;
  completedImports: string;
  processingImports: string;
  failedImports: string;
  totalRowsImported: string;
}

export interface ImportClientConfigurationResponse {
  maxFileSizeBytes: number;
  queueThresholdBytes: number;
  maxColumns: number;
  maxHeaderLength: number;
  allowedDelimiters: string[];
}

export interface ImportTargetSchemaResponse {
  name: string;
}

export interface ImportTargetTableResponse {
  name: string;
  columnCount: number;
}

export interface ImportTargetColumnResponse {
  name: string;
  dataType: string;
  isNullable: boolean;
  hasDefault: boolean;
  isGenerated: boolean;
  isIdentity: boolean;
}

export interface ImportTargetDetailsResponse {
  schema: string;
  table: string;
  columns: ImportTargetColumnResponse[];
}
