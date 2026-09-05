const SAFE_COLUMN_NAME = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
const INVALID_CHARS = /[^a-z0-9_]/g;
const LEADING_DIGIT = /^[0-9]/;

export function isValidNewColumnName(name: string): boolean {
  return SAFE_COLUMN_NAME.test(name);
}

export function sanitizeColumnName(header: string): string {
  const base = header.trim().toLowerCase().replaceAll(INVALID_CHARS, '_') || '_';
  const prefixed = LEADING_DIGIT.test(base) ? `_${base}` : base;
  return prefixed.slice(0, 63);
}

export function dedupeColumnNames(names: string[]): string[] {
  const counts = new Map<string, number>();
  return names.map((name) => {
    const seen = counts.get(name) ?? 0;
    counts.set(name, seen + 1);
    return seen === 0 ? name : `${name}_${String(seen + 1)}`;
  });
}

export const NEW_TABLE_COLUMN_TYPES = [
  { label: 'Text', value: 'text' },
  { label: 'Integer', value: 'integer' },
  { label: 'Big integer', value: 'bigint' },
  { label: 'Numeric', value: 'numeric' },
  { label: 'Boolean', value: 'boolean' },
  { label: 'Date', value: 'date' },
  { label: 'Timestamp', value: 'timestamp' },
  { label: 'Timestamp with time zone', value: 'timestamptz' },
  { label: 'UUID', value: 'uuid' },
] as const;

export const DEFAULT_NEW_TABLE_COLUMN_TYPE = 'text';
