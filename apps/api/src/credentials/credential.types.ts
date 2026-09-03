export interface EncryptedCredentialPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  version: number;
}
