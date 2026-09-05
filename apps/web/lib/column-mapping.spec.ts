import type { ImportTargetColumnResponse } from '@schemaiq/types';
import { describe, expect, it } from 'vitest';

import { initializeMapping, mappingRowStatus, mappingToColumnMapping, mappingToColumnTypes, summarizeMapping } from './column-mapping';

const targetColumns: ImportTargetColumnResponse[] = [
  { dataType: 'text', hasDefault: false, isGenerated: false, isIdentity: false, isNullable: false, name: 'email' },
  { dataType: 'text', hasDefault: false, isGenerated: false, isIdentity: false, isNullable: false, name: 'last_name' },
  { dataType: 'uuid', hasDefault: true, isGenerated: false, isIdentity: false, isNullable: false, name: 'id' },
];

describe('initializeMapping', () => {
  it('auto-matches CSV headers that exactly match a target column name and leaves the rest unmapped', () => {
    const mapping = initializeMapping(['email', 'surname'], ['john@example.com', 'Smith'], targetColumns);
    expect(mapping).toEqual([
      { csvHeader: 'email', sample: 'john@example.com', targetColumn: 'email' },
      { csvHeader: 'surname', sample: 'Smith', targetColumn: null },
    ]);
  });
});

describe('mappingRowStatus', () => {
  it('is matched when the csv header equals its target column', () => {
    expect(mappingRowStatus({ csvHeader: 'email', sample: '', targetColumn: 'email' })).toBe('matched');
  });

  it('is review when mapped to a differently named target column', () => {
    expect(mappingRowStatus({ csvHeader: 'surname', sample: '', targetColumn: 'last_name' })).toBe('review');
  });

  it('is unmapped when there is no target column', () => {
    expect(mappingRowStatus({ csvHeader: 'unknown_code', sample: '', targetColumn: null })).toBe('unmapped');
  });
});

describe('summarizeMapping', () => {
  it('counts matched, review, and unmapped rows', () => {
    const mapping = [
      { csvHeader: 'email', sample: '', targetColumn: 'email' },
      { csvHeader: 'surname', sample: '', targetColumn: 'last_name' },
      { csvHeader: 'unknown_code', sample: '', targetColumn: null },
    ];

    expect(summarizeMapping(mapping, targetColumns)).toEqual({ matched: 1, missingRequiredColumns: [], review: 1, unmapped: 1 });
  });

  it('reports a required target column with no mapping', () => {
    const mapping = [{ csvHeader: 'email', sample: '', targetColumn: 'email' }];

    expect(summarizeMapping(mapping, targetColumns).missingRequiredColumns).toEqual(['last_name']);
  });
});

describe('mappingToColumnMapping', () => {
  it('converts to a csvHeader-to-targetColumn record, omitting unmapped rows', () => {
    const mapping = [
      { csvHeader: 'email', sample: '', targetColumn: 'email' },
      { csvHeader: 'unknown_code', sample: '', targetColumn: null },
    ];

    expect(mappingToColumnMapping(mapping)).toEqual({ email: 'email' });
  });
});

describe('mappingToColumnTypes', () => {
  it('converts to a targetColumn-to-dataType record, omitting rows without a type or target column', () => {
    const mapping = [
      { csvHeader: 'created_at', sample: '', targetColumn: 'created_at', dataType: 'timestamp' },
      { csvHeader: 'name', sample: '', targetColumn: 'name', dataType: 'text' },
      { csvHeader: 'unknown_code', sample: '', targetColumn: null },
    ];

    expect(mappingToColumnTypes(mapping)).toEqual({ created_at: 'timestamp', name: 'text' });
  });
});
