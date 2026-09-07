import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {useAiAnalystEngine} from 'app/containers/MainTabsNavigator/Containers/AiAnalyst/hooks/useAiAnalystEngine';
import type {AiAnalystEngine} from 'app/containers/MainTabsNavigator/Containers/AiAnalyst/types';
import {useLatestNightscoutSnapshot} from 'app/hooks/useLatestNightscoutSnapshot';
import {LatestNightscoutSnapshotStateProvider} from 'app/platform/native/product/LatestNightscoutSnapshotStateContext';
import {
  clearNightscoutInstance,
  configureNightscoutInstance,
} from 'app/api/shaniNightscoutInstances';

const mockFetchBg = jest.fn();
const mockFetchDeviceStatus = jest.fn();
jest.mock('app/api/apiRequests', () => ({
  fetchLatestBgEntry: () => mockFetchBg(),
  fetchLatestDeviceStatusEntry: () => mockFetchDeviceStatus(),
}));
jest.mock('app/contexts/AiSettingsContext', () => ({
  useAiSettings: () => ({
    settings: {enabled: true, apiKey: '__shani_server_vault__', openAiModel: 'fixture'},
    credentialSyncStatus: {state: 'configured', pending: false},
  }),
}));
jest.mock('app/contexts/GlucoseSettingsContext', () => ({
  useGlucoseSettings: () => ({settings: {severeHypo: 54, hypo: 70, hyper: 180}}),
}));
jest.mock('app/contexts/AppLanguageContext', () => ({
  useAppLanguage: () => ({language: 'en'}),
}));
jest.mock('app/services/aiMemory/useActiveAiWorkspaceScope', () => ({
  useActiveAiWorkspaceScope: () => ({productUserId: 'snapshot-user', workspaceId: 'snapshot-workspace'}),
}));
jest.mock('app/services/llm/llmClient', () => ({
  createLlmProvider: () => ({sendChat: jest.fn()}),
  withAppLanguagePolicy: (instruction: string) => instruction,
}));

const NOW = Date.UTC(2026, 8, 6, 12);
const glucose = (sgv = 123, date = NOW) => ({
  sgv,
  date,
  dateString: new Date(date).toISOString(),
  trend: 0,
  direction: 'Flat',
  device: 'fixture',
  type: 'sgv',
});
const deviceStatus = (iob = 1.25, cob = 20) => ({
  created_at: new Date(NOW).toISOString(),
  loop: {iob: {iob}, cob: {cob}},
});

let engine: AiAnalystEngine;
let owner: ReturnType<typeof useLatestNightscoutSnapshot>;
function Engine() {
  engine = useAiAnalystEngine();
  return null;
}
function AppSnapshotOwner() {
  owner = useLatestNightscoutSnapshot({pollingEnabled: true});
  return (
    <LatestNightscoutSnapshotStateProvider value={owner}>
      <Engine />
    </LatestNightscoutSnapshotStateProvider>
  );
}

