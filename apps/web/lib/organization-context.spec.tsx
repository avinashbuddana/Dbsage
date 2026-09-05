import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { OrganizationProvider, isValidOrganizationId, useOrganization } from './organization-context';

function TestConsumer() {
  const { organizationId, setOrganizationId } = useOrganization();
  return (
    <div>
      <span data-testid="org-id">{organizationId ?? 'none'}</span>
      <button
        onClick={() => {
          setOrganizationId('11111111-1111-4111-8111-111111111111');
        }}
      >
        set
      </button>
      <button
        onClick={() => {
          setOrganizationId(null);
        }}
      >
        clear
      </button>
    </div>
  );
}

describe('OrganizationProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts with no organization when nothing is stored', () => {
    render(
      <OrganizationProvider>
        <TestConsumer />
      </OrganizationProvider>,
    );
    expect(screen.getByTestId('org-id')).toHaveTextContent('none');
  });

  it('persists a set organization id to localStorage', async () => {
    const user = userEvent.setup();
    render(
      <OrganizationProvider>
        <TestConsumer />
      </OrganizationProvider>,
    );

    await user.click(screen.getByText('set'));

    expect(screen.getByTestId('org-id')).toHaveTextContent('11111111-1111-4111-8111-111111111111');
    expect(window.localStorage.getItem('schemaiq.organizationId')).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('restores a previously stored organization id on mount', () => {
    window.localStorage.setItem('schemaiq.organizationId', '22222222-2222-4222-8222-222222222222');

    render(
      <OrganizationProvider>
        <TestConsumer />
      </OrganizationProvider>,
    );

    expect(screen.getByTestId('org-id')).toHaveTextContent('22222222-2222-4222-8222-222222222222');
  });

  it('clears the stored organization id', async () => {
    window.localStorage.setItem('schemaiq.organizationId', '22222222-2222-4222-8222-222222222222');
    const user = userEvent.setup();
    render(
      <OrganizationProvider>
        <TestConsumer />
      </OrganizationProvider>,
    );

    await user.click(screen.getByText('clear'));

    expect(screen.getByTestId('org-id')).toHaveTextContent('none');
    expect(window.localStorage.getItem('schemaiq.organizationId')).toBeNull();
  });

  it('throws when useOrganization is used outside the provider', () => {
    const renderOutsideProvider = () => render(<TestConsumer />);
    expect(renderOutsideProvider).toThrow('useOrganization must be used within an OrganizationProvider');
  });
});

describe('isValidOrganizationId', () => {
  it('accepts a v4 UUID', () => {
    expect(isValidOrganizationId('11111111-1111-4111-8111-111111111111')).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    expect(isValidOrganizationId('not-a-uuid')).toBe(false);
  });
});
