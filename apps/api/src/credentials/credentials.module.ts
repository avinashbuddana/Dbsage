import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppConfigService } from '../config/app-config.service';
import { CREDENTIAL_PROVIDER } from './credential-provider.interface';
import { CredentialEncryptionService } from './credential-encryption.service';
import { DatasourceSecretEntity } from './datasource-secret.entity';
import { EncryptedDatabaseCredentialProvider } from './encrypted-database-credential.provider';

@Module({
  imports: [TypeOrmModule.forFeature([DatasourceSecretEntity])],
  providers: [
    {
      provide: CredentialEncryptionService,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new CredentialEncryptionService(config.datasourceEncryptionKey),
    },
    EncryptedDatabaseCredentialProvider,
    {
      provide: CREDENTIAL_PROVIDER,
      useExisting: EncryptedDatabaseCredentialProvider,
    },
  ],
  exports: [CREDENTIAL_PROVIDER, CredentialEncryptionService],
})
export class CredentialsModule {}
