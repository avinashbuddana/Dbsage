import { DataImportErrorCode } from '@schemaiq/types';
import { describe, expect, it } from 'vitest';

import { friendlyImportErrorMessage } from './error-copy';

describe('friendlyImportErrorMessage', () => {
  it('returns a specific message for each error code the backend actually produces', () => {
    expect(friendlyImportErrorMessage(DataImportErrorCode.ImportPostgresTypeError)).toContain("don't match the column types");
    expect(friendlyImportErrorMessage(DataImportErrorCode.ImportForeignKeyViolation)).toContain("don't exist in a related table");
    expect(friendlyImportErrorMessage(DataImportErrorCode.ImportDuplicateValue)).toContain('duplicate an existing unique value');
    expect(friendlyImportErrorMessage(DataImportErrorCode.ImportConstraintViolation)).toContain('missing or invalid');
    expect(friendlyImportErrorMessage(DataImportErrorCode.ImportTimeout)).toContain('took too long');
  });

  it('falls back to a generic safe message for IMPORT_COPY_FAILED and any other code', () => {
    expect(friendlyImportErrorMessage(DataImportErrorCode.ImportCopyFailed)).toBe(
      "The import couldn't be completed safely. No partial data was written.",
    );
    expect(friendlyImportErrorMessage(DataImportErrorCode.CsvFileTooLarge)).toBe(
      "The import couldn't be completed safely. No partial data was written.",
    );
  });

  it('falls back to the generic message when there is no error code', () => {
    expect(friendlyImportErrorMessage(null)).toBe("The import couldn't be completed safely. No partial data was written.");
  });
});
