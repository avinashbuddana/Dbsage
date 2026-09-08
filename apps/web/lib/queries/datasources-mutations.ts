'use client';

import type { DatasourceSpecAnalysisInput, DatasourceSpecChatInput, DatasourceStatus } from '@schemaiq/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { datasourcesApi, type MysqlDatasourceInput } from '../api-client';
import { useOrganization } from '../organization-context';

function useInvalidateDatasources() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['datasources'] });
}

export function useCreateDatasource() {
  const { organizationId } = useOrganization();
  const invalidate = useInvalidateDatasources();
  return useMutation({
    mutationFn: (input: MysqlDatasourceInput) => datasourcesApi.create(organizationId, input),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useDeleteDatasource() {
  const { organizationId } = useOrganization();
  const invalidate = useInvalidateDatasources();
  return useMutation({
    mutationFn: (id: string) => datasourcesApi.remove(organizationId, id),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useTestDatasourceCandidate() {
  const { organizationId } = useOrganization();
  return useMutation({
    mutationFn: (input: Omit<MysqlDatasourceInput, 'name'>) =>
      datasourcesApi.testCandidate(organizationId, input),
  });
}

export function useTestSavedDatasource() {
  const { organizationId } = useOrganization();
  const invalidate = useInvalidateDatasources();
  return useMutation({
    mutationFn: (id: string) => datasourcesApi.testSaved(organizationId, id),
    onSettled: () => {
      void invalidate();
    },
  });
}

export function useUpdateDatasourceStatus() {
  const { organizationId } = useOrganization();
  const invalidate = useInvalidateDatasources();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: DatasourceStatus.Active | DatasourceStatus.Disabled }) =>
      datasourcesApi.updateStatus(organizationId, id, status),
    onSettled: () => {
      void invalidate();
    },
  });
}

export function useDatasourceSpecChat(datasourceId: string) {
  const { organizationId } = useOrganization();
  return useMutation({
    mutationFn: (input: DatasourceSpecChatInput) =>
      datasourcesApi.specChat(organizationId, datasourceId, input),
  });
}

export function useGenerateDatasourceQuery(datasourceId: string) {
  const { organizationId } = useOrganization();
  return useMutation({
    mutationFn: (question: string) => datasourcesApi.generateQuery(organizationId, datasourceId, { question }),
  });
}

export function useCreateDatasourceSpecAnalysis(datasourceId: string) {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DatasourceSpecAnalysisInput) =>
      datasourcesApi.createSpecAnalysis(organizationId, datasourceId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['datasources', 'spec-analysis', 'latest', organizationId, datasourceId],
      });
    },
  });
}

export function useBuildDatasourceKnowledge(datasourceId: string) {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ specificationId, versionId }: { specificationId: string; versionId: string }) =>
      datasourcesApi.buildKnowledge(organizationId, datasourceId, specificationId, versionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['datasources', 'knowledge'] });
    },
  });
}

export function useRefreshDatasourceKnowledge(datasourceId: string) {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => datasourcesApi.refreshKnowledge(organizationId, datasourceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['datasources', 'compatibility'] });
      void queryClient.invalidateQueries({ queryKey: ['datasources', 'findings'] });
      void queryClient.invalidateQueries({ queryKey: ['datasources', 'knowledge'] });
    },
  });
}
