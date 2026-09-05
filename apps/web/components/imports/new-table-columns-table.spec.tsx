import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NewTableColumnsTable } from './new-table-columns-table';

describe('NewTableColumnsTable', () => {
  it('renders each CSV header with its sample, editable column name, and database type', () => {
    render(
      <NewTableColumnsTable
        mapping={[
          { csvHeader: 'Full Name', sample: 'Ada Lovelace', targetColumn: 'full_name', dataType: 'text' },
          { csvHeader: 'E-mail', sample: 'ada@example.com', targetColumn: 'e_mail', dataType: 'text' },
        ]}
        onChange={vi.fn()}
        onTypeChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Full Name')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByLabelText('New column name for Full Name')).toHaveValue('full_name');
    expect(screen.getByLabelText('Database type for Full Name')).toHaveValue('text');
  });

  it('reports edits to the column name', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <NewTableColumnsTable
        mapping={[{ csvHeader: 'Full Name', sample: 'Ada Lovelace', targetColumn: 'full_name' }]}
        onChange={onChange}
        onTypeChange={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('New column name for Full Name'), 'x');

    expect(onChange).toHaveBeenCalledWith(0, 'full_namex');
  });

  it('reports a database type change and defaults to text when unset', async () => {
    const onTypeChange = vi.fn();
    const user = userEvent.setup();
    render(
      <NewTableColumnsTable
        mapping={[{ csvHeader: 'Created At', sample: '2026-01-01', targetColumn: 'created_at' }]}
        onChange={vi.fn()}
        onTypeChange={onTypeChange}
      />,
    );

    expect(screen.getByLabelText('Database type for Created At')).toHaveValue('text');

    await user.selectOptions(screen.getByLabelText('Database type for Created At'), 'timestamp');

    expect(onTypeChange).toHaveBeenCalledWith(0, 'timestamp');
  });

  it('flags a column name with invalid characters', () => {
    render(
      <NewTableColumnsTable
        mapping={[{ csvHeader: 'Full Name', sample: 'Ada Lovelace', targetColumn: 'full name' }]}
        onChange={vi.fn()}
        onTypeChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Use only letters, numbers, and underscores.')).toBeInTheDocument();
  });

  it('flags duplicate column names', () => {
    render(
      <NewTableColumnsTable
        mapping={[
          { csvHeader: 'First', sample: 'Ada', targetColumn: 'name' },
          { csvHeader: 'Second', sample: 'Lovelace', targetColumn: 'name' },
        ]}
        onChange={vi.fn()}
        onTypeChange={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Column names must be unique.')).toHaveLength(2);
  });
});
