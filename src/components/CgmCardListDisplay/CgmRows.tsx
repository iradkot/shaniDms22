import React, {FC, useCallback, useMemo} from 'react';
import {FlatList} from 'react-native';
import BgDataCard from 'app/components/CgmCardListDisplay/BgDataCard';
import {BgSample} from 'app/types/day_bgs';

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
  const bgDataKeyExtractor = useCallback((item: BgSample) => {
    return item.date.toString();
  }, []);

  const renderItem = useCallback(
    ({item, index}: {item: BgSample; index: number}) => (
      <BgDataCard bgData={item} prevBgData={bgData[index + 1]} />
    ),
    [bgData],
  );

  return (
    <FlatList
      keyExtractor={bgDataKeyExtractor}
      data={bgData}
      renderItem={renderItem}
      refreshing={isLoading}
      onRefresh={onPullToRefreshRefresh}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={50}
      windowSize={21}
      removeClippedSubviews={true}
      getItemLayout={(_, index) => ({
        length: 50,
        offset: 50 * index,
        index,
      })}
      inverted // Invert the FlatList to start from the bottom
      contentContainerStyle={{flexGrow: 1}} // Make sure the list grows from the bottom
    />
  );
};

export default CgmRows;
