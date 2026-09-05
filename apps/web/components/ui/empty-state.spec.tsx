import { render, screen } from '@testing-library/react';
import { UploadCloud } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders the title, description, and action', () => {
    render(
      <EmptyState
        icon={UploadCloud}
        title="Import your first dataset"
        description="Upload a CSV file and SchemaIQ will safely stream it into PostgreSQL."
        action={<button type="button">Import CSV</button>}
      />,
    );

    expect(screen.getByText('Import your first dataset')).toBeInTheDocument();
    expect(screen.getByText(/safely stream it into PostgreSQL/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import CSV' })).toBeInTheDocument();
  });
});
