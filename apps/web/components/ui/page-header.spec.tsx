import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders the eyebrow, title, description, and action', () => {
    render(
      <PageHeader
        eyebrow="Data Management"
        title="CSV Data Imports"
        description="Import large CSV datasets into PostgreSQL."
        action={<button type="button">Import CSV</button>}
      />,
    );

    expect(screen.getByText('Data Management')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'CSV Data Imports' })).toBeInTheDocument();
    expect(screen.getByText('Import large CSV datasets into PostgreSQL.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import CSV' })).toBeInTheDocument();
  });

  it('renders without a description or action', () => {
    render(<PageHeader eyebrow="Database Operations" title="Overview" />);

    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
  });
});
