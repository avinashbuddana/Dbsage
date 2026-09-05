import { DataImportProcessingMode, DataImportStatus, type DataImportApiResponse } from '@schemaiq/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useImportsListMock = vi.fn();
const retryMutate = vi.fn();
const cancelMutate = vi.fn();
const removeMutate = vi.fn();

vi.mock('../../lib/queries/imports-queries', () => ({
  useImportsList: (...args: unknown[]): unknown => useImportsListMock(...args),
}));
vi.mock('../../lib/queries/imports-mutations', () => ({
  useCancelImport: (): unknown => ({ isPending: false, mutate: cancelMutate }),
  useDeleteImport: (): unknown => ({ isPending: false, mutate: removeMutate }),
  useRetryImport: (): unknown => ({ isPending: false, mutate: retryMutate }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { ImportsHistoryTable } from './imports-history-table';

const failedImport: DataImportApiResponse = {
  completedAt: '2026-09-05T09:50:00.000Z',
  createdAt: '2026-09-05T09:45:00.000Z',
  delimiter: ',',
  errorCode: 'IMPORT_POSTGRES_TYPE_ERROR' as never,
  errorMessage: 'CSV values do not match the target column types',
  failedRows: '1',
  fileSizeBytes: '2048',
  hasHeader: true,
  id: 'import-failed',
  mimeType: 'text/csv',
  originalFileName: 'bad-ages.csv',
  processedBytes: '2048',
  processedRows: '10',
  processingMode: DataImportProcessingMode.Synchronous,
  progressPercent: 100,
  startedAt: '2026-09-05T09:45:05.000Z',
  status: DataImportStatus.Failed,
  successfulRows: '9',
  targetSchema: 'public',
  targetTable: 'customers',
  totalRows: '10',
  updatedAt: '2026-09-05T09:50:00.000Z',
};

describe('ImportsHistoryTable', () => {
  beforeEach(() => {
    retryMutate.mockClear();
    cancelMutate.mockClear();
    removeMutate.mockClear();
  });

  it('shows a Retry action for a failed import and calls the mutation with its id', async () => {
    useImportsListMock.mockReturnValue({ data: { items: [failedImport], total: 1 } });
    const user = userEvent.setup();
    render(<ImportsHistoryTable />);

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(retryMutate).toHaveBeenCalledWith('import-failed');
  });

  it('shows the required delete-history warning wording before deleting, and calls the mutation on confirm', async () => {
    useImportsListMock.mockReturnValue({ data: { items: [failedImport], total: 1 } });
    const user = userEvent.setup();
    render(<ImportsHistoryTable />);

    await user.click(screen.getByRole('button', { name: /Delete history for bad-ages.csv/ }));

    expect(
      screen.getByText(
        'This removes the SchemaIQ import record and retained source file where applicable. It does not delete data already imported into PostgreSQL.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(removeMutate).toHaveBeenCalledWith('import-failed');
  });

  it('forwards the search input to the list query and resets to page 1', async () => {
    useImportsListMock.mockReturnValue({ data: { items: [], total: 0 } });
    const user = userEvent.setup();
    render(<ImportsHistoryTable />);

    await user.type(screen.getByLabelText('Search by filename'), 'customers');

    expect(useImportsListMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, search: 'customers' }));
  });

  it('forwards the status filter to the list query', async () => {
    useImportsListMock.mockReturnValue({ data: { items: [], total: 0 } });
    const user = userEvent.setup();
    render(<ImportsHistoryTable />);

    await user.selectOptions(screen.getByLabelText('Filter by status'), DataImportStatus.Failed);

    expect(useImportsListMock).toHaveBeenLastCalledWith(expect.objectContaining({ status: DataImportStatus.Failed }));
  });
});
