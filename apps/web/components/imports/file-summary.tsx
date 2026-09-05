import { FileText } from 'lucide-react';

import { formatBytes } from '../../lib/format';

interface FileSummaryProps {
  file: File;
  onChange: () => void;
}

export function FileSummary({ file, onChange }: FileSummaryProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-blue-600" aria-hidden="true" />
        <div>
          <p className="font-medium text-slate-900">{file.name}</p>
          <p className="text-sm text-slate-500">{formatBytes(file.size)} · CSV</p>
        </div>
      </div>
      <button type="button" onClick={onChange} className="text-sm font-medium text-blue-600 hover:text-blue-700">
        Change
      </button>
    </div>
  );
}
