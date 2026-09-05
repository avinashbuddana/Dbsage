import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ImportSummary } from './import-summary';

describe('ImportSummary', () => {
  it('renders the file, destination, mapping, and processing-mode summary', () => {
    render(
      <ImportSummary
        fileName="customers_2026.csv"
        fileSize="382.4 MB"
        schema="public"
        table="customers"
        matchedCount={18}
        ignoredCount={2}
        totalColumns={20}
        isLarge
        onBack={vi.fn()}
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText('customers_2026.csv')).toBeInTheDocument();
    expect(screen.getByText('382.4 MB')).toBeInTheDocument();
    expect(screen.getByText('public.customers')).toBeInTheDocument();
    expect(screen.getByText('20 CSV columns')).toBeInTheDocument();
    expect(screen.getByText('18 imported · 2 ignored')).toBeInTheDocument();
    expect(screen.getByText('Background import')).toBeInTheDocument();
  });

  it('describes immediate processing for a small file', () => {
    render(
      <ImportSummary
        fileName="small.csv"
        fileSize="4 KB"
        schema="public"
        table="customers"
        matchedCount={2}
        ignoredCount={0}
        totalColumns={2}
        isLarge={false}
        onBack={vi.fn()}
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText('Immediate import')).toBeInTheDocument();
  });

  it('calls onBack and onStart', async () => {
    const onBack = vi.fn();
    const onStart = vi.fn();
    const user = userEvent.setup();
    render(
      <ImportSummary
        fileName="small.csv"
        fileSize="4 KB"
        schema="public"
        table="customers"
        matchedCount={2}
        ignoredCount={0}
        totalColumns={2}
        isLarge={false}
        onBack={onBack}
        onStart={onStart}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Start Import' }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledOnce();
  });
});
