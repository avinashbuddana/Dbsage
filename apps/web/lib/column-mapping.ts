import type { ImportTargetColumnResponse } from '@schemaiq/types';

import { requiredColumns } from './target-columns';

export interface ColumnMapping {
  csvHeader: string;
  sample: string;
  targetColumn: string | null;
  dataType?: string;
}

export type MappingRowStatus = 'matched' | 'review' | 'unmapped';

export function initializeMapping(csvHeaders: string[], sampleRow: string[], targetColumns: ImportTargetColumnResponse[]): ColumnMapping[] {
  const targetNames = new Set(targetColumns.map((column) => column.name));
  return csvHeaders.map((csvHeader, index) => ({
    csvHeader,
    sample: sampleRow[index] ?? '',
    targetColumn: targetNames.has(csvHeader) ? csvHeader : null,
  }));
}

export function mappingRowStatus(row: ColumnMapping): MappingRowStatus {
  if (!row.targetColumn) return 'unmapped';
  return row.targetColumn === row.csvHeader ? 'matched' : 'review';
}

export interface MappingSummary {
  matched: number;
  review: number;
  unmapped: number;
  missingRequiredColumns: string[];
}

export function summarizeMapping(mapping: ColumnMapping[], targetColumns: ImportTargetColumnResponse[]): MappingSummary {
  let matched = 0;
  let review = 0;
  let unmapped = 0;
  const mappedTargets = new Set<string>();
  for (const row of mapping) {
    const status = mappingRowStatus(row);
    if (status === 'matched') matched += 1;
    else if (status === 'review') review += 1;
    else unmapped += 1;
    if (row.targetColumn) mappedTargets.add(row.targetColumn);
  }
  const missingRequiredColumns = requiredColumns(targetColumns)
    .filter((column) => !mappedTargets.has(column.name))
    .map((column) => column.name);
  return { matched, missingRequiredColumns, review, unmapped };
}

export function mappingToColumnMapping(mapping: ColumnMapping[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of mapping) {
    if (row.targetColumn) result[row.csvHeader] = row.targetColumn;
  }
  return result;
}

export function mappingToColumnTypes(mapping: ColumnMapping[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of mapping) {
    if (row.targetColumn && row.dataType) result[row.targetColumn] = row.dataType;
  }
  return result;
}
