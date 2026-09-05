'use client';

import { DataImportStatus } from '@schemaiq/types';
import { useQuery } from '@tanstack/react-query';

import { importsApi, type ListImportsParams } from '../api-client';
import { useOrganization } from '../organization-context';

const NON_TERMINAL_STATUSES: DataImportStatus[] = [
  DataImportStatus.Uploaded,
  DataImportStatus.Validating,
  DataImportStatus.Queued,
  DataImportStatus.Processing,
];
const POLL_INTERVAL_MS = 2_500;

export function useImportsList(params: ListImportsParams) {
  const { organizationId } = useOrganization();
  return useQuery({
    enabled: Boolean(organizationId),
    queryFn: () => importsApi.list(organizationId, params),
    queryKey: ['imports', 'list', organizationId, params],
  });
}

export function useImport(id: string) {
  const { organizationId } = useOrganization();
  return useQuery({
    enabled: Boolean(organizationId) && Boolean(id),
    queryFn: ({ signal }) => importsApi.get(organizationId, id, signal),
    queryKey: ['imports', 'detail', organizationId, id],
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return POLL_INTERVAL_MS;
      return NON_TERMINAL_STATUSES.includes(status) ? POLL_INTERVAL_MS : false;
    },
  });
}

export function useImportsSummary() {
  const { organizationId } = useOrganization();
  return useQuery({
    enabled: Boolean(organizationId),
    queryFn: () => importsApi.summary(organizationId),
    queryKey: ['imports', 'summary', organizationId],
  });
}

export function useImportConfig() {
  const { organizationId } = useOrganization();
  return useQuery({
    enabled: Boolean(organizationId),
    queryFn: () => importsApi.config(organizationId),
    queryKey: ['imports', 'config', organizationId],
    staleTime: Infinity,
  });
}

export function useImportSchemas() {
  const { organizationId } = useOrganization();
  return useQuery({
    enabled: Boolean(organizationId),
    queryFn: () => importsApi.schemas(organizationId),
    queryKey: ['imports', 'targets', 'schemas', organizationId],
  });
}

export function useImportTables(schema: string | null) {
  const { organizationId } = useOrganization();
  return useQuery({
    enabled: Boolean(organizationId) && Boolean(schema),
    queryFn: () => {
      if (!schema) throw new Error('A schema is required to list its tables');
      return importsApi.tables(organizationId, schema);
    },
    queryKey: ['imports', 'targets', 'tables', organizationId, schema],
  });
}

export function useImportTableDetails(schema: string | null, table: string | null) {
  const { organizationId } = useOrganization();
  return useQuery({
    enabled: Boolean(organizationId) && Boolean(schema) && Boolean(table),
    queryFn: () => {
      if (!schema || !table) throw new Error('A schema and table are required to load column details');
      return importsApi.tableDetails(organizationId, schema, table);
    },
    queryKey: ['imports', 'targets', 'table-details', organizationId, schema, table],
  });
}
