import type { ImportTargetColumnResponse } from '@schemaiq/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ColumnMappingTable } from './column-mapping-table';

const targetColumns: ImportTargetColumnResponse[] = [
  { dataType: 'text', hasDefault: false, isGenerated: false, isIdentity: false, isNullable: false, name: 'email' },
  { dataType: 'text', hasDefault: false, isGenerated: false, isIdentity: false, isNullable: false, name: 'last_name' },
];

const mapping = [
  { csvHeader: 'email', sample: 'john@example.com', targetColumn: 'email' },
  { csvHeader: 'surname', sample: 'Smith', targetColumn: null },
];

describe('ColumnMappingTable', () => {
  it('shows Matched for an exact-name auto-mapped column and Unmapped for one with no target', () => {
    render(<ColumnMappingTable mapping={mapping} targetColumns={targetColumns} onChange={vi.fn()} />);
    expect(screen.getByText('Matched')).toBeInTheDocument();
    expect(screen.getByText('Unmapped')).toBeInTheDocument();
  });

  it('calls onChange with the row index and the newly selected target column', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColumnMappingTable mapping={mapping} targetColumns={targetColumns} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Target column for surname'), 'last_name');

    expect(onChange).toHaveBeenCalledWith(1, 'last_name');
  });

  it('calls onChange with null when Do not import is selected', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColumnMappingTable mapping={mapping} targetColumns={targetColumns} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Target column for email'), '');

    expect(onChange).toHaveBeenCalledWith(0, null);
  });
});
