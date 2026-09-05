import { BadRequestException } from '@nestjs/common';

import { PostgresIdentifierService } from './postgres-identifier.service';

describe('PostgresIdentifierService', () => {
  const identifiers = new PostgresIdentifierService();

  it('quotes identifiers only after metadata validation', () => {
    expect(identifiers.quote('customer"name', ['customer"name'])).toBe('"customer""name"');
  });

  it('rejects arbitrary SQL masquerading as an identifier', () => {
    expect(() => identifiers.quote('users; DROP TABLE users', ['users'])).toThrow(
      BadRequestException,
    );
  });

  it('accepts a new identifier made only of letters, digits, and underscores', () => {
    expect(identifiers.validateNewIdentifier('full_name_2')).toBe('full_name_2');
  });

  it('rejects a new identifier containing anything outside the safe character set', () => {
    expect(() => identifiers.validateNewIdentifier('full name')).toThrow(BadRequestException);
    expect(() => identifiers.validateNewIdentifier('name"; DROP TABLE users; --')).toThrow(
      BadRequestException,
    );
    expect(() => identifiers.validateNewIdentifier('1name')).toThrow(BadRequestException);
    expect(() => identifiers.validateNewIdentifier('')).toThrow(BadRequestException);
  });
});
