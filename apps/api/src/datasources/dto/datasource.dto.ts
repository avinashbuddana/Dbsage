import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
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

// A bare hostname or IPv4/IPv6 literal only — rejects URL schemes (http://, mysql://),
// filesystem paths, and shell metacharacters at the DTO boundary, ahead of DNS resolution.
// The leading ':' is required for compressed IPv6 literals such as '::1' or '::ffff:10.0.0.1'.
const HOST_PATTERN = /^[A-Za-z0-9:][A-Za-z0-9.:-]*$/;
const HOST_VALIDATION_MESSAGE = 'host must be a hostname or IP address, not a URL or path';

export class SshConnectionDto {
  @IsString()
  @Length(1, 253)
  @Matches(HOST_PATTERN, { message: HOST_VALIDATION_MESSAGE })
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
  @Matches(HOST_PATTERN, { message: HOST_VALIDATION_MESSAGE })
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
  @Matches(HOST_PATTERN, { message: HOST_VALIDATION_MESSAGE })
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
