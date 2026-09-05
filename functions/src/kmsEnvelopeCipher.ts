import {randomBytes, createCipheriv, createDecipheriv} from 'node:crypto';
import {KeyManagementServiceClient} from '@google-cloud/kms';

import type {EncryptedEnvelope, EnvelopeCipher} from './vault';

const decodeKmsBytes = (value: Uint8Array | string | null | undefined): Buffer => {
  if (!value) throw new Error('Cloud KMS returned no ciphertext');
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
};

export class GoogleKmsEnvelopeCipher implements EnvelopeCipher {
  constructor(
    private readonly kms: KeyManagementServiceClient,
    private readonly kmsKeyName: string,
  ) {
    if (!kmsKeyName) throw new Error('KMS_KEY_NAME is required');
  }

  async encrypt(
    plaintext: string,
    associatedData: string,
  ): Promise<EncryptedEnvelope> {
    const dek = randomBytes(32);
    const iv = randomBytes(12);
    try {
      const cipher = createCipheriv('aes-256-gcm', dek, iv);
      cipher.setAAD(Buffer.from(associatedData, 'utf8'));
      const ciphertext = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();
      const [kmsResponse] = await this.kms.encrypt({
        name: this.kmsKeyName,
        plaintext: dek,
      });
      return {
        version: 1,
        algorithm: 'AES-256-GCM+KMS',
        kmsKeyName: this.kmsKeyName,
        encryptedDekBase64: decodeKmsBytes(kmsResponse.ciphertext).toString('base64'),
        ivBase64: iv.toString('base64'),
        ciphertextBase64: ciphertext.toString('base64'),
        authTagBase64: authTag.toString('base64'),
      };
    } finally {
      dek.fill(0);
    }
  }

  async decrypt(
    envelope: EncryptedEnvelope,
    associatedData: string,
  ): Promise<string> {
    if (
      envelope.version !== 1 ||
      envelope.algorithm !== 'AES-256-GCM+KMS' ||
      envelope.kmsKeyName !== this.kmsKeyName
    ) {
      throw new Error('Unsupported vault envelope');
    }
    const [kmsResponse] = await this.kms.decrypt({
      name: this.kmsKeyName,
      ciphertext: Buffer.from(envelope.encryptedDekBase64, 'base64'),
    });
    const dek = decodeKmsBytes(kmsResponse.plaintext);
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        dek,
        Buffer.from(envelope.ivBase64, 'base64'),
      );
      decipher.setAAD(Buffer.from(associatedData, 'utf8'));
      decipher.setAuthTag(Buffer.from(envelope.authTagBase64, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertextBase64, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } finally {
      dek.fill(0);
    }
  }
}
