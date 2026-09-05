'use client';

import { Menu } from 'lucide-react';

import { WorkspaceIndicator } from './workspace-indicator';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-10">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="flex-1" />
      <WorkspaceIndicator />
    </header>
  );
}
