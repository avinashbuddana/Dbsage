import { randomUUID } from 'node:crypto';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function isSafeRequestId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_REQUEST_ID.test(value);
}

export function getOrCreateRequestId(value: unknown): string {
  return isSafeRequestId(value) ? value : randomUUID();
}
