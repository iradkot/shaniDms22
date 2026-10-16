import {runAiAnalystTool} from 'app/services/aiAnalyst/aiAnalystLocalTools';
import {buildHypoDetectiveContext} from 'app/services/aiAnalyst/hypoDetectiveContextBuilder';
import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';

jest.mock('app/api/apiRequests', () => ({
  fetchBgDataForDateRangeUncached: jest.fn(async () => []),
}));
jest.mock('app/services/aiAnalyst/hypoDetectiveContextBuilder', () => ({
  buildHypoDetectiveContext: jest.fn(async () => ({contextJson: {}, debug: {}})),
}));

const scope = {productUserId: 'range-owner', workspaceId: 'range-workspace'};

describe('native AI personal glucose ranges', () => {
  const previous = {
    min: cgmRange.TARGET.min,
    veryLow: cgmRange[CGM_STATUS_CODES.EXTREME_LOW],
    high: cgmRange[CGM_STATUS_CODES.VERY_HIGH],
    veryHigh: cgmRange[CGM_STATUS_CODES.EXTREME_HIGH],
  };
  beforeEach(() => {
    cgmRange.TARGET.min = 90;
    cgmRange[CGM_STATUS_CODES.EXTREME_LOW] = 60;
    cgmRange[CGM_STATUS_CODES.VERY_HIGH] = 160;
    cgmRange[CGM_STATUS_CODES.EXTREME_HIGH] = 220;
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    cgmRange.TARGET.min = previous.min;
    cgmRange[CGM_STATUS_CODES.EXTREME_LOW] = previous.veryLow;
    cgmRange[CGM_STATUS_CODES.VERY_HIGH] = previous.high;
    cgmRange[CGM_STATUS_CODES.EXTREME_HIGH] = previous.veryHigh;
    jest.restoreAllMocks();
  });

  it('uses the current low and high boundaries for default event queries', async () => {
    expect(await runAiAnalystTool(scope, 'getGlycemicEvents', {kind: 'hypo'})).toMatchObject({ok: true, result: {thresholdMgdl: 90}});
    expect(await runAiAnalystTool(scope, 'getGlycemicEvents', {kind: 'hyper'})).toMatchObject({ok: true, result: {thresholdMgdl: 160}});
    cgmRange.TARGET.min = 80;
    expect(await runAiAnalystTool(scope, 'getGlycemicEvents', {kind: 'hypo'})).toMatchObject({ok: true, result: {thresholdMgdl: 80}});
  });

  it('uses the personal very-low boundary for investigation, and honors explicit queries', async () => {
    await runAiAnalystTool(scope, 'getHypoDetectiveContext', {});
    expect(buildHypoDetectiveContext).toHaveBeenLastCalledWith(expect.objectContaining({lowThreshold: 60}));
    expect(await runAiAnalystTool(scope, 'getGlycemicEvents', {kind: 'hyper', thresholdMgdl: 200})).toMatchObject({ok: true, result: {thresholdMgdl: 200}});
  });
});
