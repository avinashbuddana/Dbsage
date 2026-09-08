'use client';

import { PRODUCT_NAME } from '@schemaiq/shared';
import { Database, LayoutDashboard, Settings, UploadCloud, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
  { href: '/dashboard/data-sources', icon: Database, label: 'Data Sources' },
  { href: '/dashboard/imports', icon: UploadCloud, label: 'Data Imports' },
] as const;

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  const content = (
    <nav aria-label="Primary" className="flex h-full flex-col px-4 py-6">
      <Link href="/dashboard" className="mb-8 px-2 text-lg font-semibold tracking-tight text-slate-900">
        {PRODUCT_NAME}
      </Link>
      <ul className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${
                  active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 border-t border-slate-200 pt-4">
        <Link
          href="/dashboard/settings"
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
            pathname.startsWith('/dashboard/settings') ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
          Settings
        </Link>
      </div>
    </nav>
  );

  return (
    <>
      <aside className="hidden w-64 border-r border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:flex">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" onClick={onClose} className="absolute inset-0 bg-slate-900/40" />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
