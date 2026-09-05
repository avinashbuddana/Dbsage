import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { OrganizationProvider } from '../../lib/organization-context';
import { WorkspaceIndicator } from './workspace-indicator';

function renderIndicator() {
  return render(
    <OrganizationProvider>
      <WorkspaceIndicator />
    </OrganizationProvider>,
  );
}

describe('WorkspaceIndicator', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('prompts to set a workspace when none is configured', () => {
    renderIndicator();
    expect(screen.getByRole('button', { name: /Set workspace/ })).toBeInTheDocument();
  });

  it('rejects a non-UUID value and does not save it', async () => {
    const user = userEvent.setup();
    renderIndicator();
    await user.click(screen.getByRole('button', { name: /Set workspace/ }));
    await user.type(screen.getByLabelText('Organization ID'), 'not-a-uuid');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Enter a valid UUID.')).toBeInTheDocument();
    expect(window.localStorage.getItem('schemaiq.organizationId')).toBeNull();
  });

  it('saves a valid UUID and displays a truncated workspace label', async () => {
    const user = userEvent.setup();
    renderIndicator();
    await user.click(screen.getByRole('button', { name: /Set workspace/ }));
    await user.type(screen.getByLabelText('Organization ID'), '11111111-1111-4111-8111-111111111111');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('button', { name: /Workspace: 11111111/ })).toBeInTheDocument();
    expect(window.localStorage.getItem('schemaiq.organizationId')).toBe('11111111-1111-4111-8111-111111111111');
  });
});
