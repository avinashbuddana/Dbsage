import { DataImportStatus } from '@schemaiq/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ImportStatusBadge } from './import-status-badge';

describe('ImportStatusBadge', () => {
  it.each([
    [DataImportStatus.Uploaded, 'Uploaded'],
    [DataImportStatus.Validating, 'Validating'],
    [DataImportStatus.Queued, 'Waiting in Queue'],
    [DataImportStatus.Processing, 'Importing'],
    [DataImportStatus.Completed, 'Completed'],
    [DataImportStatus.Failed, 'Failed'],
    [DataImportStatus.Cancelled, 'Cancelled'],
  ])('renders a human label for %s', (status, label) => {
    render(<ImportStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('never conveys status through color alone — the label text is always present in the DOM', () => {
    render(<ImportStatusBadge status={DataImportStatus.Failed} />);
    const badge = screen.getByText('Failed');
    expect(badge.textContent).toBe('Failed');
  });
});
