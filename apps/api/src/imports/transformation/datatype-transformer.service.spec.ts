import type { PostgresColumnMetadata } from '../postgres/postgres-import.types';
import { DatatypeTransformerService } from './datatype-transformer.service';

function column(overrides: Partial<PostgresColumnMetadata> = {}): PostgresColumnMetadata {
  return {
    characterMaximumLength: null,
    dataType: 'text',
    hasDefault: false,
    isGenerated: false,
    isIdentity: false,
    isNullable: false,
    name: 'value',
    ...overrides,
  };
}

describe('DatatypeTransformerService', () => {
  const service = new DatatypeTransformerService();

  it('dispatches to the integer transformer for integer columns', () => {
    expect(service.transformValue('42', column({ dataType: 'integer' }))).toEqual({ success: true, value: '42' });
  });

  it('dispatches to the numeric transformer for numeric columns', () => {
    expect(service.transformValue('1,200.50', column({ dataType: 'numeric' }))).toEqual({
      success: true,
      value: '1200.50',
    });
  });

  it('dispatches to the boolean transformer for boolean columns', () => {
    expect(service.transformValue('YES', column({ dataType: 'boolean' }))).toEqual({ success: true, value: 'true' });
  });

  it('dispatches to the text transformer, respecting max length', () => {
    const result = service.transformValue('hello world', column({ characterMaximumLength: 5, dataType: 'character varying' }));
    expect(result.success).toBe(false);
  });

  it('dispatches to the date transformer using the configured date format', () => {
    expect(service.transformValue('05/09/2026', column({ dataType: 'date' }), { dateFormat: 'DD/MM/YYYY' })).toEqual({
      success: true,
      value: '2026-09-05',
    });
  });

  it('dispatches to the uuid transformer for uuid columns', () => {
    expect(service.transformValue('not-a-uuid', column({ dataType: 'uuid' })).success).toBe(false);
  });

  it('dispatches to the json transformer for jsonb columns', () => {
    expect(service.transformValue('{"a":1}', column({ dataType: 'jsonb' }))).toEqual({
      success: true,
      value: '{"a":1}',
    });
  });

  it('requires an array delimiter to be configured for array columns', () => {
    const result = service.transformValue('a|b', column({ dataType: 'ARRAY' }));
    expect(result.success).toBe(false);
  });

  it('dispatches to the array transformer once a delimiter is configured', () => {
    expect(service.transformValue('a|b', column({ dataType: 'ARRAY' }), { arrayDelimiter: '|' })).toEqual({
      success: true,
      value: '{"a","b"}',
    });
  });

  it('treats a null token as null when the column is nullable', () => {
    expect(service.transformValue('', column({ dataType: 'integer', isNullable: true }))).toEqual({
      success: true,
      value: null,
    });
  });

  it('rejects a null token when the column is required with no default', () => {
    const result = service.transformValue('', column({ dataType: 'integer', hasDefault: false, isNullable: false }));
    expect(result.success).toBe(false);
  });

  it('allows a null token when the column has a default even if not nullable', () => {
    expect(service.transformValue('', column({ dataType: 'integer', hasDefault: true, isNullable: false }))).toEqual({
      success: true,
      value: null,
    });
  });

  it('passes through a value unchanged for a column type it does not have an explicit rule for', () => {
    expect(service.transformValue('anything', column({ dataType: 'inet' }))).toEqual({
      success: true,
      value: 'anything',
    });
  });
});
