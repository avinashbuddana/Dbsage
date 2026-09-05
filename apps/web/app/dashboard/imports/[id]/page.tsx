'use client';

import { DataImportStatus } from '@schemaiq/types';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { ErrorPanel } from '../../../../components/imports/error-panel';
import { ImportProgress } from '../../../../components/imports/import-progress';
import { ImportStatusBadge } from '../../../../components/imports/import-status-badge';
import { ConfirmDialog } from '../../../../components/ui/confirm-dialog';
import { PageHeader } from '../../../../components/ui/page-header';
import { Skeleton } from '../../../../components/ui/skeleton';
import { formatBytes, formatDuration, formatRowCount } from '../../../../lib/format';
import { useCancelImport, useRetryImport } from '../../../../lib/queries/imports-mutations';
import { useImport } from '../../../../lib/queries/imports-queries';

export default function ImportDetailPage() {
  const params = useParams<{ id: string }>();
  const importQuery = useImport(params.id);
  const retry = useRetryImport();
  const cancel = useCancelImport();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  if (importQuery.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (importQuery.isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        We couldn&apos;t load this import. It may not exist, or you may not have access to it.
      </div>
    );
  }

  const data = importQuery.data;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Data Imports"
        title={data.originalFileName}
        description={`Target: ${data.targetSchema}.${data.targetTable}`}
        action={<ImportStatusBadge status={data.status} />}
      />

      {data.status === DataImportStatus.Uploaded && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="text-base font-semibold text-slate-900">Preparing your import</h3>
          <p className="mt-2 text-sm text-slate-600">Your file was uploaded and will be validated shortly.</p>
        </div>
      )}

      {data.status === DataImportStatus.Validating && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h3 className="text-base font-semibold text-amber-900">Checking your CSV</h3>
          <p className="mt-2 text-sm text-amber-800">SchemaIQ is validating the file structure and target columns before importing.</p>
        </div>
      )}

      {data.status === DataImportStatus.Queued && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h3 className="text-base font-semibold text-amber-900">Waiting in queue</h3>
          <p className="mt-2 text-sm text-amber-800">
            Your file has been uploaded successfully and will start when an import worker is available.
          </p>
          <button
            type="button"
            onClick={() => {
              setConfirmingCancel(true);
            }}
            className="mt-4 rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
          >
            Cancel Import
          </button>
        </div>
      )}

      {data.status === DataImportStatus.Processing && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="text-base font-semibold text-slate-900">Importing data</h3>
          <div className="mt-4">
            <ImportProgress
              percent={data.progressPercent}
              processedBytes={data.processedBytes}
              fileSizeBytes={data.fileSizeBytes}
              processedRows={data.totalRows ? data.processedRows : null}
              totalRows={data.totalRows}
            />
          </div>
        </div>
      )}

      {data.status === DataImportStatus.Completed && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
          <h3 className="text-base font-semibold text-emerald-900">Import completed</h3>
          <p className="mt-2 text-sm text-emerald-800">
            Your CSV was successfully imported into {data.targetSchema}.{data.targetTable}.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-emerald-700">Rows imported</dt>
              <dd className="text-emerald-900">{formatRowCount(data.successfulRows)}</dd>
            </div>
            <div>
              <dt className="text-emerald-700">Data processed</dt>
              <dd className="text-emerald-900">{formatBytes(data.processedBytes)}</dd>
            </div>
            <div>
              <dt className="text-emerald-700">Duration</dt>
              <dd className="text-emerald-900">{formatDuration(data.startedAt, data.completedAt)}</dd>
            </div>
            <div>
              <dt className="text-emerald-700">Completed</dt>
              <dd className="text-emerald-900">{data.completedAt ? new Date(data.completedAt).toLocaleTimeString() : '—'}</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/dashboard/imports/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Import Another File
            </Link>
            <Link
              href="/dashboard/imports"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Return to Imports
            </Link>
          </div>
        </div>
      )}

      {data.status === DataImportStatus.Failed && (
        <div className="flex flex-col gap-4">
          <ErrorPanel errorCode={data.errorCode} errorMessage={data.errorMessage} />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                retry.mutate(data.id);
              }}
              disabled={retry.isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Retry Import
            </button>
            <Link
              href="/dashboard/imports/new"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Import Another File
            </Link>
          </div>
        </div>
      )}

      {data.status === DataImportStatus.Cancelled && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="text-base font-semibold text-slate-900">Import cancelled</h3>
          <div className="mt-4">
            <Link href="/dashboard/imports/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Import Another File
            </Link>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmingCancel}
        title="Cancel this import?"
        description="The file will not be imported."
        confirmLabel="Cancel Import"
        destructive
        onConfirm={() => {
          cancel.mutate(data.id);
          setConfirmingCancel(false);
        }}
        onCancel={() => {
          setConfirmingCancel(false);
        }}
      />
    </div>
  );
}
