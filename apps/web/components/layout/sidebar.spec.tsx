import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/imports' }));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { Sidebar } from './sidebar';

describe('Sidebar', () => {
  it('renders every primary nav item and marks the active one', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);

    expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Data Sources').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Data Imports').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
    const importsLinks = screen.getAllByText('Data Imports').map((node) => node.closest('a'));
    expect(importsLinks[0]).toHaveClass('bg-blue-50');
  });

  it('links Data Sources to the live connection workflow', () => {
    render(<Sidebar mobileOpen={false} onClose={vi.fn()} />);
    expect(screen.getByText('Data Sources').closest('a')).toHaveAttribute('href', '/dashboard/data-sources');
  });
});
