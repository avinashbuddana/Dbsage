import type {
  ConnectionTestResult,
  DatabaseSpecFindingSeverity,
  DatabaseSpecFindingStatus,
  DatabaseSpecFindingType,
  DataImportApiResponse,
  DataImportMode,
  DataImportRowErrorResponse,
  DataImportStatus,
  DataImportSummaryResponse,
  ImportClientConfigurationResponse,
  ImportTargetDetailsResponse,
  ImportTargetSchemaResponse,
  ImportTargetTableResponse,
  PaginatedDataImportsResponse,
  DatasourceConnectionMode,
  DatasourceDatabaseResponse,
  DatasourceCompatibilityResponse,
  DatabaseCopilotResponse,
  DatasourceKnowledgeStatusResponse,
  DatasourceKnowledgeVersionResponse,
  DatasourceSpecAnalysisInput,
  DatasourceSpecAnalysisResponse,
  DatasourceResponse,
  DatasourceSpecChatInput,
  DatasourceSpecChatResponse,
  DatasourceStatus,
  DatasourceType,
  PaginatedDatasourceSpecificationFindingsResponse,
} from '@schemaiq/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export interface ApiErrorPreviousImport {
  fileName: string;
  importedAt: string;
  totalRows: string | null;
  successfulRows: string;
  failedRows: string;
}

export interface ApiErrorPayload {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  existingImportId?: string;
  fileHash?: string;
  previousImport?: ApiErrorPreviousImport;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly requestId: string;
  readonly existingImportId?: string;
  readonly fileHash?: string;
  readonly previousImport?: ApiErrorPreviousImport;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.statusCode = payload.statusCode;
    this.code = payload.code;
    this.requestId = payload.requestId;
    this.existingImportId = payload.existingImportId;
    this.fileHash = payload.fileHash;
    this.previousImport = payload.previousImport;
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
      cache: 'no-store',
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
      existingImportId: errorPayload?.existingImportId,
      fileHash: errorPayload?.fileHash,
      message: errorPayload?.message ?? 'Something went wrong. Please try again.',
      previousImport: errorPayload?.previousImport,
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
  columnTypes?: Record<string, string>;
  createTable?: boolean;
  importMode?: DataImportMode;
  dateFormat?: string;
  arrayDelimiter?: string;
}

export interface CreateImportResult {
  status: number;
  data: DataImportApiResponse;
}

export interface ListDatasourceFindingsParams {
  page: number;
  limit: number;
  findingType?: DatabaseSpecFindingType;
  severity?: DatabaseSpecFindingSeverity;
  status?: DatabaseSpecFindingStatus;
}

export interface MysqlDatasourceInput {
  name: string;
  databaseType: DatasourceType.MySql;
  connectionMode: DatasourceConnectionMode.Direct;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  databasePassword: string;
  sslEnabled: boolean;
}

export const importsApi = {
  cancel(organizationId: string | null, id: string): Promise<DataImportApiResponse> {
    return apiFetch(`/imports/${id}/cancel`, { method: 'POST', organizationId });
  },

  config(organizationId: string | null): Promise<ImportClientConfigurationResponse> {
    return apiFetch('/imports/config', { organizationId });
  },

  errors(organizationId: string | null, id: string): Promise<DataImportRowErrorResponse[]> {
    return apiFetch(`/imports/${id}/errors`, { organizationId });
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
    if (input.columnTypes) formData.set('columnTypes', JSON.stringify(input.columnTypes));
    if (input.createTable) formData.set('createTable', 'true');
    if (input.importMode) formData.set('importMode', input.importMode);
    if (input.dateFormat) formData.set('dateFormat', input.dateFormat);
    if (input.arrayDelimiter) formData.set('arrayDelimiter', input.arrayDelimiter);

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
            existingImportId: errorPayload?.existingImportId,
            fileHash: errorPayload?.fileHash,
            message: errorPayload?.message ?? 'The upload could not be completed.',
            previousImport: errorPayload?.previousImport,
            requestId: errorPayload?.requestId ?? 'unknown',
            statusCode: errorPayload?.statusCode ?? xhr.status,
          }),
        );
      };
      xhr.send(formData);
    });
  },
};