describe('AI consumes the app-owned latest snapshot', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    jest.clearAllMocks();
    configureNightscoutInstance({baseUrl: 'https://alpha.example'});
    mockFetchBg.mockResolvedValue(glucose());
    mockFetchDeviceStatus.mockResolvedValue(deviceStatus());
  });
  afterEach(() => {
    act(() => tree.unmount());
    clearNightscoutInstance();
    jest.useRealTimers();
  });

  const mount = async () => {
    await act(async () => {
      tree = renderer.create(<AppSnapshotOwner />);
    });
  };

  it('loads one snapshot at startup and shares polling when the AI mission opens', async () => {
    await mount();
    expect(mockFetchBg).toHaveBeenCalledTimes(1);
    expect(mockFetchDeviceStatus).toHaveBeenCalledTimes(1);
    act(() => engine.setState({mode: 'mission', mission: 'openChat'}));
    expect(engine.compactKpi).toEqual({
      bgMgdl: 123,
      trend: '→',
      iobU: 1.25,
      cobG: 20,
      sampleTimeMs: NOW,
    });
    mockFetchBg.mockResolvedValue(glucose(135, NOW + 60000));
    mockFetchDeviceStatus.mockResolvedValue(deviceStatus(1.5, 18));
    await act(async () => jest.advanceTimersByTime(60000));
    expect(mockFetchBg).toHaveBeenCalledTimes(2);
    expect(mockFetchDeviceStatus).toHaveBeenCalledTimes(2);
    expect(engine.compactKpi).toMatchObject({bgMgdl: 135, iobU: 1.5, cobG: 18});
  });

  it('shares refresh, stale data and recoverable errors without another reader', async () => {
    await mount();
    act(() => engine.setState({mode: 'mission', mission: 'openChat'}));
    const oldDate = NOW - 20 * 60000;
    mockFetchBg.mockResolvedValue(glucose(141, oldDate));
    await act(async () => owner.refresh());
    expect(owner.snapshot?.staleLevel).toBe('very-stale');
    expect(engine.compactKpi).toMatchObject({bgMgdl: 141, sampleTimeMs: oldDate});
    const offline = new Error('Fixture offline');
    mockFetchBg.mockRejectedValueOnce(offline);
    await act(async () => owner.refresh());
    expect(owner.error).toBe(offline);
    expect(engine.compactKpi).toBeNull();
    mockFetchBg.mockResolvedValue(glucose(127));
    await act(async () => owner.refresh());
    expect(owner.error).toBeNull();
    expect(engine.compactKpi?.bgMgdl).toBe(127);
    expect(mockFetchBg).toHaveBeenCalledTimes(4);
  });

  it.each([
    {
      kind: 'credentials',
      configuration: {
        baseUrl: 'https://alpha.example',
        apiSecretSha1: 'b'.repeat(40),
      },
    },
    {kind: 'source', configuration: {baseUrl: 'https://beta.example'}},
  ])('clears AI values as soon as the shared $kind reset', async ({configuration}) => {
    await mount();
    act(() => engine.setState({mode: 'mission', mission: 'openChat'}));
    expect(engine.compactKpi?.bgMgdl).toBe(123);
    let resolveNext!: (value: ReturnType<typeof glucose>) => void;
    const nextReading = new Promise<ReturnType<typeof glucose>>(resolve => {
      resolveNext = resolve;
    });
    mockFetchBg.mockReturnValueOnce(nextReading);
    await act(async () => {
      configureNightscoutInstance(configuration);
    });
    expect(owner.snapshot).toBeNull();
    expect(engine.compactKpi).toBeNull();
    await act(async () => resolveNext(glucose(109)));
    expect(engine.compactKpi?.bgMgdl).toBe(109);
    expect(mockFetchBg).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed shared values without fetching a replacement independently', () => {
    act(() => {
      tree = renderer.create(
        <LatestNightscoutSnapshotStateProvider value={{
          snapshot: {enrichedBg: {...glucose(), iob: 0, cob: 0}},
          isLoading: false,
          error: null,
        }}>
          <Engine />
        </LatestNightscoutSnapshotStateProvider>,
      );
    });
    act(() => engine.setState({mode: 'mission', mission: 'openChat'}));
    expect(engine.compactKpi).toMatchObject({bgMgdl: 123, iobU: 0, cobG: 0});
    act(() => tree.update(
      <LatestNightscoutSnapshotStateProvider value={{
        snapshot: {enrichedBg: {sgv: Number.NaN, iob: 'unknown', cob: Infinity}},
        isLoading: false,
        error: null,
      }}>
        <Engine />
      </LatestNightscoutSnapshotStateProvider>,
    ));
    expect(engine.compactKpi).toBeNull();
    expect(mockFetchBg).not.toHaveBeenCalled();
    expect(mockFetchDeviceStatus).not.toHaveBeenCalled();
  });
});
