'use client';

import { useImportSchemas, useImportTableDetails, useImportTables } from '../../lib/queries/imports-queries';
import { requiredColumns } from '../../lib/target-columns';

interface DestinationStepProps {
  schema: string | null;
  table: string | null;
  onSchemaChange: (schema: string | null) => void;
  onTableChange: (table: string | null) => void;
}

export function DestinationStep({ schema, table, onSchemaChange, onTableChange }: DestinationStepProps) {
  const schemas = useImportSchemas();
  const tables = useImportTables(schema);
  const details = useImportTableDetails(schema, table);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <label htmlFor="target-schema" className="text-sm font-medium text-slate-700">
          Schema
        </label>
        <select
          id="target-schema"
          value={schema ?? ''}
          onChange={(event) => {
            onSchemaChange(event.target.value || null);
            onTableChange(null);
          }}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
        >
          <option value="">Select a schema…</option>
          {schemas.data?.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      {schema && (
        <div>
          <label htmlFor="target-table" className="text-sm font-medium text-slate-700">
            Table
          </label>
          <select
            id="target-table"
            value={table ?? ''}
            onChange={(event) => {
              onTableChange(event.target.value || null);
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
          >
            <option value="">Select a table…</option>
            {tables.data?.map((item) => (
              <option key={item.name} value={item.name}>{`${item.name} (${String(item.columnCount)} columns)`}</option>
            ))}
          </select>
        </div>
      )}

      {schema && table && details.data && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Target</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{`${schema}.${table}`}</p>
          <dl className="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Columns</dt>
              <dd className="text-slate-900">{details.data.columns.length}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Required fields</dt>
              <dd className="text-slate-900">{requiredColumns(details.data.columns).length}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Generated/default fields</dt>
              <dd className="text-slate-900">
                {details.data.columns.filter((column) => column.isGenerated || column.hasDefault || column.isIdentity).length}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
