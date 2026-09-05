'use client';

import { formatRowCount } from '../../lib/format';
import { useImportsSummary } from '../../lib/queries/imports-queries';
import { Metric } from '../ui/metric';
import { Skeleton } from '../ui/skeleton';

export function ImportsMetrics() {
  const summary = useImportsSummary();

  if (summary.isPending || !summary.data) {
    return (
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">
      <Metric label="Total Imports" value={formatRowCount(summary.data.totalImports)} />
      <Metric label="Completed" value={formatRowCount(summary.data.completedImports)} />
      <Metric label="Processing" value={formatRowCount(summary.data.processingImports)} />
      <Metric label="Failed" value={formatRowCount(summary.data.failedImports)} />
      <Metric label="Total Rows Imported" value={formatRowCount(summary.data.totalRowsImported)} />
    </div>
  );
}
