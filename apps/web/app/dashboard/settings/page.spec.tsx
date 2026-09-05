import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OrganizationProvider } from '../../../lib/organization-context';
import SettingsPage from './page';

describe('SettingsPage', () => {
  it('hosts the workspace organization-id control', () => {
    render(
      <OrganizationProvider>
        <SettingsPage />
      </OrganizationProvider>,
    );
    expect(screen.getByRole('button', { name: /Set workspace/ })).toBeInTheDocument();
  });
});
