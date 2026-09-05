import { DataImportStatus } from './enums/data-import-status.enum';
import { canTransitionDataImportStatus } from './import-status';

describe('data import status transitions', () => {
  it('allows the normal queued lifecycle', () => {
    expect(canTransitionDataImportStatus(DataImportStatus.Queued, DataImportStatus.Processing)).toBe(
      true,
    );
    expect(
      canTransitionDataImportStatus(DataImportStatus.Processing, DataImportStatus.Completed),
    ).toBe(true);
  });

  it('does not allow completed imports to be processed again', () => {
    expect(
      canTransitionDataImportStatus(DataImportStatus.Completed, DataImportStatus.Processing),
    ).toBe(false);
  });

  it('allows retrying a cancelled import', () => {
    expect(canTransitionDataImportStatus(DataImportStatus.Cancelled, DataImportStatus.Queued)).toBe(true);
  });
});
