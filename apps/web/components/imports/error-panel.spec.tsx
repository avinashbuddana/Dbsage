import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ErrorPanel } from './error-panel';

describe('ErrorPanel', () => {
  it('shows a friendly message and keeps the raw code collapsed by default', () => {
    render(<ErrorPanel errorCode="IMPORT_POSTGRES_TYPE_ERROR" errorMessage="CSV values do not match the target column types" />);
    expect(screen.getByText(/don't match the column types/)).toBeInTheDocument();
    expect(screen.queryByText('IMPORT_POSTGRES_TYPE_ERROR')).not.toBeInTheDocument();
  });

  it('reveals the technical details on demand', async () => {
    const user = userEvent.setup();
    render(<ErrorPanel errorCode="IMPORT_POSTGRES_TYPE_ERROR" errorMessage="CSV values do not match the target column types" />);

    await user.click(screen.getByRole('button', { name: 'Technical details' }));

    expect(screen.getByText('IMPORT_POSTGRES_TYPE_ERROR')).toBeInTheDocument();
    expect(screen.getByText('CSV values do not match the target column types')).toBeInTheDocument();
  });

  it('falls back to the generic safe message when there is no error code', () => {
    render(<ErrorPanel errorCode={null} errorMessage={null} />);
    expect(screen.getByText("The import couldn't be completed safely. No partial data was written.")).toBeInTheDocument();
  });
});
