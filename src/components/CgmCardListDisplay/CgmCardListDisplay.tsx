import {BgDataCard} from '../../components/CgmCardListDisplay/BgDataCard';
import {BgSample} from '../../types/day_bgs';
import {FlatList} from 'react-native';
import React from 'react';

const CgmCardListDisplay = ({bgData}: {bgData: BgSample[]}) => {
  const bgDataKeyExtractor = (item: BgSample) => item.date.toString();
  return (
    <FlatList
      keyExtractor={bgDataKeyExtractor}
      // get last 100 bg data
      data={bgData}
      renderItem={({item, index}) => (
        <BgDataCard bgData={item} prevBgData={bgData[index + 1]} />
      )}
    />
  );
};

export default CgmCardListDisplay;
