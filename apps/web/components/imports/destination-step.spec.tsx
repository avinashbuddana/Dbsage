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
});
