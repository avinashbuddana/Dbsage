import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  DatasourceConnectionMode,
  DatasourceStatus,
  DatasourceType,
  SshAuthenticationType,
} from '../enums/datasource.enums';

export class SshConnectionDto {
  @IsString()
  @Length(1, 253)
  host!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  port = 22;

  @IsString()
  @Length(1, 128)
  username!: string;

  @IsEnum(SshAuthenticationType)
  authenticationType!: SshAuthenticationType;

  @ValidateIf((value: SshConnectionDto) => value.authenticationType === SshAuthenticationType.Password)
  @IsString()
  @MinLength(1)
  @MaxLength(4_096)
  password?: string;

  @ValidateIf(
    (value: SshConnectionDto) => value.authenticationType === SshAuthenticationType.PrivateKey,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(32_768)
  privateKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4_096)
  privateKeyPassphrase?: string;
}

export class TestDatasourceConnectionDto {
  @IsEnum(DatasourceType)
  databaseType!: DatasourceType;

  @IsIn([DatasourceConnectionMode.Direct, DatasourceConnectionMode.SshTunnel])
  connectionMode!: DatasourceConnectionMode;

  @IsString()
  @Length(1, 253)
  host!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  port = 3306;

  @IsString()
  @Length(1, 128)
  databaseName!: string;

  @IsString()
  @Length(1, 128)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4_096)
  databasePassword!: string;

  @IsBoolean()
  sslEnabled = false;

  @IsOptional()
  @ValidateNested()
  @Type(() => SshConnectionDto)
  ssh?: SshConnectionDto;
}

export class CreateDatasourceDto extends TestDatasourceConnectionDto {
  @IsString()
  @Length(1, 120)
  name!: string;
}

export class UpdateDatasourceDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsIn([DatasourceConnectionMode.Direct, DatasourceConnectionMode.SshTunnel])
  connectionMode?: DatasourceConnectionMode;

  @IsOptional()
  @IsString()
  @Length(1, 253)
  host?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  port?: number;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  databaseName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4_096)
  databasePassword?: string;

  @IsOptional()
  @IsBoolean()
  sslEnabled?: boolean;

  @IsOptional()
  @IsIn([DatasourceStatus.Active, DatasourceStatus.Disabled])
  status?: DatasourceStatus.Active | DatasourceStatus.Disabled;

  @IsOptional()
  @ValidateNested()
  @Type(() => SshConnectionDto)
  ssh?: SshConnectionDto;
}
