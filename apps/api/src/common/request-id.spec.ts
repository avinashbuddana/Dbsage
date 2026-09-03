import { getOrCreateRequestId, isSafeRequestId } from './request-id';

describe('request IDs', () => {
  it('reuses a bounded safe incoming identifier', () => {
    expect(getOrCreateRequestId('client-request_123')).toBe('client-request_123');
  });

  it('replaces unsafe incoming values with a UUID', () => {
    const requestId = getOrCreateRequestId('unsafe request id\n');

    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('rejects non-string and oversized identifiers', () => {
    expect(isSafeRequestId(['request-id'])).toBe(false);
    expect(isSafeRequestId('a'.repeat(129))).toBe(false);
  });
});
