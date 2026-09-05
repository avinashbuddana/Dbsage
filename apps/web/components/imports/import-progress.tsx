import { formatBytes, formatRowCount } from '../../lib/format';
import { ProgressBar } from '../ui/progress-bar';

interface ImportProgressProps {
  percent: number;
  processedBytes: string;
  fileSizeBytes: string;
  processedRows: string | null;
  totalRows: string | null;
}

export function ImportProgress({ percent, processedBytes, fileSizeBytes, processedRows, totalRows }: ImportProgressProps) {
  return (
    <div className="flex flex-col gap-3">
      <ProgressBar percent={percent} label="Importing data" />
      <p className="text-sm text-slate-600">
        {formatBytes(processedBytes)} / {formatBytes(fileSizeBytes)} processed
      </p>
      {totalRows && processedRows && <p className="text-sm text-slate-500">{formatRowCount(processedRows)} rows processed</p>}
    </div>
  );
}
