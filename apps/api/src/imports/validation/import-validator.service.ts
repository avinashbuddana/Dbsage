import { Injectable } from '@nestjs/common';

import type { PostgresTableMetadata } from '../postgres/postgres-import.types';
import { DatatypeTransformerService, type TransformOptions } from '../transformation/datatype-transformer.service';

export interface RowError {
  row: number;
  csvColumn: string;
  databaseColumn: string;
  value: string;
  targetType: string;
  error: string;
}

export interface RowValidationResult {
  transformed: Record<string, string | null> | null;
  errors: RowError[];
}

@Injectable()
export class ImportValidatorService {
  constructor(private readonly transformer: DatatypeTransformerService) {}

  validateRow(
    rowNumber: number,
    row: Readonly<Record<string, string>>,
    columnMapping: Readonly<Record<string, string>>,
    table: PostgresTableMetadata,
    options: TransformOptions,
  ): RowValidationResult {
    const columnsByName = new Map(table.columns.map((column) => [column.name, column]));
    const errors: RowError[] = [];
    const transformed: Record<string, string | null> = {};

    for (const [csvColumn, rawValue] of Object.entries(row)) {
      const databaseColumn = columnMapping[csvColumn];
      if (!databaseColumn) continue;
      const column = columnsByName.get(databaseColumn);
      if (!column) continue;

      const result = this.transformer.transformValue(rawValue, column, options);
      if (!result.success) {
        errors.push({
          csvColumn,
          databaseColumn,
          error: result.error,
          row: rowNumber,
          targetType: column.dataType,
          value: rawValue,
        });
        continue;
      }
      transformed[databaseColumn] = result.value;
    }

    return { errors, transformed: errors.length === 0 ? transformed : null };
  }
}
