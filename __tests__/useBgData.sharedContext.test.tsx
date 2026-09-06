import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {useBgData} from 'app/hooks/useBgData';
import {
  fetchBgDataForDate,
  fetchDeviceStatusForDateRange,
} from 'app/api/apiRequests';
import {
  loadInsulinContext,
  type InsulinContext,
} from 'app/services/insulin/insulinDataSource';

const mockListeners = new Set<() => void>();
let mockRevision = 1;
jest.mock('app/api/shaniNightscoutInstances', () => ({
  getNightscoutConfigurationRevision: () => mockRevision,
  subscribeNightscoutConfiguration: (listener: () => void) => {
    mockListeners.add(listener);
    return () => mockListeners.delete(listener);
  },
}));
jest.mock('app/api/apiRequests', () => ({
  fetchBgDataForDate: jest.fn(),
  fetchDeviceStatusForDateRange: jest.fn(),
}));
jest.mock('app/services/insulin/insulinDataSource', () => ({
  loadInsulinContext: jest.fn(),
}));

const day = new Date(2026, 8, 6, 12);
const time = day.getTime();
const glucose = (value: number) => ({
  sgv: value,
  date: time,
  dateString: day.toISOString(),
  trend: 0,
  direction: 'Flat' as const,
  device: 'test',
  type: 'sgv',
});
const context = (iob: number) =>
  ({
    deviceStatus: [{mills: time, iob}],
    availability: {
      treatments: 'available',
      profile: 'available',
      deviceStatus: 'available',
    },
  } as InsulinContext);

describe('useBgData shared insulin context', () => {
  let current: ReturnType<typeof useBgData>;
  let tree: renderer.ReactTestRenderer;
  const Harness = ({date = day}: {date?: Date}) => {
    current = useBgData(date);
    return null;
  };
  beforeEach(() => {
    jest.resetAllMocks();
    mockRevision = 1;
    mockListeners.clear();
    jest.mocked(fetchDeviceStatusForDateRange).mockResolvedValue([]);
  });
  afterEach(() => {
    act(() => tree?.unmount());
  });

  it('enriches from the shared day context, uses exclusive next midnight and shares refresh semantics', async () => {
    jest.mocked(fetchBgDataForDate).mockResolvedValue([glucose(120)]);
    jest.mocked(loadInsulinContext).mockResolvedValue(context(1.2));
    await act(async () => {
      tree = renderer.create(<Harness />);
    });
    expect(current!.bgData[0]?.iob).toBe(1.2);
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    expect(loadInsulinContext).toHaveBeenCalledWith({
      startMs: +start,
      endMs: +end,
      forceRefresh: false,
    });
    expect(fetchDeviceStatusForDateRange).not.toHaveBeenCalled();
    await act(async () => {
      await current!.getUpdatedBgData();
    });
    expect(loadInsulinContext).toHaveBeenLastCalledWith({
      startMs: +start,
      endMs: +end,
      forceRefresh: true,
    });
  });

  it('discards a completed request from a replaced source', async () => {
    let resolveOld!: (value: InsulinContext) => void;
    jest
      .mocked(fetchBgDataForDate)
      .mockResolvedValueOnce([glucose(100)])
      .mockResolvedValueOnce([glucose(160)]);
    jest
      .mocked(loadInsulinContext)
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(context(2.5));
    await act(async () => {
      tree = renderer.create(<Harness />);
    });
    await act(async () => {
      mockRevision += 1;
      mockListeners.forEach(listener => listener());
    });
    expect(current!.bgData[0]?.sgv).toBe(160);
    expect(current!.bgData[0]?.iob).toBe(2.5);
    await act(async () => {
      resolveOld(context(9));
    });
    expect(current!.bgData[0]?.sgv).toBe(160);
    expect(current!.bgData[0]?.iob).toBe(2.5);
  });

  it('rejects old day callbacks and ignores late old-day data after a date change', async () => {
    let resolveOld!: (value: InsulinContext) => void;
    jest
      .mocked(fetchBgDataForDate)
      .mockResolvedValueOnce([glucose(100)])
      .mockResolvedValueOnce([glucose(160)]);
    jest
      .mocked(loadInsulinContext)
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(context(2.5));
    await act(async () => {
      tree = renderer.create(<Harness />);
    });
    const oldRefresh = current!.getUpdatedBgData;
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    await act(async () => {
      tree.update(<Harness date={nextDay} />);
    });
    expect(current!.bgData[0]?.iob).toBe(2.5);
    await act(async () => {
      resolveOld(context(9));
      await oldRefresh();
    });
    expect(current!.bgData[0]?.iob).toBe(2.5);
    expect(loadInsulinContext).toHaveBeenCalledTimes(2);
  });

  it('does not start another request through a retained refresh callback after unmount', async () => {
    jest.mocked(fetchBgDataForDate).mockResolvedValue([glucose(120)]);
    jest.mocked(loadInsulinContext).mockResolvedValue(context(1.2));
    await act(async () => {
      tree = renderer.create(<Harness />);
    });
    const refresh = current!.getUpdatedBgData;
    act(() => tree.unmount());
    await act(async () => {
      await refresh();
    });
    expect(loadInsulinContext).toHaveBeenCalledTimes(1);
  });

  it('ends loading with a safe error when glucose fails', async () => {
    jest
      .mocked(fetchBgDataForDate)
      .mockRejectedValue(new Error('private transport detail'));
    jest.mocked(loadInsulinContext).mockResolvedValue(context(1.2));
    await act(async () => {
      tree = renderer.create(<Harness />);
    });
    expect(current!.isLoading).toBe(false);
    expect(current!.error).toBe('Glucose data could not be loaded.');
    expect(current!.bgData).toEqual([]);
  });
});
