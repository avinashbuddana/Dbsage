import type { DataImportMode } from './enums/data-import-mode.enum';
import type { DataImportProcessingMode } from './enums/data-import-processing-mode.enum';
import type { DataImportStatus } from './enums/data-import-status.enum';

export interface CreateCsvImportInput {
  targetSchema: string;
  targetTable: string;
  delimiter: string;
  columnMapping: Record<string, string>;
  columnTypes: Record<string, string>;
  createTable: boolean;
  importMode: DataImportMode;
  dateFormat?: string;
  arrayDelimiter?: string;
}

export interface UploadedCsvFile {
  fileReference: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  fileHash: string;
}

export interface ImportProgress {
  processedBytes: number;
  fileSizeBytes: number;
  percent: number;
}

export interface DataImportResponse {
  id: string;
  originalFileName: string;
  fileSizeBytes: string;
  mimeType: string;
  targetSchema: string;
  targetTable: string;
  status: DataImportStatus;
  processingMode: DataImportProcessingMode;
  importMode: DataImportMode;
  delimiter: string;
  hasHeader: boolean;
  totalRows: string | null;
  processedRows: string;
  successfulRows: string;
  failedRows: string;
  processedBytes: string;
  progressPercent: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DataImportSummary {
  totalImports: string;
  completedImports: string;
  processingImports: string;
  failedImports: string;
  totalRowsImported: string;
}

export interface ImportClientConfiguration {
  maxFileSizeBytes: number;
  queueThresholdBytes: number;
  maxColumns: number;
  maxHeaderLength: number;
  allowedDelimiters: string[];
}
