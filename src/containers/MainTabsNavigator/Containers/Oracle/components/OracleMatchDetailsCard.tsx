import React from 'react';

import {OracleMatchTrace} from 'app/services/oracle/oracleTypes';
import OracleGhostGraph from 'app/components/charts/OracleGhostGraph/OracleGhostGraph';
import {formatDateToDateAndTimeString} from 'app/utils/datetime.utils';

import {Card, CardSubtle, CardTitle, Spacer} from './OracleCards';

/**
 * Details for a single matched historical event.
 *
 * Today this renders the existing Oracle ghost-graph view.
 *
 * This component is intentionally isolated so we can later add:
 * - A drill-down screen (navigation)
 * - `CgmGraph` rendering with insulin/carbs markers
 * - A TIR row (via `TimeInRangeRow`)
 * without changing the surrounding Oracle screen logic.
 */
export function OracleMatchDetailsCard(props: {
  match: OracleMatchTrace;
  width: number;
  testID?: string;
}): React.JSX.Element {
  const {match, width} = props;

  return (
    <Card testID={props.testID}>
      <CardTitle>Event details</CardTitle>
      <CardSubtle>{formatDateToDateAndTimeString(match.anchorTs)}</CardSubtle>

      <Spacer h={8} />

      <OracleGhostGraph
        width={Math.max(1, width)}
        height={220}
        currentSeries={[]}
        matches={[match]}
        medianSeries={[]}
      />

      <Spacer h={8} />

      <CardSubtle>
        Boluses (0–30m): {match.actionCounts30m?.boluses ?? 0} • Insulin:{' '}
        {match.actions30m?.insulin?.toFixed?.(1) ?? '0.0'}U • Carbs:{' '}
        {match.actions30m?.carbs != null ? Math.round(match.actions30m.carbs) : 0}g
      </CardSubtle>

      <CardSubtle>
        IOB/COB at event: {match.iob != null ? `${match.iob.toFixed(1)}U` : '—'} /{' '}
        {match.cob != null ? `${Math.round(match.cob)}g` : '—'}
      </CardSubtle>
    </Card>
  );
}
