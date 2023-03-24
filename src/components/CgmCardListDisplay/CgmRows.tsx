import React, {FC, useMemo} from 'react';
import {FlatList} from 'react-native';
import BgDataCard from 'app/components/CgmCardListDisplay/BgDataCard';
import {BgSample} from 'app/types/day_bgs';

interface CgmCardListDisplayProps {
  bgData: BgSample[];
  onPullToRefreshRefresh?: () => void;
  isLoading: boolean;
}

const CgmRows: FC<CgmCardListDisplayProps> = ({
  bgData,
  onPullToRefreshRefresh,
  isLoading,
}) => {
  const bgDataKeyExtractor = useMemo(() => {
    return (item: BgSample) => item.date.toString();
  }, [bgData]);

  return (
    <FlatList
      keyExtractor={bgDataKeyExtractor}
      data={bgData}
      renderItem={({item, index}) => (
        <BgDataCard bgData={item} prevBgData={bgData[index + 1]} />
      )}
      refreshing={isLoading}
      onRefresh={onPullToRefreshRefresh}
    />
  );
};

export default CgmRows;
