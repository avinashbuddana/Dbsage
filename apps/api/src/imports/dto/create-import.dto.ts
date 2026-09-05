import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateCsvImportDto {
  @IsString()
  @Length(1, 63)
  targetSchema!: string;

  @IsString()
  @Length(1, 63)
  targetTable!: string;

  @IsOptional()
  @IsString()
  @Length(1, 1)
  delimiter = ',';

  @IsOptional()
  @IsString()
  @MaxLength(16_384)
  columnMapping?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16_384)
  columnTypes?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  createTable = false;
}

function parseStringRecord(value: string | undefined, invalidJsonMessage: string, invalidShapeMessage: string): Record<string, string> {
  if (value === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new BadRequestException(invalidJsonMessage);
  }
  if (!isRecord(parsed) || Array.isArray(parsed)) {
    throw new BadRequestException(invalidShapeMessage);
  }
  const entries = Object.entries(parsed);
  if (
    entries.length > 1_000 ||
    entries.some(
      ([key, entryValue]) =>
        key.length === 0 || key.length > 1_024 || typeof entryValue !== 'string' || entryValue.length === 0 || entryValue.length > 1_024,
    )
  ) {
    throw new BadRequestException(invalidShapeMessage);
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

export function parseColumnMapping(value: string | undefined): Record<string, string> {
  return parseStringRecord(value, 'CSV column mapping must be valid JSON', 'CSV column mapping is invalid');
}

export function parseColumnTypes(value: string | undefined): Record<string, string> {
  return parseStringRecord(value, 'CSV column types must be valid JSON', 'CSV column types are invalid');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
