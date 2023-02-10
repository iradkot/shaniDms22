import React, {useEffect, useMemo, useState} from 'react';
import FoodCard from 'app/containers/FoodTracker/Components/FoodCard';
import {FirebaseService} from 'app/services/firebase/FirebaseService';
import {FoodItemDTO, formattedItemDTO} from 'app/types/foodItems.types';
import {isEmpty} from 'lodash';
import Collapsable from 'app/containers/MainTabsNavigator/Containers/Home/components/Collapsable';
import {formatFoodItem} from 'app/containers/FoodTracker/utils';
import {Container, Section} from './styles';
import isToday from 'date-fns/isToday';
import isBefore from 'date-fns/isBefore';
import FoodCardsList from 'app/containers/FoodTracker/Components/FoodCardsList';

const FoodTracker: React.FC = () => {
  const [foodItems, setFoodItems] = useState<formattedItemDTO[]>([]);
  const fsManager = new FirebaseService();

  const getFoodItems = async (date: Date) => {
    const FSfoodItems = await fsManager.getFoodItems(date);
    return await Promise.all(
      FSfoodItems.map((item: FoodItemDTO) => formatFoodItem(item, fsManager)),
    );
  };

  useEffect(() => {
    getFoodItems(new Date()).then(updatedFoodItems =>
      setFoodItems(updatedFoodItems),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastMeal = useMemo(() => {
    if (foodItems.length > 0) {
      return foodItems[foodItems.length - 1];
    }
    return null;
  }, [foodItems]);
  const todayMeals = useMemo(
    () =>
      foodItems.filter(item => {
        return isToday(item.timestamp);
      }),
    [foodItems],
  );

  const mealsFromBefore = useMemo(
    () => foodItems.filter(item => isBefore(item.timestamp, new Date())),
    [foodItems],
  );

  return (
    <Container>
      <Section>
        <Collapsable title={'Last Meal'} initialIsCollapsed={false}>
          {lastMeal && !isEmpty(lastMeal) && (
            <FoodCard
              image={lastMeal.image}
              name={lastMeal.name}
              bgData={lastMeal.bgData || []}
              date={lastMeal.localDateString}
              notes={lastMeal.notes}
            />
          )}
        </Collapsable>
      </Section>
      <Section>
        <Collapsable title={'Meals Today'} initialIsCollapsed={true}>
          {todayMeals && !isEmpty(todayMeals) && (
            <FoodCardsList foodItems={todayMeals} />
          )}
        </Collapsable>
      </Section>
      <Section>
        <Collapsable title={'Meals From Before'} initialIsCollapsed={true}>
          <FoodCardsList foodItems={mealsFromBefore} />
        </Collapsable>
      </Section>
    </Container>
  );
};
export default FoodTracker;
