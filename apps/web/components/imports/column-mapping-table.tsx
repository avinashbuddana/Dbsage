'use client';

import type { ImportTargetColumnResponse } from '@schemaiq/types';

import { mappingRowStatus, type ColumnMapping } from '../../lib/column-mapping';

interface ColumnMappingTableProps {
  mapping: ColumnMapping[];
  targetColumns: ImportTargetColumnResponse[];
  onChange: (index: number, targetColumn: string | null) => void;
}

const STATUS_LABEL = { matched: 'Matched', review: 'Review', unmapped: 'Unmapped' } as const;
const STATUS_CLASS = {
  matched: 'bg-emerald-100 text-emerald-700',
  review: 'bg-amber-100 text-amber-700',
  unmapped: 'bg-slate-100 text-slate-600',
} as const;

export function ColumnMappingTable({ mapping, targetColumns, onChange }: ColumnMappingTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">CSV Column</th>
            <th className="px-4 py-3">Sample</th>
            <th className="px-4 py-3">Postgres Column</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {mapping.map((row, index) => {
            const status = mappingRowStatus(row);
            return (
              <tr key={row.csvHeader}>
                <td className="px-4 py-3 font-medium text-slate-900">{row.csvHeader}</td>
                <td className="px-4 py-3 text-slate-500">{row.sample || '—'}</td>
                <td className="px-4 py-3">
                  <select
                    aria-label={`Target column for ${row.csvHeader}`}
                    value={row.targetColumn ?? ''}
                    onChange={(event) => {
                      onChange(index, event.target.value || null);
                    }}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">Do not import</option>
                    {targetColumns.map((column) => (
                      <option key={column.name} value={column.name}>
                        {`${column.name} (${column.dataType}${
                          !column.isNullable && !column.hasDefault && !column.isGenerated && !column.isIdentity ? ', required' : ''
                        })`}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
