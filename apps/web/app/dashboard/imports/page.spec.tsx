import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useImportsListMock = vi.fn();
vi.mock('../../../lib/queries/imports-queries', () => ({
  useImportsList: (...args: unknown[]): unknown => useImportsListMock(...args),
}));
vi.mock('../../../components/imports/imports-metrics', () => ({ ImportsMetrics: () => <div>metrics</div> }));
vi.mock('../../../components/imports/imports-history-table', () => ({ ImportsHistoryTable: () => <div>history</div> }));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { OrganizationProvider } from '../../../lib/organization-context';
import ImportsOverviewPage from './page';

function renderPage() {
  return render(
    <OrganizationProvider>
      <ImportsOverviewPage />
    </OrganizationProvider>,
  );
}

describe('ImportsOverviewPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('prompts for a workspace before checking for imports', () => {
    useImportsListMock.mockReturnValue({ data: undefined });
    renderPage();
    expect(screen.getByText(/Set your development organization ID/)).toBeInTheDocument();
  });

  it('shows the first-import empty state only when the organization truly has none', () => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
    useImportsListMock.mockReturnValue({ data: { items: [], total: 0 } });
    renderPage();
    expect(screen.getByText('Import your first dataset')).toBeInTheDocument();
  });

  it('shows metrics and history once at least one import exists', () => {
    window.localStorage.setItem('schemaiq.organizationId', '11111111-1111-4111-8111-111111111111');
    useImportsListMock.mockReturnValue({ data: { items: [{}], total: 1 } });
    renderPage();
    expect(screen.getByText('metrics')).toBeInTheDocument();
    expect(screen.getByText('history')).toBeInTheDocument();
  });
});
