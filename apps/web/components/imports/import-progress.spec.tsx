import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ImportProgress } from './import-progress';

describe('ImportProgress', () => {
  it('shows the progress bar and processed/total bytes', () => {
    render(
      <ImportProgress percent={74} processedBytes="3006477107" fileSizeBytes="4080218931" processedRows="36400000" totalRows="49180000" />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '74');
    expect(screen.getByText(/2.8 GB \/ 3.8 GB processed/)).toBeInTheDocument();
    expect(screen.getByText('36,400,000 rows processed')).toBeInTheDocument();
  });

  it('does not fabricate a row count when totalRows is unknown', () => {
    render(<ImportProgress percent={40} processedBytes="1000" fileSizeBytes="5000" processedRows={null} totalRows={null} />);
    expect(screen.queryByText(/rows processed/)).not.toBeInTheDocument();
  });
});
