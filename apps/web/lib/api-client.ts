import type {
  DataImportApiResponse,
  DataImportStatus,
  DataImportSummaryResponse,
  ImportClientConfigurationResponse,
  ImportTargetDetailsResponse,
  ImportTargetSchemaResponse,
  ImportTargetTableResponse,
  PaginatedDataImportsResponse,
} from '@schemaiq/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export interface ApiErrorPayload {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly requestId: string;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.statusCode = payload.statusCode;
    this.code = payload.code;
    this.requestId = payload.requestId;
  }
}

const ORGANIZATION_CONTEXT_MISSING: ApiErrorPayload = {
  statusCode: 401,
  code: 'ORGANIZATION_CONTEXT_MISSING',
  message: 'Set your development organization ID to continue.',
  requestId: 'local',
};

interface RequestOptions {
  method?: string;
  organizationId: string | null;
  body?: BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function apiFetch<T>(path: string, options: RequestOptions): Promise<T> {
  if (!options.organizationId) throw new ApiError(ORGANIZATION_CONTEXT_MISSING);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      body: options.body,
      headers: { 'x-organization-id': options.organizationId, ...options.headers },
      method: options.method ?? 'GET',
      signal: options.signal,
    });
  } catch {
    throw new ApiError({
      code: 'NETWORK_ERROR',
      message: 'SchemaIQ could not reach the server. Check your connection and try again.',
      requestId: 'local',
      statusCode: 0,
    });
  }

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const errorPayload = payload as Partial<ApiErrorPayload> | null;
    throw new ApiError({
      code: errorPayload?.code ?? 'UNKNOWN_ERROR',
      message: errorPayload?.message ?? 'Something went wrong. Please try again.',
      requestId: errorPayload?.requestId ?? 'unknown',
      statusCode: errorPayload?.statusCode ?? response.status,
    });
  }

  return payload as T;
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export interface ListImportsParams {
  page: number;
  limit: number;
  status?: DataImportStatus;
  search?: string;
}

export interface CreateImportInput {
  file: File;
  targetSchema: string;
  targetTable: string;
  delimiter: string;
  columnMapping?: Record<string, string>;
}

export interface CreateImportResult {
  status: number;
  data: DataImportApiResponse;
}

export const importsApi = {
  cancel(organizationId: string | null, id: string): Promise<DataImportApiResponse> {
    return apiFetch(`/imports/${id}/cancel`, { method: 'POST', organizationId });
  },

  config(organizationId: string | null): Promise<ImportClientConfigurationResponse> {
    return apiFetch('/imports/config', { organizationId });
  },

  get(organizationId: string | null, id: string, signal?: AbortSignal): Promise<DataImportApiResponse> {
    return apiFetch(`/imports/${id}`, { organizationId, signal });
  },

  list(organizationId: string | null, params: ListImportsParams): Promise<PaginatedDataImportsResponse> {
    const query = buildQuery({ limit: params.limit, page: params.page, search: params.search, status: params.status });
    return apiFetch(`/imports${query}`, { organizationId });
  },

  remove(organizationId: string | null, id: string): Promise<void> {
    return apiFetch(`/imports/${id}`, { method: 'DELETE', organizationId });
  },

  retry(organizationId: string | null, id: string): Promise<DataImportApiResponse> {
    return apiFetch(`/imports/${id}/retry`, { method: 'POST', organizationId });
  },

  schemas(organizationId: string | null): Promise<ImportTargetSchemaResponse[]> {
    return apiFetch('/imports/targets/schemas', { organizationId });
  },

  summary(organizationId: string | null): Promise<DataImportSummaryResponse> {
    return apiFetch('/imports/summary', { organizationId });
  },

  tableDetails(organizationId: string | null, schema: string, table: string): Promise<ImportTargetDetailsResponse> {
    return apiFetch(`/imports/targets/schemas/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}`, {
      organizationId,
    });
  },

  tables(organizationId: string | null, schema: string): Promise<ImportTargetTableResponse[]> {
    return apiFetch(`/imports/targets/schemas/${encodeURIComponent(schema)}/tables`, { organizationId });
  },

  uploadCsv(
    organizationId: string | null,
    input: CreateImportInput,
    onProgress?: (percent: number) => void,
  ): Promise<CreateImportResult> {
    if (!organizationId) return Promise.reject(new ApiError(ORGANIZATION_CONTEXT_MISSING));

    const formData = new FormData();
    formData.set('file', input.file);
    formData.set('targetSchema', input.targetSchema);
    formData.set('targetTable', input.targetTable);
    formData.set('delimiter', input.delimiter);
    if (input.columnMapping) formData.set('columnMapping', JSON.stringify(input.columnMapping));

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE_URL}/imports/csv`);
      xhr.setRequestHeader('x-organization-id', organizationId);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onerror = () => {
        reject(
          new ApiError({
            code: 'NETWORK_ERROR',
            message: 'SchemaIQ could not reach the server. Check your connection and try again.',
            requestId: 'local',
            statusCode: 0,
          }),
        );
      };
      xhr.onload = () => {
        let payload: unknown = null;
        try {
          payload = JSON.parse(xhr.responseText);
        } catch {
          payload = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ data: payload as DataImportApiResponse, status: xhr.status });
          return;
        }
        const errorPayload = payload as Partial<ApiErrorPayload> | null;
        reject(
          new ApiError({
            code: errorPayload?.code ?? 'UNKNOWN_ERROR',
            message: errorPayload?.message ?? 'The upload could not be completed.',
            requestId: errorPayload?.requestId ?? 'unknown',
            statusCode: errorPayload?.statusCode ?? xhr.status,
          }),
        );
      };
      xhr.send(formData);
    });
  },
};
