'use client';

import { UploadCloud } from 'lucide-react';
import Link from 'next/link';

import { ImportsHistoryTable } from '../../../components/imports/imports-history-table';
import { ImportsMetrics } from '../../../components/imports/imports-metrics';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/page-header';
import { useOrganization } from '../../../lib/organization-context';
import { useImportsList } from '../../../lib/queries/imports-queries';

const IMPORT_CTA = (
  <Link href="/dashboard/imports/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
    Import CSV
  </Link>
);

export default function ImportsOverviewPage() {
  const { organizationId } = useOrganization();
  const totalCheck = useImportsList({ limit: 1, page: 1 });
  const hasNoImportsAtAll = Boolean(organizationId) && totalCheck.data?.total === 0;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Data Management"
        title="CSV Data Imports"
        description="Import large CSV datasets into PostgreSQL efficiently using SchemaIQ's streaming import engine."
        action={IMPORT_CTA}
      />

      {!organizationId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Set your development organization ID (top right) to view imports.
        </div>
      ) : hasNoImportsAtAll ? (
        <EmptyState
          icon={UploadCloud}
          title="Import your first dataset"
          description="Upload a CSV file and SchemaIQ will safely stream it into PostgreSQL."
          action={IMPORT_CTA}
        />
      ) : (
        <>
          <ImportsMetrics />
          <ImportsHistoryTable />
        </>
      )}
    </div>
  );
}
