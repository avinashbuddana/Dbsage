'use client';

import { useState, type ReactNode } from 'react';

import { Header } from './header';
import { Sidebar } from './sidebar';

export function DashboardShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => {
          setMobileOpen(false);
        }}
      />
      <div className="flex flex-1 flex-col lg:pl-64">
        <Header
          onMenuClick={() => {
            setMobileOpen(true);
          }}
        />
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
