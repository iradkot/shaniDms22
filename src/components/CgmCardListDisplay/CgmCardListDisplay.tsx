import BgDataCard from 'app/components/CgmCardListDisplay/BgDataCard';
import {BgSample} from 'app/types/day_bgs';
import {FlatList, Text, View} from 'react-native';
import React, {FC} from 'react';

interface CgmCardListDisplayProps {
  bgData: BgSample[];
  onPullToRefreshRefresh: () => void;
  isLoading: boolean;
}

const CgmCardListDisplay: FC<CgmCardListDisplayProps> = ({
  bgData,
  onPullToRefreshRefresh,
  isLoading,
}) => {
  const bgDataKeyExtractor = (item: BgSample) => item.date.toString();

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

export default CgmCardListDisplay;
