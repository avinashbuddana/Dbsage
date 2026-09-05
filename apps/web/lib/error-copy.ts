import { DataImportErrorCode } from '@schemaiq/types';

const DEFAULT_ERROR_MESSAGE = "The import couldn't be completed safely. No partial data was written.";

const ERROR_COPY: Partial<Record<DataImportErrorCode, string>> = {
  [DataImportErrorCode.ImportPostgresTypeError]: "Some values in your CSV don't match the column types in the destination table.",
  [DataImportErrorCode.ImportForeignKeyViolation]: "Some values reference records that don't exist in a related table.",
  [DataImportErrorCode.ImportDuplicateValue]: 'Some values duplicate an existing unique value in the destination table.',
  [DataImportErrorCode.ImportConstraintViolation]: 'Some required values were missing or invalid for the destination table.',
  [DataImportErrorCode.ImportTimeout]: 'The import took too long and was stopped.',
};

export function friendlyImportErrorMessage(code: string | null): string {
  if (!code) return DEFAULT_ERROR_MESSAGE;
  return ERROR_COPY[code as DataImportErrorCode] ?? DEFAULT_ERROR_MESSAGE;
}
