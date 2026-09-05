import { IsString, Length } from 'class-validator';

export class ImportTargetSchemaParamsDto {
  @IsString()
  @Length(1, 63)
  schema!: string;
}

export class ImportTargetTableParamsDto extends ImportTargetSchemaParamsDto {
  @IsString()
  @Length(1, 63)
  table!: string;
}
