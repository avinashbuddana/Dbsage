import { BadRequestException } from '@nestjs/common';

import type { PostgresTableMetadata } from '../postgres/postgres-import.types';
import { PostgresColumnMappingValidator } from './postgres-column-mapping.validator';

const table: PostgresTableMetadata = {
  columns: [
    {
      characterMaximumLength: null,
      dataType: 'uuid',
      hasDefault: true,
      isGenerated: false,
      isIdentity: false,
      isNullable: false,
      name: 'id',
    },
    {
      characterMaximumLength: null,
      dataType: 'text',
      hasDefault: false,
      isGenerated: false,
      isIdentity: false,
      isNullable: false,
      name: 'name',
    },
    {
      characterMaximumLength: null,
      dataType: 'text',
      hasDefault: false,
      isGenerated: true,
      isIdentity: false,
      isNullable: false,
      name: 'normalized_name',
    },
  ],
  schema: 'public',
  table: 'customer_records',
};

describe('PostgresColumnMappingValidator', () => {
  const validator = new PostgresColumnMappingValidator();

  it('uses exact header matches and leaves defaulted target columns out of COPY', () => {
    expect(validator.validate(['name'], undefined, table)).toEqual({
      columnMapping: { name: 'name' },
      targetColumns: ['name'],
    });
  });

  it('maps input headers to existing target columns in CSV order', () => {
    expect(validator.validate(['full_name'], { full_name: 'name' }, table)).toEqual({
      columnMapping: { full_name: 'name' },
      targetColumns: ['name'],
    });
  });

  it('rejects arbitrary, duplicate, generated, and missing-required targets', () => {
    expect(() =>
      validator.validate(['name'], { name: 'name; DROP TABLE users' }, table),
    ).toThrow(BadRequestException);
    expect(() => validator.validate(['one', 'two'], { one: 'name', two: 'name' }, table)).toThrow(
      BadRequestException,
    );
    expect(() =>
      validator.validate(['normalized_name'], undefined, table),
    ).toThrow(BadRequestException);
    expect(() => validator.validate(['id'], undefined, table)).toThrow(BadRequestException);
  });
});
