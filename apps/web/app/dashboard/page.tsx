'use client';

import { Activity, Database, UploadCloud } from 'lucide-react';
import Link from 'next/link';

import { ImportStatusBadge } from '../../components/imports/import-status-badge';
import { PageHeader } from '../../components/ui/page-header';
import { Skeleton } from '../../components/ui/skeleton';
import { useOrganization } from '../../lib/organization-context';
import { useImportsList } from '../../lib/queries/imports-queries';

export default function DashboardOverviewPage() {
  const { organizationId } = useOrganization();
  const recent = useImportsList({ limit: 5, page: 1 });

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Database Operations"
        title="Move data with confidence."
        description="Connect, inspect, and manage database operations from one workspace."
      />

      {!organizationId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Set your development organization ID (top right) to load your workspace data.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/dashboard/data-sources" className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300">
          <Database className="h-6 w-6 text-blue-600" aria-hidden="true" />
          <h3 className="mt-4 text-base font-semibold text-slate-900">Data Sources</h3>
          <p className="mt-1 text-sm text-slate-500">Coming soon</p>
        </Link>
        <Link href="/dashboard/imports" className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300">
          <UploadCloud className="h-6 w-6 text-blue-600" aria-hidden="true" />
          <h3 className="mt-4 text-base font-semibold text-slate-900">CSV Imports</h3>
          <p className="mt-1 text-sm text-slate-500">Stream CSV data into PostgreSQL.</p>
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Activity className="h-6 w-6 text-blue-600" aria-hidden="true" />
          <h3 className="mt-4 text-base font-semibold text-slate-900">Recent Activity</h3>
          {!organizationId || recent.isPending ? (
            <div className="mt-3 flex flex-col gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : recent.data && recent.data.items.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {recent.data.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-slate-700">{item.originalFileName}</span>
                  <ImportStatusBadge status={item.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-slate-500">No imports yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
