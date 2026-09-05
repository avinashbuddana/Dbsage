'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useReducer } from 'react';

import { ColumnMappingTable } from '../../../../components/imports/column-mapping-table';
import { DestinationStep } from '../../../../components/imports/destination-step';
import { FileDropzone } from '../../../../components/imports/file-dropzone';
import { FileSummary } from '../../../../components/imports/file-summary';
import { ImportSummary } from '../../../../components/imports/import-summary';
import { NewTableColumnsTable } from '../../../../components/imports/new-table-columns-table';
import { StepIndicator } from '../../../../components/imports/step-indicator';
import { PageHeader } from '../../../../components/ui/page-header';
import { ProgressBar } from '../../../../components/ui/progress-bar';
import { ApiError } from '../../../../lib/api-client';
import { DEFAULT_NEW_TABLE_COLUMN_TYPE, dedupeColumnNames, isValidNewColumnName, sanitizeColumnName } from '../../../../lib/column-name';
import {
  initializeMapping,
  mappingToColumnMapping,
  mappingToColumnTypes,
  summarizeMapping,
  type ColumnMapping,
} from '../../../../lib/column-mapping';
import { previewCsv } from '../../../../lib/csv-preview';
import { formatBytes } from '../../../../lib/format';
import { useCreateImport } from '../../../../lib/queries/imports-mutations';
import { useImportConfig, useImportTableDetails } from '../../../../lib/queries/imports-queries';

const STEPS = ['Upload', 'Destination', 'Map Columns', 'Review', 'Import'];

interface DuplicateImportInfo {
  existingImportId: string;
  message: string;
  previousImport?: { fileName: string; successfulRows: string; failedRows: string; totalRows: string | null };
}

interface WizardState {
  step: number;
  file: File | null;
  csvHeaders: string[];
  sampleRow: string[];
  schema: string | null;
  table: string | null;
  createTable: boolean;
  mapping: ColumnMapping[];
  uploadProgress: number | null;
  submitError: string | null;
  duplicateImport: DuplicateImportInfo | null;
}

type WizardAction =
  | { type: 'SET_FILE'; file: File; csvHeaders: string[]; sampleRow: string[] }
  | { type: 'CLEAR_FILE' }
  | { type: 'GO_TO_STEP'; step: number }
  | { type: 'SET_SCHEMA'; schema: string | null }
  | { type: 'SET_TABLE'; table: string | null }
  | { type: 'SET_CREATE_TABLE'; createTable: boolean }
  | { type: 'INIT_MAPPING'; mapping: ColumnMapping[] }
  | { type: 'UPDATE_MAPPING_ROW'; index: number; targetColumn: string | null }
  | { type: 'UPDATE_MAPPING_TYPE'; index: number; dataType: string }
  | { type: 'SET_UPLOAD_PROGRESS'; progress: number | null }
  | { type: 'SET_SUBMIT_ERROR'; message: string | null }
  | { type: 'SET_DUPLICATE_IMPORT'; duplicateImport: DuplicateImportInfo | null };

const INITIAL_STATE: WizardState = {
  createTable: false,
  csvHeaders: [],
  duplicateImport: null,
  file: null,
  mapping: [],
  sampleRow: [],
  schema: null,
  step: 0,
  submitError: null,
  table: null,
  uploadProgress: null,
};

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_FILE':
      return { ...state, csvHeaders: action.csvHeaders, file: action.file, sampleRow: action.sampleRow };
    case 'CLEAR_FILE':
      return { ...INITIAL_STATE };
    case 'GO_TO_STEP':
      return { ...state, step: action.step };
    case 'SET_SCHEMA':
      return { ...state, mapping: [], schema: action.schema, table: null };
    case 'SET_TABLE':
      return { ...state, mapping: [], table: action.table };
    case 'SET_CREATE_TABLE':
      return { ...state, createTable: action.createTable, mapping: [], table: null };
    case 'INIT_MAPPING':
      return { ...state, mapping: action.mapping };
    case 'UPDATE_MAPPING_ROW':
      return {
        ...state,
        mapping: state.mapping.map((row, index) => (index === action.index ? { ...row, targetColumn: action.targetColumn } : row)),
      };
    case 'UPDATE_MAPPING_TYPE':
      return {
        ...state,
        mapping: state.mapping.map((row, index) => (index === action.index ? { ...row, dataType: action.dataType } : row)),
      };
    case 'SET_UPLOAD_PROGRESS':
      return { ...state, uploadProgress: action.progress };
    case 'SET_SUBMIT_ERROR':
      return { ...state, submitError: action.message };
    case 'SET_DUPLICATE_IMPORT':
      return { ...state, duplicateImport: action.duplicateImport };
    default:
      return state;
  }
}

