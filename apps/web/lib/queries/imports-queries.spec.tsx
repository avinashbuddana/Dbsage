import { DataImportProcessingMode, DataImportStatus } from '@schemaiq/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as apiClient from '../api-client';
import { OrganizationProvider } from '../organization-context';
import { useImport, useImportsList } from './imports-queries';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <OrganizationProvider>{children}</OrganizationProvider>
    </QueryClientProvider>
  );
}

const baseImport = {
  completedAt: null,
  createdAt: '2026-09-05T09:00:00.000Z',
  delimiter: ',',
  errorCode: null,
  errorMessage: null,
  failedRows: '0',
  fileSizeBytes: '9',
  hasHeader: true,
  id: 'import-1',
  mimeType: 'text/csv',
  originalFileName: 'customers.csv',
  processedBytes: '0',
  processedRows: '0',
  processingMode: DataImportProcessingMode.Synchronous,
  progressPercent: 0,
  startedAt: null,
  status: DataImportStatus.Processing,
  successfulRows: '0',
  targetSchema: 'public',
  targetTable: 'customers',
  totalRows: null,
  updatedAt: '2026-09-05T09:00:00.000Z',
};

describe('useImportsList', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('does not fetch until an organization is set', () => {
    const list = vi.spyOn(apiClient.importsApi, 'list');
    renderHook(() => useImportsList({ limit: 20, page: 1 }), { wrapper });
    expect(list).not.toHaveBeenCalled();
  });
});

describe('useImport polling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('keeps polling while the status is non-terminal', async () => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
    vi.spyOn(apiClient.importsApi, 'get').mockResolvedValue({ ...baseImport, status: DataImportStatus.Processing });

    const { result } = renderHook(() => useImport('import-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.data?.status).toBe(DataImportStatus.Processing);
    });
  });

  it('resolves once the status is terminal', async () => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
    vi.spyOn(apiClient.importsApi, 'get').mockResolvedValue({ ...baseImport, status: DataImportStatus.Completed });

    const { result } = renderHook(() => useImport('import-1'), { wrapper });

    await waitFor(() => {
      expect(result.current.data?.status).toBe(DataImportStatus.Completed);
    });
  });
});
