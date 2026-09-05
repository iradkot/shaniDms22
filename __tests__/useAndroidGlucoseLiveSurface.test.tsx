import React from 'react';
import {Platform} from 'react-native';
import renderer, {act} from 'react-test-renderer';

const mockClear = jest.fn();
const mockUpdate = jest.fn();

jest.mock('app/services/androidGlucoseLiveSurface', () => ({
  clearAndroidGlucoseLiveSurface: (...args: unknown[]) => mockClear(...args),
  updateAndroidGlucoseLiveSurface: (...args: unknown[]) => mockUpdate(...args),
}));

import {useAndroidGlucoseLiveSurface} from 'app/hooks/useAndroidGlucoseLiveSurface';

describe('useAndroidGlucoseLiveSurface', () => {
  const originalOs = Platform.OS;

  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', {configurable: true, value: 'android'});
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalOs,
    });
  });

  beforeEach(() => jest.clearAllMocks());

  it('clears the old widget and live notification when the snapshot disappears', () => {
    const Consumer = ({snapshot}: {readonly snapshot: unknown}) => {
      useAndroidGlucoseLiveSurface(snapshot as never, {low: 70, high: 180});
      return null;
    };
    let tree: renderer.ReactTestRenderer;

    act(() => tree = renderer.create(<Consumer snapshot={null} />));
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();

    const snapshot = {enrichedBg: {sgv: 100, date: 1}};
    act(() => tree!.update(<Consumer snapshot={snapshot} />));
    expect(mockUpdate).toHaveBeenCalledWith(snapshot, {low: 70, high: 180});

    act(() => tree!.update(<Consumer snapshot={null} />));
    expect(mockClear).toHaveBeenCalledTimes(2);
    act(() => tree!.unmount());
  });
});
