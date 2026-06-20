import React from 'react';
import renderer, {act} from 'react-test-renderer';

import {
  resolveCgmTooltipInteractionTime,
  useCgmGraphTooltipModel,
} from '../src/components/charts/CgmGraph/hooks/useCgmGraphTooltipModel';
import type {BgSample} from '../src/types/day_bgs.types';

const sampleAt = (date: number, sgv: number): BgSample => ({
  sgv,
  date,
  dateString: new Date(date).toISOString(),
  trend: 0,
  direction: 'Flat',
  device: 'mock',
  type: 'sgv',
});

type ProbeProps = Parameters<typeof useCgmGraphTooltipModel>[0] & {
  onModel: (model: ReturnType<typeof useCgmGraphTooltipModel>) => void;
};

const Probe: React.FC<ProbeProps> = ({onModel, ...params}) => {
  const model = useCgmGraphTooltipModel(params);

  React.useEffect(() => {
    onModel(model);
  }, [model, onModel]);

  return null;
};

describe('useCgmGraphTooltipModel', () => {
  it('prefers external cursor time over local touch state', () => {
    expect(
      resolveCgmTooltipInteractionTime({
        tooltipMode: 'external',
        cursorTimeMs: 200,
        isTouchActive: false,
        touchTimeMs: null,
      }),
    ).toEqual({
      activeTimeMs: 200,
      isInteractionActive: true,
      shouldUseExternalCursor: true,
    });
  });

  it('keeps internal tooltip inactive when local touch is not active', () => {
    expect(
      resolveCgmTooltipInteractionTime({
        tooltipMode: 'internal',
        cursorTimeMs: 200,
        isTouchActive: false,
        touchTimeMs: 100,
      }),
    ).toEqual({
      activeTimeMs: null,
      isInteractionActive: false,
      shouldUseExternalCursor: false,
    });
  });

  it('keeps an external cursor active after local touch is cancelled', async () => {
    const start = Date.UTC(2026, 0, 7, 8, 0, 0);
    const cursorTimeMs = start + 5 * 60 * 1000;
    const bgSamples = [
      sampleAt(start, 100),
      sampleAt(start + 10 * 60 * 1000, 120),
    ];

    let model: ReturnType<typeof useCgmGraphTooltipModel> | null = null;

    await act(async () => {
      renderer.create(
        <Probe
          bgSamples={bgSamples}
          foodItems={null}
          insulinData={[]}
          tooltipMode="external"
          cursorTimeMs={cursorTimeMs}
          isTouchActive={false}
          touchTimeMs={null}
          onModel={next => {
            model = next;
          }}
        />,
      );
    });

    expect(model?.cgmAnchorTimeMs).toBe(cursorTimeMs);
    expect(model?.closestBgSample?.sgv).toBe(100);
    expect(model?.shouldUseExternalCursor).toBe(true);
  });

  it('keeps internal tooltip inactive without an active touch', async () => {
    const start = Date.UTC(2026, 0, 7, 8, 0, 0);
    let model: ReturnType<typeof useCgmGraphTooltipModel> | null = null;

    await act(async () => {
      renderer.create(
        <Probe
          bgSamples={[sampleAt(start, 100)]}
          foodItems={null}
          insulinData={[]}
          tooltipMode="internal"
          cursorTimeMs={null}
          isTouchActive={false}
          touchTimeMs={start}
          onModel={next => {
            model = next;
          }}
        />,
      );
    });

    expect(model?.cgmAnchorTimeMs).toBeNull();
    expect(model?.closestBgSample).toBeNull();
  });
});
