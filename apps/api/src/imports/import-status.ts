import { DataImportStatus } from './enums/data-import-status.enum';

const allowedTransitions: Readonly<Record<DataImportStatus, readonly DataImportStatus[]>> = {
  [DataImportStatus.Uploaded]: [DataImportStatus.Validating, DataImportStatus.Failed],
  [DataImportStatus.Validating]: [
    DataImportStatus.Queued,
    DataImportStatus.Processing,
    DataImportStatus.Failed,
  ],
  [DataImportStatus.Queued]: [DataImportStatus.Processing, DataImportStatus.Failed, DataImportStatus.Cancelled],
  [DataImportStatus.Processing]: [DataImportStatus.Completed, DataImportStatus.Failed],
  [DataImportStatus.Completed]: [],
  [DataImportStatus.Failed]: [DataImportStatus.Queued],
  [DataImportStatus.Cancelled]: [DataImportStatus.Queued],
};

export function canTransitionDataImportStatus(
  from: DataImportStatus,
  to: DataImportStatus,
): boolean {
  return allowedTransitions[from].includes(to);
}
