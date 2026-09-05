import { BadRequestException, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse';
import type { Readable } from 'node:stream';

import { AppConfigService } from '../../config/app-config.service';

@Injectable()
export class CsvHeaderValidator {
  constructor(private readonly config: AppConfigService) {}

  async readHeaders(source: Readable, delimiter: string): Promise<string[]> {
    const parser = source.pipe(
      parse({
        bom: true,
        delimiter,
        relax_column_count: false,
        skip_empty_lines: false,
        to_line: 1,
      }),
    );
    try {
      for await (const record of parser) {
        if (!Array.isArray(record) || record.length === 0) {
          throw new BadRequestException('CSV header is invalid');
        }
        const headers = record.map((value) => String(value));
        this.validate(headers);
        return headers;
      }
      throw new BadRequestException('CSV header is required');
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('CSV header is invalid');
    } finally {
      source.destroy();
      parser.destroy();
    }
  }

  private validate(headers: readonly string[]): void {
    if (headers.length > this.config.csvImport.maxColumns) {
      throw new BadRequestException('CSV header exceeds the maximum column count');
    }
    if (headers.some((header) => header.trim().length === 0)) {
      throw new BadRequestException('CSV header contains an empty column name');
    }
    if (headers.some((header) => header.length > this.config.csvImport.maxHeaderLength)) {
      throw new BadRequestException('CSV header exceeds the maximum length');
    }
    if (new Set(headers).size !== headers.length) {
      throw new BadRequestException('CSV header contains duplicate column names');
    }
  }
}
