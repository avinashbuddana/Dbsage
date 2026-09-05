import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { DataImportStatus } from '../enums/data-import-status.enum';

export class ImportQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsEnum(DataImportStatus)
  status?: DataImportStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
