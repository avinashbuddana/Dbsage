import { DataImportProcessingMode, DataImportStatus } from '@schemaiq/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'import-1' }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import * as apiClient from '../../../../lib/api-client';
import { OrganizationProvider } from '../../../../lib/organization-context';
import ImportDetailPage from './page';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrganizationProvider>
        <ImportDetailPage />
      </OrganizationProvider>
    </QueryClientProvider>,
  );
}

const baseImport = {
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
  processedBytes: '0',
  processedRows: '0',
  processingMode: DataImportProcessingMode.Queued,
  progressPercent: 0,
  startedAt: null,
  status: DataImportStatus.Processing,
  successfulRows: '0',
  targetSchema: 'public',
  targetTable: 'customers',
  totalRows: null,
  updatedAt: '2026-09-05T09:45:00.000Z',
} as const;

describe('ImportDetailPage polling', () => {
  beforeEach(() => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('keeps polling roughly every 2.5s while non-terminal and stops once completed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const get = vi.spyOn(apiClient.importsApi, 'get').mockResolvedValue({ ...baseImport, status: DataImportStatus.Processing });

    renderPage();
    await vi.waitFor(() => {
      expect(get).toHaveBeenCalledTimes(1);
    });

    get.mockResolvedValue({ ...baseImport, progressPercent: 40, status: DataImportStatus.Processing });
    await vi.advanceTimersByTimeAsync(2_500);
    expect(get).toHaveBeenCalledTimes(2);

    get.mockResolvedValue({
      ...baseImport,
      completedAt: '2026-09-05T09:49:00.000Z',
      processedBytes: baseImport.fileSizeBytes,
      progressPercent: 100,
      startedAt: '2026-09-05T09:45:05.000Z',
      status: DataImportStatus.Completed,
      successfulRows: '2431994',
      totalRows: '2431994',
    });
    await vi.advanceTimersByTimeAsync(2_500);
    expect(get).toHaveBeenCalledTimes(3);
    await vi.waitFor(() => {
      expect(screen.getByText('Import completed')).toBeInTheDocument();
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(get).toHaveBeenCalledTimes(3);
  });
});
