import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import DataSourcesPage from './page';

const idleMutation = {
  isPending: false,
  mutateAsync: vi.fn(),
  variables: undefined,
};

vi.mock('../../../lib/queries/datasources-queries', () => ({
  useDatasources: () => ({
    data: [],
    error: null,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('../../../lib/queries/datasources-mutations', () => ({
  useCreateDatasource: () => idleMutation,
  useDeleteDatasource: () => idleMutation,
  useTestDatasourceCandidate: () => idleMutation,
  useTestSavedDatasource: () => idleMutation,
  useUpdateDatasourceStatus: () => idleMutation,
}));

describe('DataSourcesPage', () => {
  it('offers a real direct-MySQL connection workflow instead of a placeholder', () => {
    render(<DataSourcesPage />);

    expect(screen.getByRole('heading', { name: 'Connect MySQL' })).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^host/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save data source' })).toBeInTheDocument();
    expect(screen.getByText('No saved data sources')).toBeInTheDocument();
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });

  it('validates required connection fields before sending a test request', () => {
    render(<DataSourcesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));

    expect(screen.getByText('Complete all required connection fields before continuing.')).toBeInTheDocument();
    expect(idleMutation.mutateAsync).not.toHaveBeenCalled();
  });
});
