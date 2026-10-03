import React from 'react';
import {ReorderList} from '../ui/reorder/ReorderList';
import {reorderCopy, type DailyOverviewReorderListProps} from './dailyOverviewReorder';

export type {DailyOverviewReorderListProps} from './dailyOverviewReorder';

export function DailyOverviewReorderList(props: DailyOverviewReorderListProps) {
  return (
    <ReorderList
      {...props}
      testIDPrefix="daily-overview"
      listAccessibilityLabel={reorderCopy[props.locale].list}
    />
  );
}

export default DailyOverviewReorderList;
