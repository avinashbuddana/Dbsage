import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateCsvImportDto, parseColumnMapping, parseColumnTypes } from './create-import.dto';

describe('parseColumnMapping', () => {
  it('parses a small string-to-string mapping without accepting arbitrary values', () => {
    expect(parseColumnMapping('{"first_name":"firstName"}')).toEqual({
      first_name: 'firstName',
    });
  });

  it('rejects malformed JSON and non-string mapping values', () => {
    expect(() => parseColumnMapping('{')).toThrow(BadRequestException);
    expect(() => parseColumnMapping('{"first_name":true}')).toThrow(BadRequestException);
  });
});

describe('parseColumnTypes', () => {
  it('parses a small column-name-to-type mapping', () => {
    expect(parseColumnTypes('{"created_at":"timestamp"}')).toEqual({
      created_at: 'timestamp',
    });
  });

  it('defaults to an empty object when omitted', () => {
    expect(parseColumnTypes(undefined)).toEqual({});
  });

  it('rejects malformed JSON and non-string type values', () => {
    expect(() => parseColumnTypes('{')).toThrow(BadRequestException);
    expect(() => parseColumnTypes('{"created_at":123}')).toThrow(BadRequestException);
  });
});

describe('CreateCsvImportDto createTable field', () => {
  const base = { targetSchema: 'public', targetTable: 'customers' };

  it('coerces the multipart string "true" to a real boolean', async () => {
    const dto = plainToInstance(CreateCsvImportDto, { ...base, createTable: 'true' });
    expect(dto.createTable).toBe(true);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('coerces the multipart string "false" to a real boolean', async () => {
    const dto = plainToInstance(CreateCsvImportDto, { ...base, createTable: 'false' });
    expect(dto.createTable).toBe(false);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('defaults to false when the field is omitted', () => {
    const dto = plainToInstance(CreateCsvImportDto, { ...base });
    expect(dto.createTable).toBe(false);
  });
});
