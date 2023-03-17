import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {NavigationProp} from '@react-navigation/native';
import {FirebaseService} from 'app/services/firebase/FirebaseService';
import {FlatList} from 'react-native-gesture-handler';
import SportTrackerHeader from './components/SportTrackerHeader';
import * as Styled from './styles';
import {formattedSportItemDTO, SportItemDTO} from 'app/types/sport.types';
import {
  formatDateToDateAndTimeString,
  getRelativeDateText,
} from 'app/utils/datetime.utils';
import SportItem from './components/SportItem';
import Button from 'app/components/Button/Button';
import Icon from 'react-native-vector-icons/Ionicons';
import {ADD_SPORT_ITEM_SCREEN} from 'app/constants/SCREEN_NAMES';
import {Animated} from 'react-native';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

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
  const [sportItems, setSportItems] = useState<
    Record<string, formattedSportItemDTO[]>
  >({});
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
    const groupedSportItems = sortedSportItems.reduce((grouped, item) => {
      const relativeDateText = getRelativeDateText(item.timestamp);
      if (!grouped[relativeDateText]) {
        grouped[relativeDateText] = [];
      }
      grouped[relativeDateText].push(item);
      return grouped;
    }, {});

    setSportItems(groupedSportItems);
    setIsLoading(false);
  };

  // useFocusEffect(
  //   React.useCallback(() => {
  //     getSportItems(new Date());
  //   }, []),
  // );

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => <SportTrackerHeader />,
    });
  }, [navigation]);

  const handleAddSportItemPress = () => {
    // navigate to add sport item screen
    navigation.navigate(ADD_SPORT_ITEM_SCREEN);
  };

  /**
   * Animated scroll
   * @type {Animated.Value<number>}
   */
  const y = useMemo(() => new Animated.Value(0), []);

  const onScroll = Animated.event([{nativeEvent: {contentOffset: {y}}}], {
    useNativeDriver: true,
  });

  const ListRef = useRef(null);

  useEffect(() => {
    ListRef.current.scrollToOffset({animated: false, offset: 0});
    getSportItems(new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Styled.Container>
      <Styled.BackgroundImage
        source={require('app/assets/Franek_woman_in_transparent_sport_bra_futuristic_outfit_cyberpu_1fbf6e84-1ad1-4fb8-8446-d4514d0e8f58.png')}>
        <AnimatedFlatList
          animated={true}
          useNativeDriver={true}
          ref={ListRef}
          scrollEventThrottle={16} // <-- Use 1 in production so scrolling feels smooth
          bounces={false} // <-- Disable bounce effect
          keyExtractor={(item, index) => index.toString()}
          onScroll={onScroll}
          data={Object.entries(sportItems).flat().flat()}
          renderItem={({item, index}) => {
            if (typeof item === 'string') {
              return <Styled.SectionHeader>{item}</Styled.SectionHeader>;
            }
            return (
              <SportItem
                sportItem={item}
                y={y}
                key={item.timestamp}
                index={index}
              />
            );
          }}
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
