import { DataImportStatus } from '@schemaiq/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as apiClient from '../api-client';
import { OrganizationProvider } from '../organization-context';
import { useCancelImport, useRetryImport } from './imports-mutations';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <OrganizationProvider>{children}</OrganizationProvider>
    </QueryClientProvider>
  );
}

describe('useRetryImport', () => {
  beforeEach(() => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('calls importsApi.retry with the current organization and import id', async () => {
    const retry = vi.spyOn(apiClient.importsApi, 'retry').mockResolvedValue({ status: DataImportStatus.Queued } as never);
    const { result } = renderHook(() => useRetryImport(), { wrapper });

    result.current.mutate('import-1');

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(retry).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'import-1');
  });
});

describe('useCancelImport', () => {
  beforeEach(() => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('calls importsApi.cancel with the current organization and import id', async () => {
    const cancel = vi.spyOn(apiClient.importsApi, 'cancel').mockResolvedValue({ status: DataImportStatus.Cancelled } as never);
    const { result } = renderHook(() => useCancelImport(), { wrapper });

    result.current.mutate('import-1');

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(cancel).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'import-1');
  });
});
