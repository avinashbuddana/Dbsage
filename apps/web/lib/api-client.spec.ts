import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, importsApi } from './api-client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('importsApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects with a friendly error when no organization is set', async () => {
    await expect(importsApi.get(null, 'import-1')).rejects.toMatchObject({ code: 'ORGANIZATION_CONTEXT_MISSING' });
  });

  it('builds the list query string and attaches the organization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], total: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    await importsApi.list('org-1', { limit: 20, page: 2, search: 'customers' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/imports?limit=20&page=2&search=customers');
    expect((init.headers as Record<string, string>)['x-organization-id']).toBe('org-1');
  });

  it('throws an ApiError built from the documented error envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ statusCode: 404, code: 'IMPORT_NOT_FOUND', message: 'Import not found', requestId: 'req-1' }, 404),
        ),
    );

    await expect(importsApi.get('org-1', 'missing')).rejects.toBeInstanceOf(ApiError);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ statusCode: 404, code: 'IMPORT_NOT_FOUND', message: 'Import not found', requestId: 'req-1' }, 404),
        ),
    );
    await expect(importsApi.get('org-1', 'missing')).rejects.toMatchObject({ code: 'IMPORT_NOT_FOUND', requestId: 'req-1' });
  });

  it('wraps a network failure in a friendly ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(importsApi.get('org-1', 'import-1')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('resolves undefined for a 204 No Content response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(importsApi.remove('org-1', 'import-1')).resolves.toBeUndefined();
  });
});

class FakeXhr {
  static instances: FakeXhr[] = [];
  method = '';
  url = '';
  status = 0;
  responseText = '';
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  requestHeaders: Record<string, string> = {};

  constructor() {
    FakeXhr.instances.push(this);
  }
  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string): void {
    this.requestHeaders[name] = value;
  }
  send(): void {
    // triggered manually by the test once it drives onprogress/onload
  }
}

describe('importsApi.uploadCsv', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeXhr.instances.length = 0;
  });

  it('uploads via XHR, reports progress, and resolves the parsed response', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const onProgress = vi.fn();
    const file = new File(['name,email\nA,a@example.com'], 'customers.csv', { type: 'text/csv' });

    const promise = importsApi.uploadCsv(
      'org-1',
      { delimiter: ',', file, targetSchema: 'public', targetTable: 'customers' },
      onProgress,
    );
    const [xhr] = FakeXhr.instances;
    if (!xhr) throw new Error('Expected an XHR instance to have been constructed');
    expect(xhr.requestHeaders['x-organization-id']).toBe('org-1');
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    xhr.status = 202;
    xhr.responseText = JSON.stringify({ id: 'import-1', status: 'QUEUED' });
    xhr.onload?.();

    const result = await promise;
    expect(onProgress).toHaveBeenCalledWith(50);
    expect(result.status).toBe(202);
    expect(result.data).toMatchObject({ id: 'import-1', status: 'QUEUED' });
  });

  it('rejects with an ApiError when the upload fails', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const file = new File(['bad'], 'bad.csv', { type: 'text/csv' });

    const promise = importsApi.uploadCsv('org-1', { delimiter: ',', file, targetSchema: 'public', targetTable: 'customers' });
    const [xhr] = FakeXhr.instances;
    if (!xhr) throw new Error('Expected an XHR instance to have been constructed');
    xhr.status = 400;
    xhr.responseText = JSON.stringify({ statusCode: 400, code: 'CSV_HEADER_INVALID', message: 'Invalid header', requestId: 'req-2' });
    xhr.onload?.();

    await expect(promise).rejects.toMatchObject({ code: 'CSV_HEADER_INVALID' });
  });
});
