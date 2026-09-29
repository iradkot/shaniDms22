import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {useNativeRecommendationPorts} from '../../../src/platform/native/ai/useNativeRecommendationPorts';
import {
  parseProductUserId,
  parseWorkspaceId,
} from '../../../src/modules/journal';
import type {InsulinContext} from '../../../src/services/insulin/insulinDataSource';

const mockTool = jest.fn(
  async (_scope: unknown, name: string, _args: unknown) => ({
    ok: true,
    result:
      name === 'getCgmSamples'
        ? {samples: []}
        : name === 'getGlucoseStats'
        ? {sampleCount: 0}
        : {
            totals: {bolusU: 8, carbsG: 90},
            availability: {treatments: 'available'},
          },
  }),
);
const mockLoadContext = jest.fn<Promise<InsulinContext>, [unknown]>();
jest.mock('../../../src/contexts/AiSettingsContext', () => ({
  useAiSettings: () => ({settings: {enabled: true, openAiModel: 'test-model'}}),
}));
jest.mock('../../../src/services/llm/llmClient', () => ({
  createLlmProvider: jest.fn(),
}));
jest.mock('../../../src/services/aiAnalyst/aiAnalystLocalTools', () => ({
  runAiAnalystTool: (...args: [unknown, string, unknown]) => mockTool(...args),
}));
jest.mock('../../../src/services/insulin/insulinDataSource', () => ({
  loadInsulinContext: (request: unknown) => mockLoadContext(request),
}));

const startMs = Date.parse('2026-09-01T00:00:00Z');
const endMs = Date.parse('2026-09-03T00:00:00Z');
const iso = (timestampMs: number) => new Date(timestampMs).toISOString();
const food = (timestamp: number, carbs: number) => ({
  id: String(timestamp),
  timestamp,
  carbs,
  name: '',
  image: '',
  notes: '',
  score: 0,
});
const context = (): InsulinContext => ({
  treatments: [],
  deviceStatus: [],
  profileData: null,
  basalProfileData: [],
  recordedInsulin: {
    quality: 'partial',
    bolusUnits: 4,
    basalCoveragePercent: 0,
    basalCoveredMs: 0,
    basalEvidence: 'recorded',
  },
  insulinData: [
    {type: 'bolus', timestamp: iso(startMs), amount: 1.25},
    {type: 'bolus', timestamp: iso(endMs - 1), amount: 2.75},
    {type: 'bolus', timestamp: iso(startMs - 1), amount: 50},
    {type: 'bolus', timestamp: iso(endMs), amount: 60},
    {type: 'tempBasal', timestamp: iso(startMs), rate: 5, duration: 120},
  ],
  carbTreatments: [food(startMs, 20), food(endMs - 1, 35), food(endMs, 100)],
  loadSamples: [],
  availability: {
    treatments: 'available',
    deviceStatus: 'unavailable',
    profile: 'unavailable',
  },
  freshness: {kind: 'fresh', fetchedAtMs: endMs},
});
const portsAndScope = () => {
  const user = parseProductUserId('user-a');
  const workspace = parseWorkspaceId('workspace-a');
  if (!user.ok || !workspace.ok) {
    throw new Error('Invalid test scope');
  }
  const scope = {productUserId: user.value, workspaceId: workspace.value};
  let ports: ReturnType<typeof useNativeRecommendationPorts> | undefined;
  const Harness = () => {
    ports = useNativeRecommendationPorts(scope, 'en');
    return null;
  };
  act(() => {
    TestRenderer.create(React.createElement(Harness));
  });
  if (!ports) {
    throw new Error('Native ports were not initialized');
  }
  return {ports, scope};
};
const loadSelectedEvidence = async () => {
  const {ports, scope} = portsAndScope();
  const text = await ports.loadEvidence(
    {
      locale: 'en',
      request: {kind: 'weekly'},
      focus: {kind: 'period', startMs, endMs},
    },
    new AbortController().signal,
  );
  return {
    text,
    evidence: JSON.parse(text.slice(text.indexOf('\n') + 1)),
    scope,
  };
};

