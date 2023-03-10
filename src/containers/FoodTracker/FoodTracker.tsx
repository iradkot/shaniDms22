import React, {useEffect, useMemo, useState} from 'react';
import {Text} from 'react-native';
import FoodCard from 'app/containers/FoodTracker/Components/FoodCard';
import {FirebaseService} from 'app/services/firebase/FirebaseService';
import {FoodItemDTO, formattedItemDTO} from 'app/types/food.types';
import {isEmpty} from 'lodash';
import Collapsable from 'app/containers/MainTabsNavigator/Containers/Home/components/Collapsable';
import {formatFoodItem} from 'app/containers/FoodTracker/utils';
import {Container, ScrollContainer, Section} from './styles';
import {format, isSameDay, subDays, startOfWeek, endOfWeek} from 'date-fns';
import FoodCardsList from 'app/containers/FoodTracker/Components/FoodCardsList';
import FoodCameraButton from 'app/containers/FoodTracker/Components/FoodCameraButton';
import {NavigationProp} from '@react-navigation/native';
import {formatDateToLocaleDateString} from 'app/utils/datetime.utils';

const formatDate = (date: Date) => {
  const today = new Date();
  const yesterday = subDays(today, 1);

  if (isSameDay(date, today)) {
    return `Today, ${format(date, 'MMM d')}`;
  } else if (isSameDay(date, yesterday)) {
    return `Yesterday, ${format(date, 'MMM d')}`;
  } else if (date > subDays(today, 7)) {
    return `${format(date, 'EEEE')}, ${format(date, 'MMM d')}`;
  } else if (
    date >= startOfWeek(subDays(today, 14)) &&
    date <= endOfWeek(subDays(today, 14))
  ) {
    return `${format(date, 'EEEE')}, ${format(date, 'MMM d')}`;
  } else {
    return format(date, 'MMM d');
  }
};

const FoodTracker: React.FC<{navigation: NavigationProp<any>}> = ({
  navigation,
}) => {
  const [foodItems, setFoodItems] = useState<formattedItemDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const fsManager = new FirebaseService();

  const getFoodItems = async (date: Date) => {
    setIsLoading(true);
    const FSfoodItems = await fsManager.getFoodItems(date);
    const updatedFoodItems = await Promise.all(
      FSfoodItems.map((item: FoodItemDTO) => formatFoodItem(item, fsManager)),
    );
    const sortedFoodItems = updatedFoodItems.sort((a, b) => {
      return b.timestamp - a.timestamp;
    });
    setFoodItems(sortedFoodItems);
    setIsLoading(false);
  };

  useEffect(() => {
    getFoodItems(new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastMeal = useMemo(() => {
    if (foodItems.length > 0) {
      return foodItems[0];
    }
    return null;
  }, [foodItems]);

  const groupedMeals = useMemo(() => {
    const grouped = foodItems.reduce((acc, cur) => {
      const date = formatDate(new Date(cur.timestamp));

      if (!acc[date]) {
        acc[date] = {meals: [], count: 0};
      }
      acc[date].meals.push(cur);
      acc[date].count++;
      return acc;
    }, {} as {[date: string]: {meals: formattedItemDTO[]; count: number}});
    return Object.entries(grouped).map(([date, {meals, count}]) => ({
      date,
      meals,
      count,
    }));
  }, [foodItems]);

  return (
    <Container>
      {isLoading ? (
        <Text>Loading...</Text>
      ) : (
        <ScrollContainer>
          <Section>
            <Collapsable title={'Last Meal'} initialIsCollapsed={false}>
              {lastMeal && !isEmpty(lastMeal) && (
                <FoodCard
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
        // onTakePhoto={async (uri) => {
        //   navigation.navigate('FoodDetails', {
        //     imageUri: uri,
        //     onSave: async (foodItem: formattedItemDTO) => {
        //       setFoodItems([...foodItems, foodItem]);
        //     },
        //   });
        // }}
      />
    </Container>
  );
};

export default FoodTracker;
