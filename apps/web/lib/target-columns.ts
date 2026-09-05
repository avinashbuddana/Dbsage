import type { ImportTargetColumnResponse } from '@schemaiq/types';

export function isRequiredColumn(column: ImportTargetColumnResponse): boolean {
  return !column.isNullable && !column.hasDefault && !column.isGenerated && !column.isIdentity;
}

export function requiredColumns(columns: ImportTargetColumnResponse[]): ImportTargetColumnResponse[] {
  return columns.filter(isRequiredColumn);
}
