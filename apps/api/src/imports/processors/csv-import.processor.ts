import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { extname } from 'node:path';

import { AppConfigService } from '../../config/app-config.service';
import { DataImportEntity } from '../entities/data-import.entity';
import { PostgresIdentifierService } from '../postgres/postgres-identifier.service';
import type { PostgresCopyResult } from '../postgres/postgres-copy.service';
import { PostgresCopyService } from '../postgres/postgres-copy.service';
import type { PostgresTableMetadata } from '../postgres/postgres-import.types';
import { PostgresTableMetadataService } from '../postgres/postgres-table-metadata.service';
import { IMPORT_FILE_STORAGE, type ImportFileStorage } from '../storage/import-file-storage.interface';
import { CsvHeaderValidator } from '../validators/csv-header.validator';
import {
  PostgresColumnMappingValidator,
  type ValidatedColumnMapping,
} from '../validators/postgres-column-mapping.validator';

const ALLOWED_MIME_TYPES = new Set(['application/csv', 'text/csv', 'text/plain']);

export interface PreparedCsvImport {
  copyCommand: string;
  columnMapping: Record<string, string>;
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
      copyCommand: this.copyCommand(table, mapping, importEntity.delimiter),
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

  process(
    importEntity: DataImportEntity,
    prepared: PreparedCsvImport,
    onProgress?: (processedBytes: number) => Promise<void> | void,
  ): Promise<PostgresCopyResult> {
    return this.copy.copy({
      command: prepared.copyCommand,
      onProgress,
      source: this.storage.openReadStream(importEntity.storedFileReference),
    });
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

  private copyCommand(
    table: PostgresTableMetadata,
    mapping: ValidatedColumnMapping,
    delimiter: string,
  ): string {
    const schema = this.identifiers.quote(table.schema, [table.schema]);
    const tableName = this.identifiers.quote(table.table, [table.table]);
    const knownColumns = table.columns.map((column) => column.name);
    const columns = mapping.targetColumns
      .map((column) => this.identifiers.quote(column, knownColumns))
      .join(', ');
    const delimiterLiteral = delimiter.replaceAll("'", "''");
    return `COPY ${schema}.${tableName} (${columns}) FROM STDIN WITH (FORMAT csv, HEADER true, DELIMITER '${delimiterLiteral}')`;
  }
}
