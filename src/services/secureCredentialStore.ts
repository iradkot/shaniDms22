import * as Keychain from 'react-native-keychain';

export interface SecureCredentialStore {
  readonly read: (service: string) => Promise<string | undefined>;
  readonly write: (service: string, value: string) => Promise<void>;
  readonly remove: (service: string) => Promise<void>;
}

const assertService = (service: string): string => {
  const normalized = service.trim();
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(normalized)) {
    throw new Error('Invalid secure credential service identifier.');
  }
  return normalized;
};

/** Mobile-only Keychain/Keystore adapter. Credential values never enter AsyncStorage. */
export const nativeSecureCredentialStore: SecureCredentialStore = {
  async read(service) {
    const credential = await Keychain.getGenericPassword({
      service: assertService(service),
    });
    return credential === false ? undefined : credential.password;
  },
  async write(service, value) {
    const normalized = value.trim();
    if (!normalized) {
      await Keychain.resetGenericPassword({service: assertService(service)});
      return;
    }
    await Keychain.setGenericPassword('credential', normalized, {
      service: assertService(service),
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  async remove(service) {
    await Keychain.resetGenericPassword({service: assertService(service)});
  },
};

