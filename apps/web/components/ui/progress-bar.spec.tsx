import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressBar } from './progress-bar';

describe('ProgressBar', () => {
  it('renders the given percent as aria-valuenow', () => {
    render(<ProgressBar percent={74} label="Importing data" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '74');
    expect(screen.getByText('Importing data')).toBeInTheDocument();
  });

  it('clamps values above 100 and below 0', () => {
    const { rerender } = render(<ProgressBar percent={140} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

    rerender(<ProgressBar percent={-10} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});
