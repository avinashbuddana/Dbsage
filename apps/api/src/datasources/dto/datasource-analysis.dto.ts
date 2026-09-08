import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  DatabaseSpecFindingSeverity,
  DatabaseSpecFindingStatus,
  DatabaseSpecFindingType,
} from '../knowledge/datasource-knowledge.enums';

export class DatasourceSpecChatMessageDto {
  @IsIn(['assistant', 'user'])
  role!: 'assistant' | 'user';

  @IsString()
  @Length(1, 4_000)
  content!: string;
}

export class DatasourceSpecChatDto {
  @IsString()
  @Length(1, 128)
  databaseName!: string;

  @IsString()
  @Length(1, 15 * 1024 * 1024)
  specification!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => DatasourceSpecChatMessageDto)
  messages!: DatasourceSpecChatMessageDto[];
}

export class DatasourceSpecAnalysisDto {
  @IsString()
  @Length(1, 128)
  databaseName!: string;

  @IsString()
  @Length(1, 15 * 1024 * 1024)
  specification!: string;
}

export class DatasourceFindingQueryDto {
  @IsOptional()
  @IsIn(Object.values(DatabaseSpecFindingType))
  findingType?: string;

  @IsOptional()
  @IsIn(Object.values(DatabaseSpecFindingSeverity))
  severity?: string;

  @IsOptional()
  @IsIn(Object.values(DatabaseSpecFindingStatus))
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
