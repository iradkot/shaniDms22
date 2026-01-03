import React, {FC, useCallback, useMemo} from 'react';
import {FlatList} from 'react-native';
import BgDataCard from 'app/components/CgmCardListDisplay/BgDataCard';
import {BgSample} from 'app/types/day_bgs.types';
import {getLoadReferences, LOAD_BARS_CONSTANTS} from 'app/utils/loadBars.utils';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';

const CGM_ROWS_CONSTANTS = {
  initialNumToRender: 10,
  maxToRenderPerBatch: 10,
  updateCellsBatchingPeriodMs: 50,
  windowSize: 21,
  contentContainerFlexGrow: 1,
} as const;

interface CgmCardListDisplayProps {
  bgData: BgSample[];
  onPullToRefreshRefresh?: () => void;
  isLoading: boolean;
  isToday: boolean;
}

const CgmRows: FC<CgmCardListDisplayProps> = ({
  bgData,
  onPullToRefreshRefresh,
  isLoading,
  isToday,
}) => {
  const {maxIobReference, maxCobReference} = useMemo(
    () => getLoadReferences(bgData),
    [bgData],
  );

  const bgDataKeyExtractor = useCallback((item: BgSample) => {
    return item.date.toString();
  }, []);

  const renderItem = useCallback(
    ({item, index}: {item: BgSample; index: number}) => (
      <BgDataCard
        bgData={item}
        prevBgData={bgData[index + 1]}
        maxIobReference={maxIobReference}
        maxCobReference={maxCobReference}
      />
    ),
    [bgData, maxIobReference, maxCobReference],
  );

  return (
    <FlatList
      testID={E2E_TEST_IDS.glucoseLog.list}
      keyExtractor={bgDataKeyExtractor}
      data={bgData}
      renderItem={renderItem}
      refreshing={isLoading}
      onRefresh={onPullToRefreshRefresh}
      initialNumToRender={CGM_ROWS_CONSTANTS.initialNumToRender}
      maxToRenderPerBatch={CGM_ROWS_CONSTANTS.maxToRenderPerBatch}
      updateCellsBatchingPeriod={CGM_ROWS_CONSTANTS.updateCellsBatchingPeriodMs}
      windowSize={CGM_ROWS_CONSTANTS.windowSize}
      removeClippedSubviews={true}
      getItemLayout={(_, index) => ({
        length: LOAD_BARS_CONSTANTS.rowHeight,
        offset: LOAD_BARS_CONSTANTS.rowHeight * index,
        index,
      })}
      // inverted // Invert the FlatList to start from the bottom
      contentContainerStyle={{flexGrow: CGM_ROWS_CONSTANTS.contentContainerFlexGrow}} // Make sure the list grows from the bottom
    />
  );
};

export default CgmRows;
