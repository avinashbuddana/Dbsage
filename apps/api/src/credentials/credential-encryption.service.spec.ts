import { CredentialEncryptionService } from './credential-encryption.service';

describe('CredentialEncryptionService', () => {
  const key = Buffer.alloc(32, 11).toString('base64');

  it('round-trips a secret without returning plaintext fields', () => {
    const service = new CredentialEncryptionService(key);
    const encrypted = service.encrypt('database-password');

    expect(service.decrypt(encrypted)).toBe('database-password');
    expect(JSON.stringify(encrypted)).not.toContain('database-password');
    expect(encrypted.version).toBe(1);
  });

  it('uses a unique IV for every encryption', () => {
    const service = new CredentialEncryptionService(key);

    expect(service.encrypt('same').iv).not.toBe(service.encrypt('same').iv);
  });

  it.each(['ciphertext', 'authTag'] as const)('rejects a tampered %s', (field) => {
    const service = new CredentialEncryptionService(key);
    const encrypted = service.encrypt('database-password');
    const tampered = {
      ...encrypted,
      [field]: Buffer.from('tampered-value').toString('base64'),
    };

    expect(() => service.decrypt(tampered)).toThrow('Credential decryption failed');
  });
});
