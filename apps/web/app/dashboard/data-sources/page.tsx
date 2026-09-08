'use client';

import {
  DatasourceConnectionMode,
  DatasourceStatus,
  DatasourceType,
  type DatasourceResponse,
} from '@schemaiq/types';
import { CheckCircle2, CircleAlert, Database, Loader2, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState, type SyntheticEvent } from 'react';

import { ConfirmDialog } from '../../../components/ui/confirm-dialog';
import { DataTable, type DataTableColumn } from '../../../components/ui/data-table';
import { EmptyState } from '../../../components/ui/empty-state';
import { PageHeader } from '../../../components/ui/page-header';
import { type MysqlDatasourceInput } from '../../../lib/api-client';
import {
  useCreateDatasource,
  useDeleteDatasource,
  useTestDatasourceCandidate,
  useTestSavedDatasource,
  useUpdateDatasourceStatus,
} from '../../../lib/queries/datasources-mutations';
import { useDatasources } from '../../../lib/queries/datasources-queries';

interface ConnectionForm {
  name: string;
  host: string;
  port: string;
  databaseName: string;
  username: string;
  databasePassword: string;
  sslEnabled: boolean;
}

interface Feedback {
  tone: 'error' | 'success';
  message: string;
}

const INITIAL_FORM: ConnectionForm = {
  databaseName: '',
  databasePassword: '',
  host: '',
  name: '',
  port: '3306',
  sslEnabled: false,
  username: '',
};

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return 'Not tested yet';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
}

function statusLabel(status: DatasourceStatus): string {
  switch (status) {
    case DatasourceStatus.Active:
      return 'Active';
    case DatasourceStatus.ConnectionFailed:
      return 'Connection failed';
    case DatasourceStatus.Disabled:
      return 'Disabled';
  }
}

