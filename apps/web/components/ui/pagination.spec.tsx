import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Pagination, totalPages } from './pagination';

describe('totalPages', () => {
  it('computes the number of pages, minimum one', () => {
    expect(totalPages(0, 20)).toBe(1);
    expect(totalPages(45, 20)).toBe(3);
  });
});

describe('Pagination', () => {
  it('disables Previous on the first page and Next on the last page', () => {
    render(<Pagination page={1} limit={20} total={20} onPageChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('calls onPageChange with the next page number', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={1} limit={20} total={45} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('shows the current range', () => {
    render(<Pagination page={2} limit={20} total={45} onPageChange={vi.fn()} />);
    expect(screen.getByText('Showing 21-40 of 45')).toBeInTheDocument();
  });
});
