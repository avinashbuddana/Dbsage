import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FileSummary } from './file-summary';

describe('FileSummary', () => {
  it('renders the file name and formatted size, and calls onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const file = new File(['a'.repeat(2048)], 'customers_2026.csv', { type: 'text/csv' });
    render(<FileSummary file={file} onChange={onChange} />);

    expect(screen.getByText('customers_2026.csv')).toBeInTheDocument();
    expect(screen.getByText(/2.0 KB/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Change' }));
    expect(onChange).toHaveBeenCalledOnce();
  });
});
