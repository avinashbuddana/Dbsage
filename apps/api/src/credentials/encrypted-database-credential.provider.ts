import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type EntityManager, type Repository } from 'typeorm';

import type { DatasourceSecretType } from '../datasources/enums/datasource.enums';
import type {
  CredentialProvider,
  DatasourceSecrets,
} from './credential-provider.interface';
import { CredentialEncryptionService } from './credential-encryption.service';
import { DatasourceSecretEntity } from './datasource-secret.entity';

@Injectable()
export class EncryptedDatabaseCredentialProvider implements CredentialProvider {
  constructor(
    @InjectRepository(DatasourceSecretEntity)
    private readonly repository: Repository<DatasourceSecretEntity>,
    private readonly encryption: CredentialEncryptionService,
  ) {}

  async saveCredentials(
    datasourceId: string,
    credentials: DatasourceSecrets,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getRepository(manager);
    const entities = this.entries(credentials).map(([type, plaintext]) => {
      const encrypted = this.encryption.encrypt(plaintext);
      return repository.create({
        datasourceId,
        type,
        encryptedValue: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptionVersion: encrypted.version,
      });
    });
    await repository.save(entities);
  }

  async getCredentials(datasourceId: string, manager?: EntityManager): Promise<DatasourceSecrets> {
    const rows = await this.getRepository(manager).find({
      where: { datasourceId },
      select: {
        type: true,
        encryptedValue: true,
        iv: true,
        authTag: true,
        encryptionVersion: true,
      },
    });
    return Object.fromEntries(
      rows.map((row) => [
        row.type,
        this.encryption.decrypt({
          ciphertext: row.encryptedValue,
          iv: row.iv,
          authTag: row.authTag,
          version: row.encryptionVersion,
        }),
      ]),
    );
  }

  async updateCredentials(
    datasourceId: string,
    credentials: DatasourceSecrets,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getRepository(manager);
    const rows = this.entries(credentials).map(([type, plaintext]) => {
      const encrypted = this.encryption.encrypt(plaintext);
      return repository.create({
        datasourceId,
        type,
        encryptedValue: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptionVersion: encrypted.version,
      });
    });
    await repository.upsert(rows, ['datasourceId', 'type']);
  }

  async deleteCredentials(
    datasourceId: string,
    manager?: EntityManager,
    types?: readonly DatasourceSecretType[],
  ): Promise<void> {
    await this.getRepository(manager).delete({
      datasourceId,
      ...(types ? { type: In(types) } : {}),
    });
  }

  private getRepository(manager?: EntityManager): Repository<DatasourceSecretEntity> {
    return manager?.getRepository(DatasourceSecretEntity) ?? this.repository;
  }

  private entries(credentials: DatasourceSecrets): [DatasourceSecretType, string][] {
    return Object.entries(credentials) as [DatasourceSecretType, string][];
  }
}
