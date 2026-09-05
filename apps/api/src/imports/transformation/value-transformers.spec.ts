import {
  isNullToken,
  transformArray,
  transformBoolean,
  transformDate,
  transformInteger,
  transformJson,
  transformNumeric,
  transformText,
  transformTimestamp,
  transformUuid,
} from './value-transformers';

describe('isNullToken', () => {
  it.each(['', 'NULL', 'null', 'N/A', 'na', '  '])('treats %j as a null token', (value) => {
    expect(isNullToken(value)).toBe(true);
  });

  it('does not treat an ordinary value as a null token', () => {
    expect(isNullToken('Ada')).toBe(false);
  });
});

describe('transformInteger', () => {
  it('converts a plain integer string', () => {
    expect(transformInteger('123')).toEqual({ success: true, value: '123' });
  });

  it('accepts a whole-number float like 123.0', () => {
    expect(transformInteger('123.0')).toEqual({ success: true, value: '123' });
  });

  it('rejects a non-numeric value', () => {
    const result = transformInteger('abc');
    expect(result.success).toBe(false);
  });

  it('rejects a fractional value', () => {
    const result = transformInteger('12.45');
    expect(result.success).toBe(false);
  });
});

describe('transformNumeric', () => {
  it('parses a plain decimal', () => {
    expect(transformNumeric('123.45')).toEqual({ success: true, value: '123.45' });
  });

  it('strips thousands separators', () => {
    expect(transformNumeric('1,250.50')).toEqual({ success: true, value: '1250.50' });
  });

  it('accepts a whole number', () => {
    expect(transformNumeric('1250')).toEqual({ success: true, value: '1250' });
  });

  it('rejects a non-numeric value', () => {
    expect(transformNumeric('abc').success).toBe(false);
  });
});

describe('transformBoolean', () => {
  it.each([
    ['true', 'true'],
    ['TRUE', 'true'],
    ['1', 'true'],
    ['yes', 'true'],
    ['y', 'true'],
    ['false', 'false'],
    ['FALSE', 'false'],
    ['0', 'false'],
    ['no', 'false'],
    ['n', 'false'],
  ])('converts %j to %j', (input, expected) => {
    expect(transformBoolean(input)).toEqual({ success: true, value: expected });
  });

  it('rejects an unrecognized value', () => {
    expect(transformBoolean('maybe').success).toBe(false);
  });
});

describe('transformText', () => {
  it('passes a value through unchanged when under the limit', () => {
    expect(transformText('hello', 10)).toEqual({ success: true, value: 'hello' });
  });

  it('passes through unchanged when there is no limit', () => {
    expect(transformText('hello', null)).toEqual({ success: true, value: 'hello' });
  });

  it('rejects a value exceeding the maximum length instead of truncating', () => {
    const result = transformText('hello world', 5);
    expect(result.success).toBe(false);
  });
});

describe('transformDate', () => {
  it('parses YYYY-MM-DD by default', () => {
    expect(transformDate('2026-09-05')).toEqual({ success: true, value: '2026-09-05' });
  });

  it('parses DD/MM/YYYY when configured', () => {
    expect(transformDate('05/09/2026', 'DD/MM/YYYY')).toEqual({ success: true, value: '2026-09-05' });
  });

  it('parses MM/DD/YYYY when configured', () => {
    expect(transformDate('09/05/2026', 'MM/DD/YYYY')).toEqual({ success: true, value: '2026-09-05' });
  });

  it('rejects a date in the wrong format for the configured pattern', () => {
    expect(transformDate('2026-09-05', 'DD/MM/YYYY').success).toBe(false);
  });

  it('rejects an invalid calendar date', () => {
    expect(transformDate('2026-02-30').success).toBe(false);
  });
});

describe('transformTimestamp', () => {
  it('accepts an ISO-8601 timestamp with a timezone offset', () => {
    expect(transformTimestamp('2026-09-05T10:30:00Z')).toEqual({ success: true, value: '2026-09-05T10:30:00Z' });
  });

  it('rejects a non-ISO timestamp', () => {
    expect(transformTimestamp('05/09/2026 10:30 AM').success).toBe(false);
  });
});

describe('transformUuid', () => {
  it('accepts and lowercases a valid UUID', () => {
    expect(transformUuid('550E8400-E29B-41D4-A716-446655440000')).toEqual({
      success: true,
      value: '550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('rejects a malformed UUID', () => {
    expect(transformUuid('not-a-uuid').success).toBe(false);
  });
});

describe('transformJson', () => {
  it('parses and normalizes valid JSON', () => {
    expect(transformJson('{"name":"Avinash"}')).toEqual({ success: true, value: '{"name":"Avinash"}' });
  });

  it('rejects malformed JSON', () => {
    expect(transformJson('{name: Avinash}').success).toBe(false);
  });
});

describe('transformArray', () => {
  it('builds a Postgres array literal from a delimited value', () => {
    expect(transformArray('red|green|blue', '|')).toEqual({ success: true, value: '{"red","green","blue"}' });
  });

  it('returns an empty array literal for an empty value', () => {
    expect(transformArray('', '|')).toEqual({ success: true, value: '{}' });
  });
});
