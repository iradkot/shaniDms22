export type SupportedProvider = 'openai';

export interface EncryptedEnvelope {
  readonly version: 1;
  readonly algorithm: 'AES-256-GCM+KMS';
  readonly kmsKeyName: string;
  readonly encryptedDekBase64: string;
  readonly ivBase64: string;
  readonly ciphertextBase64: string;
  readonly authTagBase64: string;
}

export interface EnvelopeCipher {
  encrypt(plaintext: string, associatedData: string): Promise<EncryptedEnvelope>;
  decrypt(envelope: EncryptedEnvelope, associatedData: string): Promise<string>;
}

export interface VaultDocument {
  readonly version: 1;
  readonly provider: SupportedProvider;
  readonly envelope: EncryptedEnvelope;
  readonly updatedAtIso: string;
}

export interface VaultRepository {
  read(uid: string, provider: SupportedProvider): Promise<VaultDocument | null>;
  write(uid: string, document: VaultDocument): Promise<void>;
  remove(uid: string, provider: SupportedProvider): Promise<void>;
}

export interface CredentialVault {
  has(uid: string, provider: SupportedProvider): Promise<boolean>;
  put(uid: string, provider: SupportedProvider, credential: string): Promise<void>;
  get(uid: string, provider: SupportedProvider): Promise<string | null>;
  remove(uid: string, provider: SupportedProvider): Promise<void>;
}

const associatedData = (uid: string, provider: SupportedProvider): string =>
  `shanidms:v1:${uid}:llm:${provider}`;

export class EncryptedCredentialVault implements CredentialVault {
  constructor(
    private readonly repository: VaultRepository,
    private readonly cipher: EnvelopeCipher,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async has(uid: string, provider: SupportedProvider): Promise<boolean> {
    return (await this.repository.read(uid, provider)) !== null;
  }

  async put(
    uid: string,
    provider: SupportedProvider,
    credential: string,
  ): Promise<void> {
    const envelope = await this.cipher.encrypt(
      credential,
      associatedData(uid, provider),
    );
    await this.repository.write(uid, {
      version: 1,
      provider,
      envelope,
      updatedAtIso: this.now().toISOString(),
    });
  }

  async get(uid: string, provider: SupportedProvider): Promise<string | null> {
    const stored = await this.repository.read(uid, provider);
    if (!stored) return null;
    if (stored.version !== 1 || stored.provider !== provider) {
      throw new Error('Invalid encrypted vault document');
    }
    return this.cipher.decrypt(
      stored.envelope,
      associatedData(uid, provider),
    );
  }

  remove(uid: string, provider: SupportedProvider): Promise<void> {
    return this.repository.remove(uid, provider);
  }
}
