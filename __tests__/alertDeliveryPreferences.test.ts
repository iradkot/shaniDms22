import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getAlertDeliveryMode,
  setAlertDeliveryMode,
} from 'app/services/notifications/alertDeliveryPreferences';

describe('alert delivery preferences', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('defaults to sound and vibration and stays isolated by Workspace', async () => {
    expect(await getAlertDeliveryMode('workspace_alpha')).toBe(
      'sound-and-vibrate',
    );

    await setAlertDeliveryMode('workspace_alpha', 'silent');

    expect(await getAlertDeliveryMode('workspace_alpha')).toBe('silent');
    expect(await getAlertDeliveryMode('workspace_beta')).toBe(
      'sound-and-vibrate',
    );
  });

  it('falls back safely when stored data is not a supported mode', async () => {
    await AsyncStorage.setItem(
      'notifications:delivery-mode:v1:workspace_alpha',
      'unknown',
    );

    expect(await getAlertDeliveryMode('workspace_alpha')).toBe(
      'sound-and-vibrate',
    );
  });
});
