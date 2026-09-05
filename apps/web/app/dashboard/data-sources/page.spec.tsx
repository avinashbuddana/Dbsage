import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DataSourcesPage from './page';

describe('DataSourcesPage', () => {
  it('clearly marks the feature as coming soon rather than showing a fake working UI', () => {
    render(<DataSourcesPage />);
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add data source/i })).not.toBeInTheDocument();
  });
});
