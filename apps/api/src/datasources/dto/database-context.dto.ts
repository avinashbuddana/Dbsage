import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { DatabaseContextPurpose } from '@schemaiq/types';

export class DatabaseContextSearchDto {
  @IsString()
  @Length(1, 1_000)
  query!: string;

  @IsEnum(DatabaseContextPurpose)
  purpose!: DatabaseContextPurpose;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @Length(1, 128, { each: true })
  @Type(() => String)
  requestedTables?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @IsString({ each: true })
  @Length(1, 128, { each: true })
  @Type(() => String)
  requestedColumns?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @Length(1, 128, { each: true })
  @Type(() => String)
  requestedConcepts?: string[];
}

export class DatabaseAnalyzeDto extends DatabaseContextSearchDto {}
