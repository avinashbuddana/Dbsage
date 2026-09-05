import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const useImportsSummaryMock = vi.fn();
vi.mock('../../lib/queries/imports-queries', () => ({
  useImportsSummary: (): unknown => useImportsSummaryMock(),
}));

import { ImportsMetrics } from './imports-metrics';

describe('ImportsMetrics', () => {
  it('renders the real summary numbers from the backend, never fabricated ones', () => {
    useImportsSummaryMock.mockReturnValue({
      data: { completedImports: '110', failedImports: '14', processingImports: '4', totalImports: '128', totalRowsImported: '48210' },
      isPending: false,
    });
    render(<ImportsMetrics />);

    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('Total Imports')).toBeInTheDocument();
    expect(screen.getByText('48,210')).toBeInTheDocument();
    expect(screen.getByText('Total Rows Imported')).toBeInTheDocument();
  });

  it('shows loading skeletons while pending instead of a blank or fake metric', () => {
    useImportsSummaryMock.mockReturnValue({ data: undefined, isPending: true });
    const { container } = render(<ImportsMetrics />);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(screen.queryByText('Total Imports')).not.toBeInTheDocument();
  });
});
