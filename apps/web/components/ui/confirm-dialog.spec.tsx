import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  it('does not open the native dialog element when closed', () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Cancel this import?"
        description="The file will not be imported."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(container.querySelector('dialog')?.open).toBe(false);
  });

  it('opens the native dialog element when open', () => {
    const { container } = render(
      <ConfirmDialog
        open
        title="Cancel this import?"
        description="The file will not be imported."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(container.querySelector('dialog')?.open).toBe(true);
    expect(screen.getByText('Cancel this import?')).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="Cancel this import?"
        description="The file will not be imported."
        confirmLabel="Cancel Import"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel Import' }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel when the cancel button is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="Delete import history"
        description="This removes the SchemaIQ import record and retained source file where applicable. It does not delete data already imported into PostgreSQL."
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
