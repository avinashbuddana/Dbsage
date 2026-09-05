'use client';

import { DEFAULT_NEW_TABLE_COLUMN_TYPE, NEW_TABLE_COLUMN_TYPES, isValidNewColumnName } from '../../lib/column-name';
import type { ColumnMapping } from '../../lib/column-mapping';

interface NewTableColumnsTableProps {
  mapping: ColumnMapping[];
  onChange: (index: number, targetColumn: string | null) => void;
  onTypeChange: (index: number, dataType: string) => void;
}

export function NewTableColumnsTable({ mapping, onChange, onTypeChange }: NewTableColumnsTableProps) {
  const names = mapping.map((row) => row.targetColumn).filter((name): name is string => Boolean(name));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">CSV Column</th>
            <th className="px-4 py-3">Sample</th>
            <th className="px-4 py-3">New Column Name</th>
            <th className="px-4 py-3">Database Type</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {mapping.map((row, index) => {
            const value = row.targetColumn ?? '';
            const isValid = value.length === 0 || isValidNewColumnName(value);
            const isDuplicate = value.length > 0 && names.filter((name) => name === value).length > 1;
            return (
              <tr key={row.csvHeader}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.csvHeader}</td>
                <td className="px-4 py-3 text-slate-500">{row.sample || '—'}</td>
                <td className="px-4 py-3">
                  <input
                    aria-label={`New column name for ${row.csvHeader}`}
                    value={value}
                    onChange={(event) => {
                      onChange(index, event.target.value || null);
                    }}
                    className={`w-full rounded-lg border px-2 py-1.5 text-sm ${
                      isValid && !isDuplicate ? 'border-slate-300' : 'border-red-400'
                    }`}
                  />
                  {!isValid && <p className="mt-1 text-xs text-red-600">Use only letters, numbers, and underscores.</p>}
                  {isValid && isDuplicate && <p className="mt-1 text-xs text-red-600">Column names must be unique.</p>}
                </td>
                <td className="px-4 py-3">
                  <select
                    aria-label={`Database type for ${row.csvHeader}`}
                    value={row.dataType ?? DEFAULT_NEW_TABLE_COLUMN_TYPE}
                    onChange={(event) => {
                      onTypeChange(index, event.target.value);
                    }}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    {NEW_TABLE_COLUMN_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
