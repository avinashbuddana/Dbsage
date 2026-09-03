import { instanceToPlain } from 'class-transformer';
import type { Repository } from 'typeorm';

import { DatasourceSecretType } from '../datasources/enums/datasource.enums';
import { CredentialEncryptionService } from './credential-encryption.service';
import { DatasourceSecretEntity } from './datasource-secret.entity';
import { EncryptedDatabaseCredentialProvider } from './encrypted-database-credential.provider';

describe('EncryptedDatabaseCredentialProvider', () => {
  const datasourceId = crypto.randomUUID();
  const encryption = new CredentialEncryptionService(Buffer.alloc(32, 3).toString('base64'));

  it('persists encrypted fields and retrieves decrypted typed secrets', async () => {
    let stored!: DatasourceSecretEntity;
    const repository = {
      create: jest.fn((value) => Object.assign(new DatasourceSecretEntity(), value)),
      save: jest.fn(async (value) => {
        stored = Array.isArray(value) ? value[0] : value;
        return value;
      }),
      find: jest.fn(async () => [stored]),
    } as unknown as Repository<DatasourceSecretEntity>;
    const provider = new EncryptedDatabaseCredentialProvider(repository, encryption);

    await provider.saveCredentials(datasourceId, {
      [DatasourceSecretType.DatabasePassword]: 'database-password',
    });
    const result = await provider.getCredentials(datasourceId);

    expect(stored.encryptedValue).not.toContain('database-password');
    expect(result[DatasourceSecretType.DatabasePassword]).toBe('database-password');
  });

  it('excludes every encrypted payload field from serialization', () => {
    const entity = Object.assign(new DatasourceSecretEntity(), {
      id: crypto.randomUUID(),
      datasourceId,
      type: DatasourceSecretType.DatabasePassword,
      encryptedValue: 'ciphertext',
      iv: 'iv',
      authTag: 'tag',
      encryptionVersion: 1,
    });

    expect(instanceToPlain(entity)).not.toMatchObject({
      encryptedValue: expect.anything(),
      iv: expect.anything(),
      authTag: expect.anything(),
    });
  });
});
