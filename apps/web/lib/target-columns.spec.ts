import type { ImportTargetColumnResponse } from '@schemaiq/types';
import { describe, expect, it } from 'vitest';

import { isRequiredColumn, requiredColumns } from './target-columns';

function column(overrides: Partial<ImportTargetColumnResponse> = {}): ImportTargetColumnResponse {
  return {
    dataType: 'text',
    hasDefault: false,
    isGenerated: false,
    isIdentity: false,
    isNullable: false,
    name: 'value',
    ...overrides,
  };
}

describe('isRequiredColumn', () => {
  it('is required when not nullable, no default, not generated, and not an identity column', () => {
    expect(isRequiredColumn(column())).toBe(true);
  });

  it('is not required when nullable', () => {
    expect(isRequiredColumn(column({ isNullable: true }))).toBe(false);
  });

  it('is not required when it has a default', () => {
    expect(isRequiredColumn(column({ hasDefault: true }))).toBe(false);
  });

  it('is not required when generated', () => {
    expect(isRequiredColumn(column({ isGenerated: true }))).toBe(false);
  });

  it('is not required when an identity column', () => {
    expect(isRequiredColumn(column({ isIdentity: true }))).toBe(false);
  });
});

describe('requiredColumns', () => {
  it('filters to only the required columns', () => {
    const columns = [column({ name: 'a' }), column({ isNullable: true, name: 'b' })];
    expect(requiredColumns(columns).map((entry) => entry.name)).toEqual(['a']);
  });
});