export const datasourcesApi = {
  buildKnowledge(
    organizationId: string | null,
    datasourceId: string,
    specificationId: string,
    versionId: string,
  ): Promise<DatasourceKnowledgeVersionResponse> {
    return apiFetch(
      `/datasources/${datasourceId}/specifications/${specificationId}/versions/${versionId}/knowledge/build`,
      { method: 'POST', organizationId },
    );
  },

  compatibility(
    organizationId: string | null,
    datasourceId: string,
    specificationId: string,
    versionId: string,
    signal?: AbortSignal,
  ): Promise<DatasourceCompatibilityResponse> {
    return apiFetch(
      `/datasources/${datasourceId}/specifications/${specificationId}/versions/${versionId}/compatibility`,
      { organizationId, signal },
    );
  },

  createSpecAnalysis(
    organizationId: string | null,
    id: string,
    input: DatasourceSpecAnalysisInput,
  ): Promise<DatasourceSpecAnalysisResponse> {
    return apiFetch(`/datasources/${id}/spec-analyses`, {
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      organizationId,
    });
  },

  generateQuery(
    organizationId: string | null,
    datasourceId: string,
    input: { question: string },
  ): Promise<DatabaseCopilotResponse> {
    return apiFetch(`/datasources/${datasourceId}/query/generate`, {
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      organizationId,
    });
  },

  databases(organizationId: string | null, id: string): Promise<DatasourceDatabaseResponse[]> {
    return apiFetch(`/datasources/${id}/databases`, { organizationId });
  },

  create(organizationId: string | null, input: MysqlDatasourceInput): Promise<DatasourceResponse> {
    return apiFetch('/datasources', {
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      organizationId,
    });
  },

  findings(
    organizationId: string | null,
    datasourceId: string,
    specificationId: string,
    versionId: string,
    params: ListDatasourceFindingsParams,
    signal?: AbortSignal,
  ): Promise<PaginatedDatasourceSpecificationFindingsResponse> {
    const query = buildQuery({
      findingType: params.findingType,
      limit: params.limit,
      page: params.page,
      severity: params.severity,
      status: params.status,
    });
    return apiFetch(
      `/datasources/${datasourceId}/specifications/${specificationId}/versions/${versionId}/findings${query}`,
      { organizationId, signal },
    );
  },

  knowledgeStatus(
    organizationId: string | null,
    datasourceId: string,
    signal?: AbortSignal,
  ): Promise<DatasourceKnowledgeStatusResponse> {
    return apiFetch(`/datasources/${datasourceId}/knowledge/status`, { organizationId, signal });
  },

  list(organizationId: string | null): Promise<DatasourceResponse[]> {
    return apiFetch('/datasources', { organizationId });
  },

  latestSpecAnalysis(
    organizationId: string | null,
    id: string,
    signal?: AbortSignal,
  ): Promise<DatasourceSpecAnalysisResponse | null> {
    return apiFetch(`/datasources/${id}/spec-analyses/latest`, { organizationId, signal });
  },

  refreshKnowledge(
    organizationId: string | null,
    datasourceId: string,
  ): Promise<DatasourceCompatibilityResponse> {
    return apiFetch(`/datasources/${datasourceId}/knowledge/refresh`, {
      method: 'POST',
      organizationId,
    });
  },

  remove(organizationId: string | null, id: string): Promise<void> {
    return apiFetch(`/datasources/${id}`, { method: 'DELETE', organizationId });
  },

  specChat(
    organizationId: string | null,
    id: string,
    input: DatasourceSpecChatInput,
  ): Promise<DatasourceSpecChatResponse> {
    return apiFetch(`/datasources/${id}/spec-chat`, {
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      organizationId,
    });
  },

  testCandidate(
    organizationId: string | null,
    input: Omit<MysqlDatasourceInput, 'name'>,
  ): Promise<ConnectionTestResult> {
    return apiFetch('/datasources/test-connection', {
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      organizationId,
    });
  },

  testSaved(organizationId: string | null, id: string): Promise<ConnectionTestResult> {
    return apiFetch(`/datasources/${id}/test`, { method: 'POST', organizationId });
  },

  updateStatus(
    organizationId: string | null,
    id: string,
    status: DatasourceStatus.Active | DatasourceStatus.Disabled,
  ): Promise<DatasourceResponse> {
    return apiFetch(`/datasources/${id}`, {
      body: JSON.stringify({ status }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
      organizationId,
    });
  },
};