beforeEach(() => {
  mockTool.mockClear();
  mockLoadContext.mockReset();
  mockLoadContext.mockResolvedValue(context());
});

it.each(['unavailable', 'stale'] as const)(
  'preserves historical recorded bolus and carbs with a %s profile',
  async profile => {
    const data = context();
    mockLoadContext.mockResolvedValue({
      ...data,
      availability: {...data.availability, profile},
    });
    const {text, evidence, scope} = await loadSelectedEvidence();
    expect(mockTool).toHaveBeenCalledWith(scope, 'getGlucoseStats', {
      startDate: iso(startMs),
      endDate: iso(endMs),
    });
    expect(mockLoadContext).toHaveBeenCalledWith({startMs, endMs});
    expect(mockTool).not.toHaveBeenCalledWith(
      scope,
      'getInsulinDeliveryStats',
      expect.anything(),
    );
    expect(mockTool).not.toHaveBeenCalledWith(
      scope,
      'getInsulinSummary',
      expect.anything(),
    );
    expect(evidence.insulin).toMatchObject({
      available: true,
      range: {start: iso(startMs), end: iso(endMs)},
      totals: {bolusU: 4, carbsG: 55},
      counts: {carbTreatments: 2},
      availability: {profile},
    });
    expect(text).not.toContain('"basalU"');
    expect(text).not.toContain('"totalU"');
    expect(text).not.toContain('"tempBasalU"');
  },
);

it.each(['stale', 'unavailable'] as const)(
  'keeps %s treatment totals unknown even when cached records exist',
  async treatments => {
    const data = context();
    mockLoadContext.mockResolvedValue({
      ...data,
      availability: {...data.availability, treatments},
    });
    const {evidence} = await loadSelectedEvidence();
    expect(evidence.insulin.available).toBe(false);
    expect(evidence.insulin.availability.treatments).toBe(treatments);
    expect(evidence.insulin.totals).toBeUndefined();
  },
);

it('keeps treatment load failures unknown without discarding the evidence window', async () => {
  mockLoadContext.mockRejectedValue(new Error('Source changed'));
  const {evidence} = await loadSelectedEvidence();
  expect(evidence.range).toMatchObject({start: iso(startMs), end: iso(endMs)});
  expect(evidence.insulin.available).toBe(false);
  expect(evidence.insulin.totals).toBeUndefined();
});

it('preserves the existing rolling summary when no dates were selected', async () => {
  const {ports, scope} = portsAndScope();
  await ports.loadEvidence(
    {locale: 'en', request: {kind: 'weekly'}},
    new AbortController().signal,
  );
  expect(mockTool).toHaveBeenCalledWith(scope, 'getInsulinSummary', {
    rangeDays: 7,
  });
  expect(mockLoadContext).not.toHaveBeenCalled();
});

it('uses canonical recorded amounts rather than recounting normalized programmed entries', async () => {
  const data = context();
  mockLoadContext.mockResolvedValue({
    ...data,
    recordedInsulin: {
      quality: 'partial',
      bolusUnits: 1.5,
      basalCoveragePercent: 0,
      basalCoveredMs: 0,
      basalEvidence: 'recorded',
    },
  });
  const {evidence} = await loadSelectedEvidence();
  expect(evidence.insulin.totals.bolusU).toBe(1.5);
  expect(evidence.insulin.recordedInsulin.quality).toBe('partial');
  expect(evidence.insulin.counts).not.toHaveProperty('bolusCount');
  expect(evidence.insulin.counts).not.toHaveProperty('insulinEntries');
});

it('keeps an unknown canonical bolus unknown even when normalized entries contain amounts', async () => {
  const data = context();
  mockLoadContext.mockResolvedValue({
    ...data,
    recordedInsulin: {
      quality: 'partial',
      basalCoveragePercent: 0,
      basalCoveredMs: 0,
      basalEvidence: 'recorded',
    },
  });
  const {evidence} = await loadSelectedEvidence();
  expect(evidence.insulin.available).toBe(false);
  expect(evidence.insulin).not.toHaveProperty('totals');
});
