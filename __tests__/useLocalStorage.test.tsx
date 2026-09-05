import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, {act} from 'react-test-renderer';

import {useLocalStorage} from 'app/hooks/useLocalStorage';

describe('useLocalStorage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('hydrates an existing value without overwriting it with the default', async () => {
    await AsyncStorage.setItem('preference', JSON.stringify('stored'));
    let observed = '';

    const Consumer = () => {
      const [value] = useLocalStorage('preference', 'default');
      observed = value;
      return null;
    };

    let tree: renderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = renderer.create(<Consumer />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(observed).toBe('stored');
    expect(await AsyncStorage.getItem('preference')).toBe(
      JSON.stringify('stored'),
    );

    tree?.unmount();
  });
});
