'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { importsApi, type CreateImportInput } from '../api-client';
import { useOrganization } from '../organization-context';

export function useRetryImport() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => importsApi.retry(organizationId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
  });
}

export function useCancelImport() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => importsApi.cancel(organizationId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
  });
}

export function useDeleteImport() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => importsApi.remove(organizationId, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
  });
}

export function useCreateImport() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { input: CreateImportInput; onProgress?: (percent: number) => void }) =>
      importsApi.uploadCsv(organizationId, args.input, args.onProgress),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
  });
}
