import { DataImportStatus } from '@schemaiq/types';
import { AlertCircle, CheckCircle2, Clock, Loader2, UploadCloud, XCircle, type LucideIcon } from 'lucide-react';

interface StatusMeta {
  label: string;
  icon: LucideIcon;
  className: string;
  spin?: boolean;
}

const STATUS_META: Record<DataImportStatus, StatusMeta> = {
  [DataImportStatus.Uploaded]: { className: 'bg-slate-100 text-slate-700', icon: UploadCloud, label: 'Uploaded' },
  [DataImportStatus.Validating]: { className: 'bg-amber-100 text-amber-700', icon: Loader2, label: 'Validating', spin: true },
  [DataImportStatus.Queued]: { className: 'bg-amber-100 text-amber-700', icon: Clock, label: 'Waiting in Queue' },
  [DataImportStatus.Processing]: { className: 'bg-blue-100 text-blue-700', icon: Loader2, label: 'Importing', spin: true },
  [DataImportStatus.Completed]: { className: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2, label: 'Completed' },
  [DataImportStatus.PartiallyCompleted]: {
    className: 'bg-amber-100 text-amber-700',
    icon: AlertCircle,
    label: 'Partially Completed',
  },
  [DataImportStatus.Failed]: { className: 'bg-red-100 text-red-700', icon: AlertCircle, label: 'Failed' },
  [DataImportStatus.Cancelled]: { className: 'bg-slate-100 text-slate-700', icon: XCircle, label: 'Cancelled' },
};

export function ImportStatusBadge({ status }: { status: DataImportStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>
      <Icon className={`h-3.5 w-3.5 ${meta.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
