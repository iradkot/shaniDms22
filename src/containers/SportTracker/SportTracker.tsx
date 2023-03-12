import React, {useEffect, useLayoutEffect, useState} from 'react';
import {NavigationProp, useFocusEffect} from '@react-navigation/native';
import {FirebaseService} from 'app/services/firebase/FirebaseService';
import {FlatList} from 'react-native-gesture-handler';
import SportTrackerHeader from './components/SportTrackerHeader';
import * as Styled from './styles';
import {formattedSportItemDTO, SportItemDTO} from 'app/types/sport.types';
import {formatDateToDateAndTimeString} from 'app/utils/datetime.utils';
import SportItem from './components/SportItem';
import Button from 'app/components/Button/Button';
import Icon from 'react-native-vector-icons/Ionicons';
import {ADD_SPORT_ITEM_SCREEN} from 'app/constants/SCREEN_NAMES';

export const formatSportItem = async (
  item: SportItemDTO,
  fsManager: FirebaseService,
): Promise<formattedSportItemDTO> => {
  const formattedItem = item as formattedSportItemDTO;
  const startDate = new Date(item.timestamp);
  startDate.setHours(startDate.getHours() - 1);
  const endDate = new Date(item.timestamp);
  endDate.setHours(endDate.getHours() + 3);
  formattedItem.bgData = await fsManager.getBgDataByDate({
    startDate,
    endDate,
  });
  formattedItem.localDateString = formatDateToDateAndTimeString(item.timestamp);
  return formattedItem;
};

const SportTracker: React.FC<{navigation: NavigationProp<any>}> = ({
  navigation,
}) => {
  const [sportItems, setSportItems] = useState<formattedSportItemDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const fsManager = new FirebaseService();

  const getSportItems = async (date: Date) => {
    setIsLoading(true);
    const FSsportItems = await fsManager.getSportItems(date);
    const updatedSportItems = await Promise.all(
      FSsportItems.map((item: SportItemDTO) =>
        formatSportItem(item, fsManager),
      ),
    );
    const sortedSportItems = updatedSportItems.sort((a, b) => {
      return b.timestamp - a.timestamp;
    });
    setSportItems(sortedSportItems);
    setIsLoading(false);
  };

  useEffect(() => {
    getSportItems(new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      getSportItems(new Date());
    }, []),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => <SportTrackerHeader />,
    });
  }, [navigation]);

  const renderItem = ({
    item,
    index,
  }: {
    item: formattedSportItemDTO;
    index: number;
  }) => {
    return (
      <SportItem
        // navigation={navigation}
        sportItem={item}
        // index={index}
        // groupBy={groupBy}
      />
    );
  };

  const handleAddSportItemPress = () => {
    // navigate to add sport item screen
    navigation.navigate(ADD_SPORT_ITEM_SCREEN);
  };

  return (
    <Styled.Container>
      <Styled.BackgroundImage
        source={require('app/assets/Franek_woman_in_transparent_sport_bra_futuristic_outfit_cyberpu_1fbf6e84-1ad1-4fb8-8446-d4514d0e8f58.png')}>
        <FlatList
          data={sportItems}
          keyExtractor={(item, index) => index.toString()}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <Styled.Separator />}
          ListEmptyComponent={() => (
            <Styled.EmptyListText>No sport items yet</Styled.EmptyListText>
          )}
        />
      </Styled.BackgroundImage>
      <Button
        onClick={handleAddSportItemPress}
        text="Add Sport Item"
        icon={<Icon name="add-circle" size={30} color="white" />}
      />
    </Styled.Container>
  );
};

export default SportTracker;
