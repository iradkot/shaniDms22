import React, {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import {NavigationProp} from '@react-navigation/native';
import {FlatList} from 'react-native-gesture-handler';
import SportTrackerHeader from 'app/containers/MainTabsNavigator/Containers/SportTracker/components/SportTrackerHeader';
import * as Styled from 'app/containers/MainTabsNavigator/Containers/SportTracker/styles';
import SportItem from 'app/containers/MainTabsNavigator/Containers/SportTracker/components/SportItem';
import Button from 'app/components/Button/Button';
import Icon from 'react-native-vector-icons/Ionicons';
import {ADD_SPORT_ITEM_SCREEN} from 'app/constants/SCREEN_NAMES';
import {Animated} from 'react-native';
import SportItemsContext from 'app/contexts/SportItemsContext';

import {fetchSportItems} from 'app/utils/sportItems.utils';
import {SportItemDTO} from 'app/types/sport.types';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

const SportTracker: React.FC<{navigation: NavigationProp<any>}> = ({
  navigation,
}) => {
  const {sportItems, setSportItems} = useContext(SportItemsContext);

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => <SportTrackerHeader />,
    });
  }, [navigation]);

  const handleAddSportItemPress = () => {
    navigation.navigate(ADD_SPORT_ITEM_SCREEN);
  };

  const y = useMemo(() => new Animated.Value(0), []);
  const onScroll = Animated.event([{nativeEvent: {contentOffset: {y}}}], {
    useNativeDriver: true,
  });

  const ListRef = useRef(null);

  useEffect(() => {
    ListRef.current?.scrollToOffset({animated: false, offset: 0});
    fetchSportItems(setSportItems);
  }, [setSportItems]);

  const renderItem = ({item, index}: {item: SportItemDTO; index: number}) => {
    if (typeof item === 'string') {
      return <Styled.SectionHeader>{item}</Styled.SectionHeader>;
    }
    return (
      <SportItem sportItem={item} y={y} key={item.timestamp} index={index} />
    );
  };

  // @ts-ignore
  // @ts-ignore
  return (
    <Styled.Container testID={E2E_TEST_IDS.screens.sport}>
      <Styled.BackgroundImage
        source={require('app/assets/Franek_woman_in_transparent_sport_bra_futuristic_outfit_cyberpu_1fbf6e84-1ad1-4fb8-8446-d4514d0e8f58.png')}>
        <AnimatedFlatList
          // @ts-ignore
          animated={true}
          useNativeDriver={true}
          ref={ListRef}
          scrollEventThrottle={16}
          bounces={false}
          keyExtractor={(item: SportItemDTO, index: number) =>
            item.startTimestamp
          }
          onScroll={onScroll}
          data={Object.entries(sportItems).flat().flat()}
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
        testID={E2E_TEST_IDS.sport.addButton}
        icon={<Icon name="add-circle" size={30} color="white" />}
      />
    </Styled.Container>
  );
};

export default SportTracker;
