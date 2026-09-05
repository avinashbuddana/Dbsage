import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useImportSchemasMock = vi.fn();
const useImportTablesMock = vi.fn();
const useImportTableDetailsMock = vi.fn();

vi.mock('../../lib/queries/imports-queries', () => ({
  useImportSchemas: (): unknown => useImportSchemasMock(),
  useImportTableDetails: (...args: unknown[]): unknown => useImportTableDetailsMock(...args),
  useImportTables: (...args: unknown[]): unknown => useImportTablesMock(...args),
}));

import { DestinationStep } from './destination-step';

describe('DestinationStep', () => {
  beforeEach(() => {
    useImportSchemasMock.mockReturnValue({ data: [{ name: 'public' }, { name: 'analytics' }] });
    useImportTablesMock.mockReturnValue({ data: [] });
    useImportTableDetailsMock.mockReturnValue({ data: undefined });
  });

  it('lists schemas and reports the selection', async () => {
    const onSchemaChange = vi.fn();
    const user = userEvent.setup();
    render(<DestinationStep schema={null} table={null} onSchemaChange={onSchemaChange} onTableChange={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('Schema'), 'public');

    expect(onSchemaChange).toHaveBeenCalledWith('public');
  });

  it('only shows the table select once a schema is chosen', () => {
    render(<DestinationStep schema={null} table={null} onSchemaChange={vi.fn()} onTableChange={vi.fn()} />);
    expect(screen.queryByLabelText('Table')).not.toBeInTheDocument();
  });

  it('shows column, required-field, and generated-field counts once details load', () => {
    useImportTablesMock.mockReturnValue({ data: [{ columnCount: 3, name: 'customers' }] });
    useImportTableDetailsMock.mockReturnValue({
      data: {
        columns: [
          { dataType: 'uuid', hasDefault: true, isGenerated: false, isIdentity: false, isNullable: false, name: 'id' },
          { dataType: 'text', hasDefault: false, isGenerated: false, isIdentity: false, isNullable: false, name: 'email' },
          { dataType: 'timestamptz', hasDefault: true, isGenerated: false, isIdentity: false, isNullable: true, name: 'created_at' },
        ],
        schema: 'public',
        table: 'customers',
      },
    });

    render(<DestinationStep schema="public" table="customers" onSchemaChange={vi.fn()} onTableChange={vi.fn()} />);

    expect(screen.getByText('public.customers')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('switches to a new-table-name input and reports the mode change', async () => {
    const onCreateTableChange = vi.fn();
    const onTableChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DestinationStep
        schema="public"
        table={null}
        createTable={false}
        onSchemaChange={vi.fn()}
        onTableChange={onTableChange}
        onCreateTableChange={onCreateTableChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create new table' }));

    expect(onCreateTableChange).toHaveBeenCalledWith(true);
    expect(onTableChange).toHaveBeenCalledWith(null);
  });

  it('shows a name input instead of the table select when creating a new table', () => {
    render(
      <DestinationStep
        schema="public"
        table={null}
        createTable
        onSchemaChange={vi.fn()}
        onTableChange={vi.fn()}
        onCreateTableChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('New table name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Table')).not.toBeInTheDocument();
  });

  it('warns when the new table name is not a safe identifier', () => {
    render(
      <DestinationStep
        schema="public"
        table="bad name"
        createTable
        onSchemaChange={vi.fn()}
        onTableChange={vi.fn()}
        onCreateTableChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/Use only letters, numbers, and underscores/)).toBeInTheDocument();
  });
});
