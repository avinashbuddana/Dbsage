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
      create: jest.fn((value: Partial<DatasourceSecretEntity>) =>
        Object.assign(new DatasourceSecretEntity(), value),
      ),
      save: jest.fn((value: DatasourceSecretEntity[]) => {
        const [first] = value;
        if (!first) throw new Error('expected at least one entity to save');
        stored = first;
        return Promise.resolve(value);
      }),
      find: jest.fn(() => Promise.resolve([stored])),
    };
    const provider = new EncryptedDatabaseCredentialProvider(
      repository as unknown as Repository<DatasourceSecretEntity>,
      encryption,
    );

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

    const leakedFields: Record<string, unknown> = {
      encryptedValue: expect.anything() as unknown,
      iv: expect.anything() as unknown,
      authTag: expect.anything() as unknown,
    };
    expect(instanceToPlain(entity)).not.toMatchObject(leakedFields);
  });
});
