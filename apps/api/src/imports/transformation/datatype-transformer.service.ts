import { Injectable } from '@nestjs/common';

import type { PostgresColumnMetadata } from '../postgres/postgres-import.types';
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
  type TransformResult,
} from './value-transformers';

export interface TransformOptions {
  dateFormat?: string;
  arrayDelimiter?: string;
}

const INTEGER_TYPES = new Set(['integer', 'smallint', 'bigint']);
const NUMERIC_TYPES = new Set(['numeric', 'decimal', 'real', 'double precision']);
const TEXT_TYPES = new Set(['text', 'character varying', 'character', 'citext']);
const TIMESTAMP_TYPES = new Set(['timestamp without time zone', 'timestamp with time zone']);

@Injectable()
export class DatatypeTransformerService {
  transformValue(rawValue: string, column: PostgresColumnMetadata, options: TransformOptions = {}): TransformResult {
    if (isNullToken(rawValue)) {
      if (!column.isNullable && !column.hasDefault) {
        return { error: `Column "${column.name}" does not allow null`, success: false };
      }
      return { success: true, value: null };
    }

    const dataType = column.dataType;
    if (INTEGER_TYPES.has(dataType)) return transformInteger(rawValue);
    if (NUMERIC_TYPES.has(dataType)) return transformNumeric(rawValue);
    if (dataType === 'boolean') return transformBoolean(rawValue);
    if (TEXT_TYPES.has(dataType)) return transformText(rawValue, column.characterMaximumLength);
    if (dataType === 'date') return transformDate(rawValue, options.dateFormat);
    if (TIMESTAMP_TYPES.has(dataType)) return transformTimestamp(rawValue);
    if (dataType === 'uuid') return transformUuid(rawValue);
    if (dataType === 'json' || dataType === 'jsonb') return transformJson(rawValue);
    if (dataType === 'ARRAY') {
      if (!options.arrayDelimiter) {
        return { error: 'An array delimiter must be configured for array columns', success: false };
      }
      return transformArray(rawValue, options.arrayDelimiter);
    }
    return { success: true, value: rawValue };
  }
}
