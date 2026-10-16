import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, {act} from 'react-test-renderer';
import {GlucoseSettingsProvider, useGlucoseSettings} from 'app/contexts/GlucoseSettingsContext';
import {buildElapsedGlucoseSummary} from 'app/modules/trends';
import {cgmRange} from 'app/constants/PLAN_CONFIG';
import {setAndroidWidgetThresholds} from 'app/services/androidGlucoseLiveSurface';

jest.mock('app/services/androidGlucoseLiveSurface', () => ({
  setAndroidWidgetThresholds: jest.fn(),
}));

const custom = {veryLowMaxMgDl: 60, targetMinMgDl: 90, targetMaxMgDl: 160, highMaxMgDl: 220};
const startMs = Date.parse('2026-10-15T00:00:00Z');
const samples = [55, 65, 80, 150, 190, 240].map((valueMgDl, i) => ({
  valueMgDl, timestampMs: startMs + i * 300_000,
}));

describe('personal glucose range persistence and daily calculations', () => {
  let tree: renderer.ReactTestRenderer;
  let current: ReturnType<typeof useGlucoseSettings>;
  let owner: string | null;
  let listener: (id: string | null) => void;
  const authSession = {
    getCurrentUserId: () => owner,
    subscribe: (next: typeof listener) => { listener = next; return () => {}; },
  };
  const Consumer = () => { current = useGlucoseSettings(); return null; };
  const mount = async () => {
    await act(async () => {
      tree = renderer.create(<GlucoseSettingsProvider authSession={authSession}><Consumer /></GlucoseSettingsProvider>);
    });
  };
  const daily = () => buildElapsedGlucoseSummary({
    samples,
    period: {startMs, endMs: startMs + 6 * 300_000},
    expectedSampleIntervalMs: 300_000,
    thresholds: {
      veryLowMaxMgDl: current.settings.severeHypo,
      targetMinMgDl: current.settings.hypo,
      targetMaxMgDl: current.settings.hyper,
      highMaxMgDl: current.settings.severeHyper,
    },
  }).ranges;

  beforeEach(async () => {
    jest.clearAllMocks();
    owner = 'range-owner';
    await AsyncStorage.clear();
    await mount();
  });
  afterEach(() => { act(() => tree.unmount()); jest.restoreAllMocks(); });

  it('saves all four cutoffs atomically, recalculates daily TIR, updates widgets and reloads after restart', async () => {
    expect(daily()?.targetPercent).toBe(33.33);
    await act(async () => { await current.saveRanges(custom); });
    expect(daily()).toEqual({veryLowPercent: 16.67, lowPercent: 33.33, targetPercent: 16.67, highPercent: 16.67, veryHighPercent: 16.67});
    expect(cgmRange.TARGET).toEqual({min: 90, max: 160});
    expect(setAndroidWidgetThresholds).toHaveBeenLastCalledWith(90, 160);
    act(() => tree.unmount());
    await mount();
    expect(daily()?.targetPercent).toBe(16.67);
  });

  it('keeps the last saved ranges when input is invalid or storage fails', async () => {
    const previous = current.settings;
    await expect(current.saveRanges({...custom, targetMinMgDl: 170})).rejects.toThrow();
    expect(current.settings).toBe(previous);
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await act(async () => { await expect(current.saveRanges(custom)).rejects.toThrow('disk full'); });
    expect(current.settings).toBe(previous);
    expect(cgmRange.TARGET).toEqual({min: previous.hypo, max: previous.hyper});
  });

  it('does not publish an in-flight save into another account', async () => {
    let finish!: () => void;
    jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    let pending!: Promise<void>;
    await act(async () => { pending = current.saveRanges(custom); await Promise.resolve(); });
    await act(async () => { owner = 'other-owner'; listener(owner); });
    await act(async () => { finish(); await expect(pending).rejects.toThrow('Glucose settings changed'); });
    expect(current.settings.hypo).toBe(70);
    expect(cgmRange.TARGET).toEqual({min: 70, max: 180});
  });

  it('keeps time windows unchanged when saving ranges', async () => {
    await act(async () => { current.setSetting('nightStartHour', 21); });
    await act(async () => { await current.saveRanges(custom); });
    expect(current.settings.nightStartHour).toBe(21);
  });

  it('rejects an old editor after switching accounts and returning to the same owner', async () => {
    const oldSave = current.saveRanges;
    await act(async () => { owner = 'other-owner'; listener(owner); });
    await act(async () => { owner = 'range-owner'; listener(owner); });
    await expect(oldSave(custom)).rejects.toThrow('Glucose settings changed');
    expect(current.settings.hypo).toBe(70);
    await act(async () => { await current.saveRanges(custom); });
    expect(current.settings.hypo).toBe(90);
  });

  it('does not update globals after the saving provider unmounts', async () => {
    let finish!: () => void;
    jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    let pending!: Promise<void>;
    await act(async () => { pending = current.saveRanges(custom); await Promise.resolve(); });
    act(() => tree.unmount());
    owner = 'replacement-owner';
    await mount();
    await act(async () => { finish(); await expect(pending).rejects.toThrow('Glucose settings changed'); });
    expect(cgmRange.TARGET).toEqual({min: 70, max: 180});
  });
});
