import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTable, type DataTableColumn } from './data-table';

interface Row {
  id: string;
  name: string;
}

const columns: DataTableColumn<Row>[] = [{ header: 'Name', key: 'name', render: (row) => row.name }];

describe('DataTable', () => {
  it('renders a header and a row per item', () => {
    render(<DataTable columns={columns} rows={[{ id: '1', name: 'customers.csv' }]} getRowKey={(row) => row.id} />);

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('customers.csv')).toBeInTheDocument();
  });

  it('renders the empty message when there are no rows', () => {
    render(<DataTable columns={columns} rows={[]} getRowKey={(row) => row.id} emptyMessage="No imports yet." />);

    expect(screen.getByText('No imports yet.')).toBeInTheDocument();
  });
});
