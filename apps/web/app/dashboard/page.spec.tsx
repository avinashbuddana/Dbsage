import { DataImportStatus } from '@schemaiq/types';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useImportsListMock = vi.fn();
vi.mock('../../lib/queries/imports-queries', () => ({
  useImportsList: (...args: unknown[]): unknown => useImportsListMock(...args),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { OrganizationProvider } from '../../lib/organization-context';
import DashboardOverviewPage from './page';

function renderPage() {
  return render(
    <OrganizationProvider>
      <DashboardOverviewPage />
    </OrganizationProvider>,
  );
}

describe('DashboardOverviewPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows a setup prompt when no organization is configured', () => {
    useImportsListMock.mockReturnValue({ data: undefined, isPending: true });
    renderPage();
    expect(screen.getByText(/Set your development organization ID/)).toBeInTheDocument();
  });

  it('lists recent imports with their status once data loads', () => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
    useImportsListMock.mockReturnValue({
      data: { items: [{ id: '1', originalFileName: 'customers.csv', status: DataImportStatus.Completed }], total: 1 },
      isPending: false,
    });
    renderPage();
    expect(screen.getByText('customers.csv')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('shows an empty message when there are no recent imports', () => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
    useImportsListMock.mockReturnValue({ data: { items: [], total: 0 }, isPending: false });
    renderPage();
    expect(screen.getByText('No imports yet.')).toBeInTheDocument();
  });
});
