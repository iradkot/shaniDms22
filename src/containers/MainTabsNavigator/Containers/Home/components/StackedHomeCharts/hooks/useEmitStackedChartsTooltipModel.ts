import React from 'react';

import type {StackedChartsTooltipModel} from '../StackedHomeCharts.types';

function buildTooltipModelKey(model: StackedChartsTooltipModel) {
  return [
    model.visible,
    model.anchorTimeMs,
    model.bgSample?.date ?? 'no-bg',
    model.bgSample?.sgv ?? 'no-sgv',
    model.activeInsulinU ?? 'no-iob',
    model.activeInsulinBolusU ?? 'no-bolus-iob',
    model.activeInsulinBasalU ?? 'no-basal-iob',
    model.cobG ?? 'no-cob',
    model.basalRateUhr ?? 'no-basal-rate',
    model.bolusSummary.count,
    model.bolusSummary.totalU,
    model.carbsSummary.count,
    model.carbsSummary.totalG,
  ].join('|');
}

export function useEmitStackedChartsTooltipModel(params: {
  model: StackedChartsTooltipModel;
  onTooltipModelChange?: (model: StackedChartsTooltipModel) => void;
}) {
  const {model, onTooltipModelChange} = params;
  const prevModelKeyRef = React.useRef<string>('');

  React.useEffect(() => {
    if (!onTooltipModelChange) {
      return;
    }

    const key = buildTooltipModelKey(model);
    if (key !== prevModelKeyRef.current) {
      prevModelKeyRef.current = key;
      onTooltipModelChange(model);
    }
  }, [model, onTooltipModelChange]);
}
