export type DuplicateImportCode = 'DUPLICATE_IMPORT' | 'IMPORT_ALREADY_IN_PROGRESS';

export interface DuplicateImportPreviousImport {
  fileName: string;
  importedAt: Date;
  totalRows: string | null;
  successfulRows: string;
  failedRows: string;
}

export class DuplicateImportException extends Error {
  constructor(
    readonly code: DuplicateImportCode,
    message: string,
    readonly existingImportId: string,
    readonly fileHash: string,
    readonly previousImport?: DuplicateImportPreviousImport,
  ) {
    super(message);
    this.name = 'DuplicateImportException';
  }
}
