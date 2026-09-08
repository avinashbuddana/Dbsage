'use client';

import {
  DatasourceKnowledgeStaleness,
  DatasourceKnowledgeVersionStatus,
  type DatabaseSpecFindingSeverity,
  type DatabaseSpecFindingStatus,
  type DatabaseSpecFindingType,
} from '@schemaiq/types';
import { useQuery } from '@tanstack/react-query';

import { datasourcesApi, type ListDatasourceFindingsParams } from '../api-client';
import { useOrganization } from '../organization-context';

const NON_TERMINAL_SPEC_ANALYSIS_STATUSES = new Set(['QUEUED', 'PROCESSING']);
const SPEC_ANALYSIS_POLL_INTERVAL_MS = 2_500;
const KNOWLEDGE_POLL_INTERVAL_MS = 2_500;

export interface DatasourceFindingsQuery extends ListDatasourceFindingsParams {
  findingType?: DatabaseSpecFindingType;
  severity?: DatabaseSpecFindingSeverity;
  status?: DatabaseSpecFindingStatus;
}

export function useDatasources() {
  const { organizationId } = useOrganization();

  return useQuery({
    enabled: Boolean(organizationId),
    queryFn: () => datasourcesApi.list(organizationId),
    queryKey: ['datasources', 'list', organizationId],
  });
}

export function useDatasourceDatabases(datasourceId: string) {
  const { organizationId } = useOrganization();

  return useQuery({
    enabled: Boolean(organizationId && datasourceId),
    queryFn: () => datasourcesApi.databases(organizationId, datasourceId),
    queryKey: ['datasources', 'databases', organizationId, datasourceId],
  });
}

export function useLatestDatasourceSpecAnalysis(datasourceId: string) {
  const { organizationId } = useOrganization();

  return useQuery({
    enabled: Boolean(organizationId && datasourceId),
    queryFn: ({ signal }) => datasourcesApi.latestSpecAnalysis(organizationId, datasourceId, signal),
    queryKey: ['datasources', 'spec-analysis', 'latest', organizationId, datasourceId],
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return !status || NON_TERMINAL_SPEC_ANALYSIS_STATUSES.has(status)
        ? SPEC_ANALYSIS_POLL_INTERVAL_MS
        : false;
    },
  });
}

export function useDatasourceCompatibility(
  datasourceId: string,
  specificationId: string | null | undefined,
  specificationVersionId: string | null | undefined,
) {
  const { organizationId } = useOrganization();

  return useQuery({
    enabled: Boolean(organizationId && datasourceId && specificationId && specificationVersionId),
    queryFn: ({ signal }) => {
      if (!specificationId || !specificationVersionId) {
        throw new Error('A completed specification analysis is required');
      }
      return datasourcesApi.compatibility(
        organizationId,
        datasourceId,
        specificationId,
        specificationVersionId,
        signal,
      );
    },
    queryKey: ['datasources', 'compatibility', organizationId, datasourceId, specificationId, specificationVersionId],
  });
}

export function useDatasourceFindings(
  datasourceId: string,
  specificationId: string | null | undefined,
  specificationVersionId: string | null | undefined,
  params: DatasourceFindingsQuery,
) {
  const { organizationId } = useOrganization();

  return useQuery({
    enabled: Boolean(organizationId && datasourceId && specificationId && specificationVersionId),
    queryFn: ({ signal }) => {
      if (!specificationId || !specificationVersionId) {
        throw new Error('A completed specification analysis is required');
      }
      return datasourcesApi.findings(
        organizationId,
        datasourceId,
        specificationId,
        specificationVersionId,
        params,
        signal,
      );
    },
    queryKey: ['datasources', 'findings', organizationId, datasourceId, specificationId, specificationVersionId, params],
  });
}

export function useDatasourceKnowledgeStatus(datasourceId: string) {
  const { organizationId } = useOrganization();

  return useQuery({
    enabled: Boolean(organizationId && datasourceId),
    queryFn: ({ signal }) => datasourcesApi.knowledgeStatus(organizationId, datasourceId, signal),
    queryKey: ['datasources', 'knowledge', 'status', organizationId, datasourceId],
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      const staleness = query.state.data?.staleness;
      return status === DatasourceKnowledgeVersionStatus.Building || staleness === DatasourceKnowledgeStaleness.Rebuilding
        ? KNOWLEDGE_POLL_INTERVAL_MS
        : false;
    },
  });
}
