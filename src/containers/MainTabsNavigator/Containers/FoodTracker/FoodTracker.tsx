import React, {useEffect, useMemo, useState} from 'react';
import FoodCard from 'app/containers/MainTabsNavigator/Containers/FoodTracker/Components/FoodCard';
import {FirebaseService} from 'app/services/firebase/FirebaseService';
import {FoodItemDTO, formattedFoodItemDTO} from 'app/types/food.types';
import {cloneDeep, isEmpty} from 'lodash';
import Collapsable from 'app/components/Collapsable';
import {formatFoodItem} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/utils';
import {
  Container,
  ScrollContainer,
  Section,
} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/styles';
import FoodCardsList from 'app/containers/MainTabsNavigator/Containers/FoodTracker/Components/FoodCardsList';
import FoodCameraButton from 'app/containers/MainTabsNavigator/Containers/FoodTracker/Components/FoodCameraButton';
import {NavigationProp} from '@react-navigation/native';
import {getRelativeDateText} from 'app/utils/datetime.utils';
import Loader from 'app/components/common-ui/Loader/Loader';
import {EDIT_FOOD_ITEM_SCREEN} from 'app/constants/SCREEN_NAMES';

type groupBy = 'day' | 'week' | 'food' | 'exact food';

const FoodTracker: React.FC<{navigation: NavigationProp<any>}> = ({
  navigation,
}) => {
  const [foodItems, setFoodItems] = useState<formattedFoodItemDTO[]>([]);
  const [fsFoodItems, setFsFoodItems] = useState<FoodItemDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // const [groupBy, setGroupBy] = useState<groupBy>('day');
  const fsManager = new FirebaseService();

  const getFoodItems = async (date: Date) => {
    setIsLoading(true);
    const FSfoodItems = await fsManager.getFoodItems(date);
    setFsFoodItems(cloneDeep(FSfoodItems));
    setIsLoading(false);
  };

  useEffect(() => {
    getFoodItems(new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortAndFormatFoodItems = async () => {
    const updatedFoodItems = await Promise.all(
      fsFoodItems.map((item: FoodItemDTO) => formatFoodItem(item, fsManager)),
    );
    const sortedFoodItems = updatedFoodItems.sort((a, b) => {
      return b.timestamp - a.timestamp;
    });
    setFoodItems(cloneDeep(sortedFoodItems));
  };

  useEffect(() => {
    setIsLoading(true);
    sortAndFormatFoodItems();
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fsFoodItems]);

  const lastMeal = useMemo(() => {
    if (foodItems.length > 0) {
      return foodItems[0];
    }
    return null;
  }, [foodItems]);

  const groupByFood = (acc: any, cur: formattedFoodItemDTO) => {
    const wordsToIgnoreEnglish = [
      'and',
      'the',
      'a',
      'an',
      'of',
      'with',
      'in',
      'to',
    ];
    const wordsToIgnoreHe = ['עם', 'ו2'];

    const wordsToIgnore = wordsToIgnoreEnglish.concat(wordsToIgnoreHe);
    const nameWords = cur.name.toLowerCase().split(' ');

    for (let i = 0; i < nameWords.length; i++) {
      const word = nameWords[i];
      if (!wordsToIgnore.includes(word)) {
        if (word.length > 1) {
          if (!acc[word]) {
            acc[word] = {meals: [], count: 0};
          }
          acc[word].meals.push(cur);
          acc[word].count++;
        }
      }
    }
    return acc;
  };

  const groupedMeals = useMemo(() => {
    const grouped = foodItems.reduce(
      groupByFood,
      {} as {[date: string]: {meals: formattedFoodItemDTO[]; count: number}},
    );

    function groupByDay(acc: any, cur: formattedFoodItemDTO) {
      const date = getRelativeDateText(new Date(cur.timestamp));

      if (!acc[date]) {
        acc[date] = {meals: [], count: 0};
      }
      acc[date].meals.push(cur);
      acc[date].count++;
      return acc;
    }

    return Object.entries(grouped).map(([date, {meals, count}]) => ({
      date,
      meals,
      count,
    }));
  }, [foodItems]);

  return (
    <Container>
      {isLoading ? (
        <Loader />
      ) : (
        <ScrollContainer>
          <Section>
            <Collapsable title={'Last Meal'} initialIsCollapsed={false}>
              {lastMeal && !isEmpty(lastMeal) && (
                <FoodCard
                  onEdit={() => {
                    navigation.navigate(EDIT_FOOD_ITEM_SCREEN, {
                      foodItem: lastMeal,
                      setFsFoodItems,
                    });
                  }}
                  imageUri={lastMeal.image}
                  name={lastMeal.name}
                  bgSamples={lastMeal.bgData || []}
                  date={lastMeal.localDateString}
                  notes={lastMeal.notes}
                  carbsGrams={lastMeal.carbs}
                  foodItem={lastMeal}
                />
              )}
            </Collapsable>
          </Section>
          {groupedMeals.map(({date, meals, count}) => (
            <Section key={date}>
              <Collapsable
                title={`${date} (${count})`}
                initialIsCollapsed={true}>
                <FoodCardsList foodItems={meals} />
              </Collapsable>
            </Section>
          ))}
        </ScrollContainer>
      )}
      <FoodCameraButton
        navigation={navigation}
        setFsFoodItems={setFsFoodItems}
      />
    </Container>
  );
};

export default FoodTracker;
