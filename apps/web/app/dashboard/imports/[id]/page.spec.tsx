import { DataImportProcessingMode, DataImportStatus } from '@schemaiq/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'import-1' }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const useImportMock = vi.fn();
const retryMutate = vi.fn();
const cancelMutate = vi.fn();
vi.mock('../../../../lib/queries/imports-queries', () => ({
  useImport: (...args: unknown[]): unknown => useImportMock(...args),
}));
vi.mock('../../../../lib/queries/imports-mutations', () => ({
  useCancelImport: (): unknown => ({ isPending: false, mutate: cancelMutate }),
  useRetryImport: (): unknown => ({ isPending: false, mutate: retryMutate }),
}));

import ImportDetailPage from './page';

const base = {
  completedAt: null,
  createdAt: '2026-09-05T09:45:00.000Z',
  delimiter: ',',
  errorCode: null,
  errorMessage: null,
  failedRows: '0',
  fileSizeBytes: '4080218931',
  hasHeader: true,
  id: 'import-1',
  mimeType: 'text/csv',
  originalFileName: 'customers_2026.csv',
  processedBytes: '3006477107',
  processedRows: '36400000',
  processingMode: DataImportProcessingMode.Queued,
  progressPercent: 74,
  startedAt: '2026-09-05T09:45:05.000Z',
  status: DataImportStatus.Processing,
  successfulRows: '0',
  targetSchema: 'public',
  targetTable: 'customers',
  totalRows: '49180000',
  updatedAt: '2026-09-05T09:45:00.000Z',
} as const;

describe('ImportDetailPage per-status rendering', () => {
  beforeEach(() => {
    retryMutate.mockClear();
    cancelMutate.mockClear();
  });

  it('shows a loading skeleton while pending', () => {
    useImportMock.mockReturnValue({ data: undefined, isError: false, isPending: true });
    const { container } = render(<ImportDetailPage />);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('shows a friendly message when the import cannot be loaded', () => {
    useImportMock.mockReturnValue({ data: undefined, isError: true, isPending: false });
    render(<ImportDetailPage />);
    expect(screen.getByText(/couldn't load this import/)).toBeInTheDocument();
  });

  it('shows the queued state with no fabricated percentage and a working Cancel Import action', async () => {
    useImportMock.mockReturnValue({
      data: { ...base, progressPercent: 0, status: DataImportStatus.Queued },
      isError: false,
      isPending: false,
    });
    const user = userEvent.setup();
    render(<ImportDetailPage />);

    expect(screen.getByText('Waiting in queue')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel Import' }));
    const confirmButtons = screen.getAllByRole('button', { name: 'Cancel Import' });
    const dialogConfirmButton = confirmButtons[confirmButtons.length - 1];
    if (!dialogConfirmButton) throw new Error('Expected the dialog confirm button to be rendered');
    await user.click(dialogConfirmButton);

    expect(cancelMutate).toHaveBeenCalledWith('import-1');
  });

  it('shows the validating state', () => {
    useImportMock.mockReturnValue({ data: { ...base, status: DataImportStatus.Validating }, isError: false, isPending: false });
    render(<ImportDetailPage />);
    expect(screen.getByText('Checking your CSV')).toBeInTheDocument();
  });

  it('shows real progress, byte counts, and row counts while processing', () => {
    useImportMock.mockReturnValue({ data: base, isError: false, isPending: false });
    render(<ImportDetailPage />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '74');
    expect(screen.getByText('36,400,000 rows processed')).toBeInTheDocument();
  });

  it('shows the completed summary with real numbers', () => {
    useImportMock.mockReturnValue({
      data: {
        ...base,
        completedAt: '2026-09-05T09:49:00.000Z',
        processedBytes: base.fileSizeBytes,
        progressPercent: 100,
        status: DataImportStatus.Completed,
        successfulRows: '2431994',
      },
      isError: false,
      isPending: false,
    });
    render(<ImportDetailPage />);

    expect(screen.getByText('Import completed')).toBeInTheDocument();
    expect(screen.getByText('2,431,994')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Import Another File' })).toBeInTheDocument();
  });

  it('shows the ErrorPanel and a working Retry action when failed, with no Review Mapping action', async () => {
    useImportMock.mockReturnValue({
      data: {
        ...base,
        errorCode: 'IMPORT_POSTGRES_TYPE_ERROR',
        errorMessage: 'CSV values do not match the target column types',
        status: DataImportStatus.Failed,
      },
      isError: false,
      isPending: false,
    });
    const user = userEvent.setup();
    render(<ImportDetailPage />);

    expect(screen.getByText('Import could not be completed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review Mapping' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry Import' }));
    expect(retryMutate).toHaveBeenCalledWith('import-1');
  });

  it('shows a plain cancelled state', () => {
    useImportMock.mockReturnValue({ data: { ...base, status: DataImportStatus.Cancelled }, isError: false, isPending: false });
    render(<ImportDetailPage />);
    expect(screen.getByText('Import cancelled')).toBeInTheDocument();
  });
});