function statusClass(status: DatasourceStatus): string {
  switch (status) {
    case DatasourceStatus.Active:
      return 'bg-emerald-50 text-emerald-700';
    case DatasourceStatus.ConnectionFailed:
      return 'bg-red-50 text-red-700';
    case DatasourceStatus.Disabled:
      return 'bg-slate-100 text-slate-600';
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function DataSourcesPage() {
  const datasources = useDatasources();
  const createDatasource = useCreateDatasource();
  const testCandidate = useTestDatasourceCandidate();
  const testSaved = useTestSavedDatasource();
  const updateStatus = useUpdateDatasourceStatus();
  const deleteDatasource = useDeleteDatasource();
  const [form, setForm] = useState<ConnectionForm>(INITIAL_FORM);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [savedTestFeedback, setSavedTestFeedback] = useState<Record<string, Feedback>>({});
  const [deleteTarget, setDeleteTarget] = useState<DatasourceResponse | null>(null);
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const showConnectForm = showConnectionForm || (datasources.data?.length ?? 0) === 0;

  function updateForm<K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toInput(requireName: boolean): MysqlDatasourceInput | null {
    const name = form.name.trim();
    const host = form.host.trim();
    const databaseName = form.databaseName.trim();
    const username = form.username.trim();
    const port = Number(form.port);

    if ((requireName && !name) || !host || !databaseName || !username || !form.databasePassword) {
      setFeedback({ message: 'Complete all required connection fields before continuing.', tone: 'error' });
      return null;
    }
    if (host.includes('://') || /\s/.test(host)) {
      setFeedback({ message: 'Enter a hostname or IP address, not a connection URL.', tone: 'error' });
      return null;
    }
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      setFeedback({ message: 'MySQL port must be a number from 1 to 65535.', tone: 'error' });
      return null;
    }

    return {
      connectionMode: DatasourceConnectionMode.Direct,
      databaseName,
      databasePassword: form.databasePassword,
      databaseType: DatasourceType.MySql,
      host,
      name,
      port,
      sslEnabled: form.sslEnabled,
      username,
    };
  }

  async function handleTestConnection(): Promise<void> {
    const input = toInput(false);
    if (!input) return;
    setFeedback(null);

    try {
      const result = await testCandidate.mutateAsync({
        connectionMode: input.connectionMode,
        databaseName: input.databaseName,
        databasePassword: input.databasePassword,
        databaseType: input.databaseType,
        host: input.host,
        port: input.port,
        sslEnabled: input.sslEnabled,
        username: input.username,
      });
      setFeedback({
        message: `Connection succeeded in ${String(result.latencyMs)} ms. Save it when you are ready.`,
        tone: 'success',
      });
    } catch (error) {
      setFeedback({ message: errorMessage(error, 'SchemaIQ could not connect to this MySQL database.'), tone: 'error' });
    }
  }

  async function handleSave(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const input = toInput(true);
    if (!input) return;
    setFeedback(null);

    try {
      const datasource = await createDatasource.mutateAsync(input);
      setForm(INITIAL_FORM);
      setShowConnectionForm(false);
      setSavedTestFeedback((current) => ({
        ...current,
        [datasource.id]: { message: `${datasource.name} was saved and verified.`, tone: 'success' },
      }));
    } catch (error) {
      setFeedback({ message: errorMessage(error, 'SchemaIQ could not save this data source.'), tone: 'error' });
    }
  }

  async function handleTestSaved(datasource: DatasourceResponse): Promise<void> {
    try {
      const result = await testSaved.mutateAsync(datasource.id);
      setSavedTestFeedback((current) => ({
        ...current,
        [datasource.id]: { message: `Connection succeeded in ${String(result.latencyMs)} ms.`, tone: 'success' },
      }));
    } catch (error) {
      setSavedTestFeedback((current) => ({
        ...current,
        [datasource.id]: { message: errorMessage(error, 'Connection test failed.'), tone: 'error' },
      }));
    }
  }

  async function handleStatusChange(datasource: DatasourceResponse): Promise<void> {
    const status = datasource.status === DatasourceStatus.Disabled ? DatasourceStatus.Active : DatasourceStatus.Disabled;
    try {
      await updateStatus.mutateAsync({ id: datasource.id, status });
    } catch (error) {
      setSavedTestFeedback((current) => ({
        ...current,
        [datasource.id]: { message: errorMessage(error, `Could not ${status === DatasourceStatus.Active ? 'enable' : 'disable'} this data source.`), tone: 'error' },
      }));
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteTarget) return;
    try {
      await deleteDatasource.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      setSavedTestFeedback((current) => ({
        ...current,
        [deleteTarget.id]: { message: errorMessage(error, 'Could not delete this data source.'), tone: 'error' },
      }));
      setDeleteTarget(null);
    }
  }

  const columns: DataTableColumn<DatasourceResponse>[] = [
    {
      header: 'Data source',
      key: 'name',
      render: (datasource) => (
        <div>
          <p className="font-medium text-slate-900">{datasource.name}</p>
          <p className="mt-0.5 font-mono text-xs text-slate-500">{datasource.host}:{String(datasource.port)}</p>
        </div>
      ),
    },
    {
      header: 'Database',
      key: 'database',
      render: (datasource) => (
        <div>
          <p className="text-slate-700">{datasource.databaseName}</p>
          <p className="mt-0.5 text-xs text-slate-500">{datasource.username} · MySQL</p>
        </div>
      ),
    },
    {
      header: 'Security',
      key: 'security',
      render: (datasource) => (
        <span className="inline-flex items-center gap-1.5 text-slate-700">
          <ShieldCheck className="h-4 w-4 text-slate-500" aria-hidden="true" />
          {datasource.sslEnabled ? 'TLS verified' : 'TLS off'}
        </span>
      ),
    },
    {
      header: 'Status',
      key: 'status',
      render: (datasource) => (
        <div>
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(datasource.status)}`}>
            {statusLabel(datasource.status)}
          </span>
          <p className="mt-1 text-xs text-slate-500">{formatTimestamp(datasource.lastConnectedAt)}</p>
        </div>
      ),
    },
    {
      className: 'w-64 text-right',
      header: 'Actions',
      key: 'actions',
      render: (datasource) => {
        const testPending = testSaved.isPending && testSaved.variables === datasource.id;
        const statusPending = updateStatus.isPending && updateStatus.variables.id === datasource.id;
        return (
          <div className="flex justify-end gap-2">
            {datasource.status === DatasourceStatus.Active ? (
              <Link
                href={`/dashboard/data-sources/${datasource.id}`}
                className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                Analyze
              </Link>
            ) : null}
            <button
              type="button"
              disabled={datasource.status === DatasourceStatus.Disabled || testPending}
              onClick={() => {
                void handleTestSaved(datasource);
              }}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testPending ? 'Testing…' : 'Test'}
            </button>
            <button
              type="button"
              disabled={statusPending}
              onClick={() => {
                void handleStatusChange(datasource);
              }}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {datasource.status === DatasourceStatus.Disabled ? 'Enable' : 'Disable'}
            </button>
            <button
              type="button"
              aria-label={`Delete ${datasource.name}`}
              onClick={() => {
                setDeleteTarget(datasource);
              }}
              className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Data Management"
        title="Data Sources"
        description="Connect and manage the MySQL data sources available to this workspace."
        action={
          <button
            type="button"
            onClick={() => {
              setShowConnectionForm(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Database className="h-4 w-4" aria-hidden="true" />
            Add MySQL connection
          </button>
        }
      />

      {showConnectForm && <section aria-labelledby="connect-mysql" className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
            <Database className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="connect-mysql" className="text-lg font-semibold text-slate-900">Connect MySQL</h2>
            <p className="mt-1 text-sm text-slate-600">Test a direct connection first, then save the verified connection to this workspace.</p>
          </div>
        </div>

        <form
          onSubmit={(event) => {
            void handleSave(event);
          }}
          className="mt-6 grid gap-4 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Display name <span className="text-red-600">*</span>
            <input
              value={form.name}
              onChange={(event) => {
                updateForm('name', event.target.value);
              }}
              maxLength={120}
              placeholder="Production MySQL"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none ring-blue-500 focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Database name <span className="text-red-600">*</span>
            <input
              value={form.databaseName}
              onChange={(event) => {
                updateForm('databaseName', event.target.value);
              }}
              maxLength={128}
              placeholder="application"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none ring-blue-500 focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
            Host <span className="text-red-600">*</span>
            <input
              value={form.host}
              onChange={(event) => {
                updateForm('host', event.target.value);
              }}
              maxLength={253}
              placeholder="mysql.example.com"
              autoCapitalize="none"
              autoCorrect="off"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none ring-blue-500 focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Port <span className="text-red-600">*</span>
            <input
              value={form.port}
              onChange={(event) => {
                updateForm('port', event.target.value);
              }}
              inputMode="numeric"
              maxLength={5}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none ring-blue-500 focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Username <span className="text-red-600">*</span>
            <input
              value={form.username}
              onChange={(event) => {
                updateForm('username', event.target.value);
              }}
              maxLength={128}
              autoCapitalize="none"
              autoComplete="username"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none ring-blue-500 focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
            Password <span className="text-red-600">*</span>
            <input
              value={form.databasePassword}
              onChange={(event) => {
                updateForm('databasePassword', event.target.value);
              }}
              type="password"
              autoComplete="new-password"
              maxLength={4096}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none ring-blue-500 focus:ring-2"
            />
            <span className="font-normal text-xs text-slate-500">Sent only to the API over this request, encrypted at rest, and never displayed after saving.</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input
              checked={form.sslEnabled}
              onChange={(event) => {
                updateForm('sslEnabled', event.target.checked);
              }}
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Use verified TLS for this MySQL connection
          </label>

          {feedback && (
            <div role="status" className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm sm:col-span-2 ${feedback.tone === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
              {feedback.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              {feedback.message}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3 sm:col-span-2">
            {datasources.data?.length ? (
              <button type="button" onClick={() => {
                setShowConnectionForm(false);
              }} className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                Cancel
              </button>
            ) : null}
            <button type="button" disabled={testCandidate.isPending} onClick={() => void handleTestConnection()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
              {testCandidate.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {testCandidate.isPending ? 'Testing connection…' : 'Test connection'}
            </button>
            <button type="submit" disabled={createDatasource.isPending} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {createDatasource.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {createDatasource.isPending ? 'Saving…' : 'Save data source'}
            </button>
          </div>
        </form>
      </section>}

      <section aria-labelledby="saved-data-sources">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 id="saved-data-sources" className="text-lg font-semibold text-slate-900">Saved data sources</h2>
            <p className="mt-1 text-sm text-slate-600">Choose Analyze to select an accessible database and compare it with a Markdown specification.</p>
          </div>
          <button type="button" onClick={() => void datasources.refetch()} disabled={datasources.isFetching} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RotateCcw className={`h-4 w-4 ${datasources.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        </div>

        {datasources.isLoading ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">Loading data sources…</p>
        ) : datasources.isError ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">{errorMessage(datasources.error, 'SchemaIQ could not load data sources.')}</p>
        ) : datasources.data?.length === 0 ? (
          <EmptyState icon={Database} title="No saved data sources" description="Add your first MySQL connection to start selecting databases and analyzing specifications." />
        ) : (
          <>
            <DataTable columns={columns} rows={datasources.data ?? []} getRowKey={(datasource) => datasource.id} />
            {Object.entries(savedTestFeedback).map(([id, result]) => (
              <p key={id} role="status" className={`mt-2 rounded-lg px-3 py-2 text-sm ${result.tone === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{result.message}</p>
            ))}
          </>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete data source?"
        description={`This permanently removes ${deleteTarget?.name ?? 'this data source'} and its encrypted credentials. This cannot be undone.`}
        confirmLabel="Delete data source"
        destructive
        onCancel={() => {
          setDeleteTarget(null);
        }}
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </div>
  );
}
