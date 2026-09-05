import { BadRequestException, Injectable } from '@nestjs/common';

import type { PostgresTableMetadata } from '../postgres/postgres-import.types';

export interface ValidatedColumnMapping {
  columnMapping: Record<string, string>;
  targetColumns: string[];
}

@Injectable()
export class PostgresColumnMappingValidator {
  validate(
    headers: readonly string[],
    mapping: Readonly<Record<string, string>> | undefined,
    table: PostgresTableMetadata,
  ): ValidatedColumnMapping {
    if (mapping && Object.keys(mapping).some((header) => !headers.includes(header))) {
      throw new BadRequestException('CSV column mapping contains an unknown header');
    }

    const columnsByName = new Map(table.columns.map((column) => [column.name, column]));
    const columnMapping: Record<string, string> = {};
    const targetColumns = headers.map((header) => {
      const target = mapping?.[header] ?? header;
      const metadata = columnsByName.get(target);
      if (!metadata) {
        throw new BadRequestException('CSV column mapping contains an unknown target column');
      }
      if (metadata.isGenerated) {
        throw new BadRequestException('CSV column mapping cannot include a generated target column');
      }
      columnMapping[header] = target;
      return target;
    });

    if (new Set(targetColumns).size !== targetColumns.length) {
      throw new BadRequestException('CSV column mapping contains duplicate target columns');
    }

    const mappedColumns = new Set(targetColumns);
    const missingRequired = table.columns.find(
      (column) =>
        !column.isNullable &&
        !column.hasDefault &&
        !column.isGenerated &&
        !column.isIdentity &&
        !mappedColumns.has(column.name),
    );
    if (missingRequired) {
      throw new BadRequestException('CSV column mapping omits a required target column');
    }

    return { columnMapping, targetColumns };
  }
}
