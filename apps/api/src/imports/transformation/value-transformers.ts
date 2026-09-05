export type TransformResult = { success: true; value: string | null } | { success: false; error: string };

const NULL_TOKENS = new Set(['', 'null', 'n/a', 'na']);

export function isNullToken(rawValue: string): boolean {
  return NULL_TOKENS.has(rawValue.trim().toLowerCase());
}

export function transformInteger(raw: string): TransformResult {
  const trimmed = raw.trim();
  const value = Number(trimmed);
  if (trimmed.length === 0 || !Number.isFinite(value) || !Number.isInteger(value)) {
    return { error: `Cannot convert '${raw}' to integer`, success: false };
  }
  return { success: true, value: String(value) };
}

const NUMERIC_PATTERN = /^-?\d+(\.\d+)?$/;

export function transformNumeric(raw: string): TransformResult {
  const cleaned = raw.trim().replaceAll(',', '');
  if (!NUMERIC_PATTERN.test(cleaned)) {
    return { error: `Cannot convert '${raw}' to numeric`, success: false };
  }
  return { success: true, value: cleaned };
}

const TRUE_TOKENS = new Set(['true', '1', 'yes', 'y']);
const FALSE_TOKENS = new Set(['false', '0', 'no', 'n']);

export function transformBoolean(raw: string): TransformResult {
  const normalized = raw.trim().toLowerCase();
  if (TRUE_TOKENS.has(normalized)) return { success: true, value: 'true' };
  if (FALSE_TOKENS.has(normalized)) return { success: true, value: 'false' };
  return { error: `Cannot convert '${raw}' to boolean`, success: false };
}

export function transformText(raw: string, maxLength: number | null): TransformResult {
  if (maxLength !== null && raw.length > maxLength) {
    return { error: `Value exceeds maximum length of ${String(maxLength)}`, success: false };
  }
  return { success: true, value: raw };
}

const DATE_PATTERNS: Readonly<Record<string, RegExp>> = {
  'DD-MM-YYYY': /^(?<day>\d{2})-(?<month>\d{2})-(?<year>\d{4})$/,
  'DD/MM/YYYY': /^(?<day>\d{2})\/(?<month>\d{2})\/(?<year>\d{4})$/,
  'MM/DD/YYYY': /^(?<month>\d{2})\/(?<day>\d{2})\/(?<year>\d{4})$/,
  'YYYY-MM-DD': /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/,
};

export function transformDate(raw: string, dateFormat: string = 'YYYY-MM-DD'): TransformResult {
  const pattern = DATE_PATTERNS[dateFormat];
  if (!pattern) {
    return { error: `Unsupported date format configuration: ${dateFormat}`, success: false };
  }
  const match = pattern.exec(raw.trim());
  const groups = match?.groups;
  if (!groups) {
    return { error: `Ambiguous or invalid date format`, success: false };
  }
  const year = Number(groups.year);
  const month = Number(groups.month);
  const day = Number(groups.day);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isValidCalendarDate =
    parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  if (!isValidCalendarDate) {
    return { error: `'${raw}' is not a valid calendar date`, success: false };
  }
  return { success: true, value: `${groups.year}-${groups.month}-${groups.day}` };
}

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

export function transformTimestamp(raw: string): TransformResult {
  const trimmed = raw.trim();
  if (!ISO_TIMESTAMP_PATTERN.test(trimmed) || Number.isNaN(new Date(trimmed).getTime())) {
    return { error: `'${raw}' is not a supported ISO-8601 timestamp`, success: false };
  }
  return { success: true, value: trimmed };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function transformUuid(raw: string): TransformResult {
  const trimmed = raw.trim();
  if (!UUID_PATTERN.test(trimmed)) {
    return { error: `'${raw}' is not a valid UUID`, success: false };
  }
  return { success: true, value: trimmed.toLowerCase() };
}

export function transformJson(raw: string): TransformResult {
  try {
    const parsed: unknown = JSON.parse(raw);
    return { success: true, value: JSON.stringify(parsed) };
  } catch {
    return { error: `'${raw}' is not valid JSON`, success: false };
  }
}

export function transformArray(raw: string, delimiter: string): TransformResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { success: true, value: '{}' };
  const escaped = trimmed
    .split(delimiter)
    .map((part) => part.trim())
    .map((part) => `"${part.replaceAll('\\', String.raw`\\`).replaceAll('"', '\\"')}"`);
  return { success: true, value: `{${escaped.join(',')}}` };
}