export default function NewImportPage() {
  const router = useRouter();
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_STATE);
  const config = useImportConfig();
  const details = useImportTableDetails(state.createTable ? null : state.schema, state.createTable ? null : state.table);
  const createImport = useCreateImport();

  useEffect(() => {
    if (state.mapping.length > 0 || !state.file) return;
    if (state.createTable) {
      const sanitized = dedupeColumnNames(state.csvHeaders.map(sanitizeColumnName));
      dispatch({
        mapping: state.csvHeaders.map((csvHeader, index) => ({
          csvHeader,
          dataType: DEFAULT_NEW_TABLE_COLUMN_TYPE,
          sample: state.sampleRow[index] ?? '',
          targetColumn: sanitized[index] ?? null,
        })),
        type: 'INIT_MAPPING',
      });
      return;
    }
    if (details.data) {
      dispatch({ mapping: initializeMapping(state.csvHeaders, state.sampleRow, details.data.columns), type: 'INIT_MAPPING' });
    }
  }, [state.createTable, details.data, state.file, state.csvHeaders, state.sampleRow, state.mapping.length]);

  const summary = !state.createTable && details.data ? summarizeMapping(state.mapping, details.data.columns) : null;
  const isLarge = Boolean(config.data && state.file && state.file.size > config.data.queueThresholdBytes);
  const newTableColumnNames = state.mapping.map((row) => row.targetColumn).filter((name): name is string => Boolean(name));
  const isNewTableMappingValid =
    newTableColumnNames.length > 0 &&
    newTableColumnNames.every(isValidNewColumnName) &&
    new Set(newTableColumnNames).size === newTableColumnNames.length;
  const canContinueFromMapping = state.createTable
    ? isNewTableMappingValid
    : summary
      ? summary.missingRequiredColumns.length === 0
      : false;
  const mappingStepReady = state.createTable ? state.mapping.length > 0 : Boolean(details.data);
  const reviewCounts = state.createTable
    ? { ignoredCount: state.mapping.length - newTableColumnNames.length, matchedCount: newTableColumnNames.length }
    : summary
      ? { ignoredCount: summary.unmapped, matchedCount: summary.matched + summary.review }
      : null;

  async function handleFileSelected(file: File): Promise<void> {
    const preview = await previewCsv(file);
    dispatch({ csvHeaders: preview.headers, file, sampleRow: preview.sampleRow, type: 'SET_FILE' });
  }

  async function handleStartImport(): Promise<void> {
    if (!state.file || !state.schema || !state.table) return;
    dispatch({ message: null, type: 'SET_SUBMIT_ERROR' });
    dispatch({ duplicateImport: null, type: 'SET_DUPLICATE_IMPORT' });
    dispatch({ progress: 0, type: 'SET_UPLOAD_PROGRESS' });
    try {
      const result = await createImport.mutateAsync({
        input: {
          columnMapping: mappingToColumnMapping(state.mapping),
          columnTypes: mappingToColumnTypes(state.mapping),
          createTable: state.createTable,
          delimiter: ',',
          file: state.file,
          targetSchema: state.schema,
          targetTable: state.table,
        },
        onProgress: (percent) => {
          dispatch({ progress: percent, type: 'SET_UPLOAD_PROGRESS' });
        },
      });
      router.push(`/dashboard/imports/${result.data.id}`);
    } catch (error) {
      dispatch({ progress: null, type: 'SET_UPLOAD_PROGRESS' });
      if (
        error instanceof ApiError &&
        (error.code === 'DUPLICATE_IMPORT' || error.code === 'IMPORT_ALREADY_IN_PROGRESS') &&
        error.existingImportId
      ) {
        dispatch({
          duplicateImport: {
            existingImportId: error.existingImportId,
            message: error.message,
            previousImport: error.previousImport,
          },
          type: 'SET_DUPLICATE_IMPORT',
        });
        return;
      }
      dispatch({ message: error instanceof Error ? error.message : 'The import could not be started.', type: 'SET_SUBMIT_ERROR' });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Data Imports" title="Import CSV" description="Upload, map, and start a new CSV import." />
      <StepIndicator steps={STEPS} currentStep={state.step} />

      {state.step === 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-slate-900">Upload your CSV</h2>
          <p className="text-sm text-slate-600">
            Choose the CSV file you want to import. Large files are automatically processed in the background.
          </p>
          {state.file ? (
            <FileSummary
              file={state.file}
              onChange={() => {
                dispatch({ type: 'CLEAR_FILE' });
              }}
            />
          ) : (
            <FileDropzone
              onFileSelected={(file) => {
                void handleFileSelected(file);
              }}
            />
          )}
          {isLarge && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <p className="font-medium">Large file detected</p>
              <p>This import will run in the background. You can safely leave this page after the upload is queued.</p>
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!state.file}
              onClick={() => {
                dispatch({ step: 1, type: 'GO_TO_STEP' });
              }}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {state.step === 1 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-slate-900">Choose where to import the data</h2>
          <DestinationStep
            schema={state.schema}
            table={state.table}
            createTable={state.createTable}
            onSchemaChange={(schema) => {
              dispatch({ schema, type: 'SET_SCHEMA' });
            }}
            onTableChange={(table) => {
              dispatch({ table, type: 'SET_TABLE' });
            }}
            onCreateTableChange={(createTable) => {
              dispatch({ createTable, type: 'SET_CREATE_TABLE' });
            }}
          />
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => {
                dispatch({ step: 0, type: 'GO_TO_STEP' });
              }}
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!state.schema || !state.table || (state.createTable && !isValidNewColumnName(state.table))}
              onClick={() => {
                dispatch({ step: 2, type: 'GO_TO_STEP' });
              }}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {state.step === 2 && mappingStepReady && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-slate-900">Match your CSV columns</h2>
          <p className="text-sm text-slate-600">
            {state.createTable
              ? 'Review the column names that will be created in your new table.'
              : 'Confirm where each CSV column should be imported.'}
          </p>
          {summary && (
            <p className="text-sm text-slate-600">
              {summary.matched} matched · {summary.review} need review · {summary.unmapped} ignored
              {summary.missingRequiredColumns.length > 0 && ` · ${String(summary.missingRequiredColumns.length)} required fields missing`}
            </p>
          )}
          {state.createTable ? (
            <NewTableColumnsTable
              mapping={state.mapping}
              onChange={(index, targetColumn) => {
                dispatch({ index, targetColumn, type: 'UPDATE_MAPPING_ROW' });
              }}
              onTypeChange={(index, dataType) => {
                dispatch({ dataType, index, type: 'UPDATE_MAPPING_TYPE' });
              }}
            />
          ) : (
            details.data && (
              <ColumnMappingTable
                mapping={state.mapping}
                targetColumns={details.data.columns}
                onChange={(index, targetColumn) => {
                  dispatch({ index, targetColumn, type: 'UPDATE_MAPPING_ROW' });
                }}
              />
            )
          )}
          {summary && summary.missingRequiredColumns.length > 0 && (
            <p className="text-sm text-red-600">
              Required column{summary.missingRequiredColumns.length > 1 ? 's' : ''} not mapped: {summary.missingRequiredColumns.join(', ')}
            </p>
          )}
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => {
                dispatch({ step: 1, type: 'GO_TO_STEP' });
              }}
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!canContinueFromMapping}
              onClick={() => {
                dispatch({ step: 3, type: 'GO_TO_STEP' });
              }}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {state.step === 3 && state.file && state.schema && state.table && reviewCounts && (
        <ImportSummary
          fileName={state.file.name}
          fileSize={formatBytes(state.file.size)}
          schema={state.schema}
          table={state.table}
          createTable={state.createTable}
          matchedCount={reviewCounts.matchedCount}
          ignoredCount={reviewCounts.ignoredCount}
          totalColumns={state.mapping.length}
          isLarge={isLarge}
          onBack={() => {
            dispatch({ step: 2, type: 'GO_TO_STEP' });
          }}
          onStart={() => {
            dispatch({ step: 4, type: 'GO_TO_STEP' });
            void handleStartImport();
          }}
        />
      )}

      {state.step === 4 && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
          {state.duplicateImport ? (
            <>
              <p className="text-lg font-semibold text-slate-900">File Already Imported</p>
              <p className="max-w-md text-sm text-slate-600">{state.duplicateImport.message}</p>
              {state.duplicateImport.previousImport && (
                <p className="max-w-md text-sm text-slate-600">
                  {state.duplicateImport.previousImport.fileName} &middot;{' '}
                  {Number(state.duplicateImport.previousImport.successfulRows).toLocaleString()} rows
                </p>
              )}
              <Link
                href={`/dashboard/imports/${state.duplicateImport.existingImportId}`}
                className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700"
              >
                View existing import
              </Link>
            </>
          ) : state.submitError ? (
            <>
              <p className="text-lg font-semibold text-slate-900">We couldn&apos;t start the import</p>
              <p className="max-w-md text-sm text-slate-600">{state.submitError}</p>
              <button
                type="button"
                onClick={() => {
                  dispatch({ step: 3, type: 'GO_TO_STEP' });
                }}
                className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700"
              >
                Back to review
              </button>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-slate-900">Uploading {state.file?.name}</p>
              <div className="w-full max-w-sm">
                <ProgressBar percent={state.uploadProgress ?? 0} />
              </div>
              <p className="text-sm text-slate-500">{state.uploadProgress ?? 0}%</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
