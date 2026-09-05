import { describe, expect, it } from 'vitest';

import { dedupeColumnNames, isValidNewColumnName, sanitizeColumnName } from './column-name';

describe('isValidNewColumnName', () => {
  it('accepts letters, digits, and underscores starting with a letter or underscore', () => {
    expect(isValidNewColumnName('full_name_2')).toBe(true);
    expect(isValidNewColumnName('_private')).toBe(true);
  });

  it('rejects anything outside the safe character set', () => {
    expect(isValidNewColumnName('full name')).toBe(false);
    expect(isValidNewColumnName('1name')).toBe(false);
    expect(isValidNewColumnName('name"; DROP TABLE users; --')).toBe(false);
    expect(isValidNewColumnName('')).toBe(false);
  });
});

describe('sanitizeColumnName', () => {
  it('lowercases and replaces invalid characters with underscores', () => {
    expect(sanitizeColumnName('Full Name')).toBe('full_name');
    expect(sanitizeColumnName('E-mail Address!')).toBe('e_mail_address_');
  });

  it('prefixes a leading digit with an underscore', () => {
    expect(sanitizeColumnName('2026_revenue')).toBe('_2026_revenue');
  });

  it('falls back to an underscore for a header with no safe characters', () => {
    expect(sanitizeColumnName('???')).toBe('___');
  });
});

describe('dedupeColumnNames', () => {
  it('leaves unique names untouched', () => {
    expect(dedupeColumnNames(['name', 'email'])).toEqual(['name', 'email']);
  });

  it('suffixes repeated names to keep them unique', () => {
    expect(dedupeColumnNames(['name', 'name', 'name'])).toEqual(['name', 'name_2', 'name_3']);
  });
});
