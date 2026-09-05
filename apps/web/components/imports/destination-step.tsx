'use client';

import { isValidNewColumnName } from '../../lib/column-name';
import { useImportSchemas, useImportTableDetails, useImportTables } from '../../lib/queries/imports-queries';
import { requiredColumns } from '../../lib/target-columns';

interface DestinationStepProps {
  schema: string | null;
  table: string | null;
  createTable?: boolean;
  onSchemaChange: (schema: string | null) => void;
  onTableChange: (table: string | null) => void;
  onCreateTableChange?: (createTable: boolean) => void;
}

export function DestinationStep({
  schema,
  table,
  createTable = false,
  onSchemaChange,
  onTableChange,
  onCreateTableChange = () => undefined,
}: DestinationStepProps) {
  const schemas = useImportSchemas();
  const tables = useImportTables(createTable ? null : schema);
  const details = useImportTableDetails(createTable ? null : schema, createTable ? null : table);

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
        <div className="flex flex-col gap-4">
          <div className="inline-flex w-fit rounded-lg border border-slate-300 p-1 text-sm">
            <button
              type="button"
              aria-pressed={!createTable}
              onClick={() => {
                onCreateTableChange(false);
                onTableChange(null);
              }}
              className={`rounded-md px-3 py-1.5 font-medium ${!createTable ? 'bg-blue-600 text-white' : 'text-slate-600'}`}
            >
              Use existing table
            </button>
            <button
              type="button"
              aria-pressed={createTable}
              onClick={() => {
                onCreateTableChange(true);
                onTableChange(null);
              }}
              className={`rounded-md px-3 py-1.5 font-medium ${createTable ? 'bg-blue-600 text-white' : 'text-slate-600'}`}
            >
              Create new table
            </button>
          </div>

          {createTable ? (
            <div>
              <label htmlFor="new-table-name" className="text-sm font-medium text-slate-700">
                New table name
              </label>
              <input
                id="new-table-name"
                value={table ?? ''}
                onChange={(event) => {
                  onTableChange(event.target.value || null);
                }}
                placeholder="e.g. customers"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
              />
              {table && !isValidNewColumnName(table) && (
                <p className="mt-1 text-xs text-red-600">Use only letters, numbers, and underscores, starting with a letter.</p>
              )}
              <p className="mt-2 text-sm text-slate-600">
                A new table will be created with columns from your CSV header (as text). You can review and rename them in the next
                step.
              </p>
            </div>
          ) : (
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
        </div>
      )}

      {!createTable && schema && table && details.data && (
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
