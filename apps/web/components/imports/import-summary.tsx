import { DataImportMode } from '@schemaiq/types';

interface ImportSummaryProps {
  fileName: string;
  fileSize: string;
  schema: string;
  table: string;
  createTable?: boolean;
  matchedCount: number;
  ignoredCount: number;
  totalColumns: number;
  isLarge: boolean;
  importMode?: DataImportMode;
  onImportModeChange?: (importMode: DataImportMode) => void;
  onBack: () => void;
  onStart: () => void;
}

export function ImportSummary({
  fileName,
  fileSize,
  schema,
  table,
  createTable = false,
  matchedCount,
  ignoredCount,
  totalColumns,
  isLarge,
  importMode = DataImportMode.Strict,
  onImportModeChange = () => undefined,
  onBack,
  onStart,
}: ImportSummaryProps) {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-slate-900">Review import</h2>
      <div className="grid gap-6 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">File</p>
          <p className="mt-1 text-slate-900">{fileName}</p>
          <p className="text-sm text-slate-500">{fileSize}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Destination</p>
          <p className="mt-1 text-slate-900">{createTable ? 'New PostgreSQL table' : 'SchemaIQ PostgreSQL'}</p>
          <p className="text-sm text-slate-500">{`${schema}.${table}`}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mapping</p>
          <p className="mt-1 text-slate-900">{totalColumns} CSV columns</p>
          <p className="text-sm text-slate-500">
            {matchedCount} imported · {ignoredCount} ignored
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Processing</p>
          <p className="mt-1 text-slate-900">{isLarge ? 'Background import' : 'Immediate import'}</p>
          <p className="text-sm text-slate-500">
            {isLarge
              ? 'Large files are automatically queued and streamed into PostgreSQL.'
              : 'This file will be imported immediately.'}
          </p>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Import Mode</p>
        <div className="mt-2 inline-flex rounded-lg border border-slate-300 p-1 text-sm">
          <button
            type="button"
            aria-pressed={importMode === DataImportMode.Strict}
            onClick={() => {
              onImportModeChange(DataImportMode.Strict);
            }}
            className={`rounded-md px-3 py-1.5 font-medium ${importMode === DataImportMode.Strict ? 'bg-blue-600 text-white' : 'text-slate-600'}`}
          >
            Strict
          </button>
          <button
            type="button"
            aria-pressed={importMode === DataImportMode.Flexible}
            onClick={() => {
              onImportModeChange(DataImportMode.Flexible);
            }}
            className={`rounded-md px-3 py-1.5 font-medium ${importMode === DataImportMode.Flexible ? 'bg-blue-600 text-white' : 'text-slate-600'}`}
          >
            Flexible
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {importMode === DataImportMode.Strict
            ? 'Strict: if any row fails to convert, nothing is imported.'
            : 'Flexible: valid rows are imported; rows that fail to convert are skipped and listed for review.'}
        </p>
      </div>
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        SchemaIQ uses PostgreSQL&apos;s bulk import pipeline. The CSV is streamed rather than loaded entirely into application memory.
      </p>
      <div className="flex justify-between">
        <button type="button" onClick={onBack} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700">
          Back
        </button>
        <button type="button" onClick={onStart} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
          Start Import
        </button>
      </div>
    </div>
  );
}
