'use client';

import { DataImportStatus, type DataImportApiResponse } from '@schemaiq/types';
import { MoreVertical } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { formatBytes, formatDuration, formatRowCount } from '../../lib/format';
import { useCancelImport, useDeleteImport, useRetryImport } from '../../lib/queries/imports-mutations';
import { useImportsList } from '../../lib/queries/imports-queries';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { DataTable, type DataTableColumn } from '../ui/data-table';
import { Pagination } from '../ui/pagination';
import { ImportStatusBadge } from './import-status-badge';

const STATUS_FILTERS: { label: string; value: DataImportStatus | '' }[] = [
  { label: 'All statuses', value: '' },
  { label: 'Uploaded', value: DataImportStatus.Uploaded },
  { label: 'Validating', value: DataImportStatus.Validating },
  { label: 'Waiting in Queue', value: DataImportStatus.Queued },
  { label: 'Importing', value: DataImportStatus.Processing },
  { label: 'Completed', value: DataImportStatus.Completed },
  { label: 'Failed', value: DataImportStatus.Failed },
  { label: 'Cancelled', value: DataImportStatus.Cancelled },
];

const LIMIT = 20;

export function ImportsHistoryTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<DataImportStatus | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<DataImportApiResponse | null>(null);

  const list = useImportsList({ limit: LIMIT, page, search: search || undefined, status });
  const retry = useRetryImport();
  const cancel = useCancelImport();
  const remove = useDeleteImport();

  const columns: DataTableColumn<DataImportApiResponse>[] = [
    { header: 'File', key: 'file', render: (row) => <span className="font-medium text-slate-900">{row.originalFileName}</span> },
    { header: 'Target', key: 'target', render: (row) => `${row.targetSchema}.${row.targetTable}` },
    { header: 'Status', key: 'status', render: (row) => <ImportStatusBadge status={row.status} /> },
    {
      header: 'Progress / Rows',
      key: 'progress',
      render: (row) =>
        row.status === DataImportStatus.Completed
          ? `${formatRowCount(row.successfulRows)} rows`
          : `${String(row.progressPercent)}%`,
    },
    { header: 'Size', key: 'size', render: (row) => formatBytes(row.fileSizeBytes) },
    { header: 'Started', key: 'started', render: (row) => (row.startedAt ? new Date(row.startedAt).toLocaleString() : '—') },
    { header: 'Duration', key: 'duration', render: (row) => formatDuration(row.startedAt, row.completedAt) },
    {
      header: 'Actions',
      key: 'actions',
      render: (row) => (
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/imports/${row.id}`} className="text-blue-600 hover:text-blue-700">
            View
          </Link>
          {row.status === DataImportStatus.Failed && (
            <button
              type="button"
              onClick={() => {
                retry.mutate(row.id);
              }}
              disabled={retry.isPending}
              className="text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              Retry
            </button>
          )}
          {row.status === DataImportStatus.Queued && (
            <button
              type="button"
              onClick={() => {
                cancel.mutate(row.id);
              }}
              disabled={cancel.isPending}
              className="text-slate-500 hover:text-slate-700 disabled:opacity-50"
            >
              Cancel Import
            </button>
          )}
          {([DataImportStatus.Completed, DataImportStatus.Failed, DataImportStatus.Cancelled] as DataImportStatus[]).includes(
            row.status,
          ) && (
            <button
              type="button"
              onClick={() => {
                setPendingDelete(row);
              }}
              aria-label={`Delete history for ${row.originalFileName}`}
              className="text-slate-400 hover:text-red-600"
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search by filename"
          aria-label="Search by filename"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
        />
        <select
          value={status ?? ''}
          onChange={(event) => {
            setStatus((event.target.value || undefined) as DataImportStatus | undefined);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {STATUS_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <DataTable columns={columns} rows={list.data?.items ?? []} getRowKey={(row) => row.id} emptyMessage="No imports match your filters." />

      {list.data && (
        <Pagination
          page={page}
          limit={LIMIT}
          total={list.data.total}
          onPageChange={(nextPage) => {
            setPage(nextPage);
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete import history"
        description="This removes the SchemaIQ import record and retained source file where applicable. It does not delete data already imported into PostgreSQL."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => {
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
