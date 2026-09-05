import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse';
import { extname } from 'node:path';
import { Readable } from 'node:stream';

import { AppConfigService } from '../../config/app-config.service';
import { DataImportEntity } from '../entities/data-import.entity';
import { DataImportMode } from '../enums/data-import-mode.enum';
import { PostgresIdentifierService } from '../postgres/postgres-identifier.service';
import type { PostgresCopyResult } from '../postgres/postgres-copy.service';
import { PostgresCopyService } from '../postgres/postgres-copy.service';
import type { PostgresTableMetadata } from '../postgres/postgres-import.types';
import { PostgresTableMetadataService } from '../postgres/postgres-table-metadata.service';
import { IMPORT_FILE_STORAGE, type ImportFileStorage } from '../storage/import-file-storage.interface';
import type { TransformOptions } from '../transformation/datatype-transformer.service';
import { ImportValidatorService, type RowError } from '../validation/import-validator.service';
import { RowValidationException } from '../validation/row-validation.error';
import { CsvHeaderValidator } from '../validators/csv-header.validator';
import {
  PostgresColumnMappingValidator,
  type ValidatedColumnMapping,
} from '../validators/postgres-column-mapping.validator';

const ALLOWED_MIME_TYPES = new Set(['application/csv', 'text/csv', 'text/plain']);

export interface PreparedCsvImport {
  copyCommand: string;
  columnMapping: Record<string, string>;
  targetColumns: string[];
  headers: string[];
  table: PostgresTableMetadata;
}

export interface ProcessedCsvImport extends PostgresCopyResult {
  rowErrors: RowError[];
}

@Injectable()
export class CsvImportProcessor {
  constructor(
    @Inject(IMPORT_FILE_STORAGE) private readonly storage: ImportFileStorage,
    private readonly headers: CsvHeaderValidator,
    private readonly metadata: PostgresTableMetadataService,
    private readonly mapping: PostgresColumnMappingValidator,
    private readonly identifiers: PostgresIdentifierService,
    private readonly copy: PostgresCopyService,
    private readonly config: AppConfigService,
    private readonly validator: ImportValidatorService,
  ) {}

  async prepare(
    importEntity: DataImportEntity,
    createTable = false,
    columnTypes: Readonly<Record<string, string>> = {},
  ): Promise<PreparedCsvImport> {
    await this.validateFile(importEntity);
    const headers = await this.headers.readHeaders(
      this.storage.openReadStream(importEntity.storedFileReference),
      importEntity.delimiter,
    );
    if (createTable) {
      await this.ensureTargetTable(importEntity, headers, columnTypes);
    }
    const table = await this.metadata.getTable(importEntity.targetSchema, importEntity.targetTable);
    const mapping = this.mapping.validate(headers, importEntity.columnMapping, table);
    return {
      columnMapping: mapping.columnMapping,
      copyCommand: this.copyCommand(table, mapping),
      headers,
      table,
      targetColumns: mapping.targetColumns,
    };
  }

  private async ensureTargetTable(
    importEntity: DataImportEntity,
    headers: readonly string[],
    columnTypes: Readonly<Record<string, string>>,
  ): Promise<void> {
    const exists = await this.metadata.tableExists(importEntity.targetSchema, importEntity.targetTable);
    if (exists) return;
    const columns = headers.map((header) => {
      const name = importEntity.columnMapping[header] ?? header;
      return { name, type: columnTypes[name] ?? 'text' };
    });
    await this.metadata.createTable(importEntity.targetSchema, importEntity.targetTable, columns);
  }

  async process(
    importEntity: DataImportEntity,
    prepared: PreparedCsvImport,
    onProgress?: (processedBytes: number) => Promise<void> | void,
  ): Promise<ProcessedCsvImport> {
    const rowErrors: RowError[] = [];
    const source = this.buildTransformedSource(importEntity, prepared, rowErrors);
    const result = await this.copy.copy({ command: prepared.copyCommand, onProgress, source });
    return { ...result, rowErrors };
  }

  private buildTransformedSource(
    importEntity: DataImportEntity,
    prepared: PreparedCsvImport,
    rowErrors: RowError[],
  ): Readable {
    const options: TransformOptions = {
      arrayDelimiter: importEntity.arrayDelimiter ?? undefined,
      dateFormat: importEntity.dateFormat ?? undefined,
    };
    const strict = importEntity.importMode === DataImportMode.Strict;
    const rawSource = this.storage.openReadStream(importEntity.storedFileReference);
    const parser: AsyncIterable<Record<string, string>> = rawSource.pipe(
      parse({ columns: prepared.headers, delimiter: importEntity.delimiter, from_line: 2, relax_column_count: false }),
    );

    const validator = this.validator;
    const targetColumns = prepared.targetColumns;
    const columnMapping = prepared.columnMapping;
    const table = prepared.table;

    async function* generate(): AsyncGenerator<string> {
      let rowNumber = 1;
      for await (const record of parser) {
        rowNumber += 1;
        const result = validator.validateRow(rowNumber, record, columnMapping, table, options);
        if (result.transformed) {
          yield toCopyLine(result.transformed, targetColumns);
          continue;
        }
        if (strict) {
          throw new RowValidationException(result.errors);
        }
        rowErrors.push(...result.errors);
      }
    }

    return Readable.from(generate());
  }

  private async validateFile(importEntity: DataImportEntity): Promise<void> {
    if (!importEntity.hasHeader) {
      throw new BadRequestException('CSV imports require a header row');
    }
    if (extname(importEntity.originalFileName).toLowerCase() !== '.csv') {
      throw new BadRequestException('Import file must use the .csv extension');
    }
    if (!ALLOWED_MIME_TYPES.has(importEntity.mimeType)) {
      throw new BadRequestException('Import file MIME type is not allowed');
    }
    if (Number(importEntity.fileSizeBytes) > this.config.csvImport.maxFileSizeBytes) {
      throw new BadRequestException('Import file exceeds the maximum size');
    }
    if (!this.config.csvImport.allowedDelimiters.includes(importEntity.delimiter)) {
      throw new BadRequestException('CSV delimiter is not allowed');
    }
    if (!(await this.storage.exists(importEntity.storedFileReference))) {
      throw new BadRequestException('Import file is no longer available');
    }
  }

  private copyCommand(table: PostgresTableMetadata, mapping: ValidatedColumnMapping): string {
    const schema = this.identifiers.quote(table.schema, [table.schema]);
    const tableName = this.identifiers.quote(table.table, [table.table]);
    const knownColumns = table.columns.map((column) => column.name);
    const columns = mapping.targetColumns
      .map((column) => this.identifiers.quote(column, knownColumns))
      .join(', ');
    return `COPY ${schema}.${tableName} (${columns}) FROM STDIN WITH (FORMAT csv)`;
  }
}

function toCopyLine(transformed: Readonly<Record<string, string | null>>, targetColumns: readonly string[]): string {
  return `${targetColumns.map((column) => escapeCsvField(transformed[column] ?? null)).join(',')}\n`;
}

function escapeCsvField(value: string | null): string {
  if (value === null) return '';
  if (value === '') return '""';
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}
