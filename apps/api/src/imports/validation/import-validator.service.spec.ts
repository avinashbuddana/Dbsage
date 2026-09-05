import type { PostgresColumnMetadata, PostgresTableMetadata } from '../postgres/postgres-import.types';
import { DatatypeTransformerService } from '../transformation/datatype-transformer.service';
import { ImportValidatorService } from './import-validator.service';

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

const table: PostgresTableMetadata = {
  columns: [
    column({ dataType: 'text', name: 'name' }),
    column({ dataType: 'integer', name: 'age' }),
    column({ dataType: 'boolean', isNullable: true, name: 'active' }),
  ],
  schema: 'public',
  table: 'customers',
};

describe('ImportValidatorService', () => {
  const service = new ImportValidatorService(new DatatypeTransformerService());

  it('transforms every mapped column when all values are valid', () => {
    const result = service.validateRow(
      2,
      { Active: 'yes', Age: '25', Name: 'Ada' },
      { Active: 'active', Age: 'age', Name: 'name' },
      table,
      {},
    );

    expect(result.errors).toEqual([]);
    expect(result.transformed).toEqual({ active: 'true', age: '25', name: 'Ada' });
  });

  it('collects a row-level error identifying the row, columns, value, and target type', () => {
    const result = service.validateRow(24, { Age: 'twenty', Name: 'Ada' }, { Age: 'age', Name: 'name' }, table, {});

    expect(result.transformed).toBeNull();
    expect(result.errors).toEqual([
      {
        csvColumn: 'Age',
        databaseColumn: 'age',
        error: "Cannot convert 'twenty' to integer",
        row: 24,
        targetType: 'integer',
        value: 'twenty',
      },
    ]);
  });

  it('ignores CSV columns that are not part of the mapping', () => {
    const result = service.validateRow(2, { Name: 'Ada', Notes: 'ignored' }, { Name: 'name' }, table, {});

    expect(result.errors).toEqual([]);
    expect(result.transformed).toEqual({ name: 'Ada' });
  });

  it('reports every invalid column in a row, not just the first', () => {
    const result = service.validateRow(
      5,
      { Active: 'maybe', Age: 'twenty', Name: 'Ada' },
      { Active: 'active', Age: 'age', Name: 'name' },
      table,
      {},
    );

    expect(result.transformed).toBeNull();
    expect(result.errors).toHaveLength(2);
    expect(result.errors.map((error) => error.databaseColumn).sort()).toEqual(['active', 'age']);
  });
});
