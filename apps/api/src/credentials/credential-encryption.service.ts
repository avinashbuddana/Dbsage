import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { EncryptedCredentialPayload } from './credential.types';

const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_VERSION = 1;

export class CredentialEncryptionService {
  private readonly key: Buffer;

  constructor(encodedKey: string) {
    this.key = Buffer.from(encodedKey, 'base64');
    if (this.key.byteLength !== 32) throw new Error('Invalid datasource encryption key');
  }

  encrypt(plaintext: string): EncryptedCredentialPayload {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      version: ENCRYPTION_VERSION,
    };
  }

  decrypt(payload: EncryptedCredentialPayload): string {
    if (payload.version !== ENCRYPTION_VERSION) throw new Error('Unsupported encryption version');

    try {
      const iv = Buffer.from(payload.iv, 'base64');
      const authTag = Buffer.from(payload.authTag, 'base64');
      if (iv.byteLength !== 12 || authTag.byteLength !== 16) throw new Error('Invalid payload');
      const decipher = createDecipheriv(
        ALGORITHM,
        this.key,
        iv,
      );
      decipher.setAuthTag(authTag);
      return Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('Credential decryption failed');
    }
  }
}
