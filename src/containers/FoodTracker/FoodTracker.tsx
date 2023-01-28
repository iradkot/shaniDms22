import React, {useEffect, useState} from 'react';
import {FlatList, Text} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import styled from 'styled-components/native';
import FoodCard from 'app/containers/FoodTracker/Components/FoodCard';
import {FirebaseService} from 'app/services/FirebaseService';
import {FoodItemDTO} from 'app/types/foodItems';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import {BgSample} from 'app/types/day_bgs';
import {Theme} from 'app/types/theme';

interface formattedItemDTO extends FoodItemDTO {
  date: string; // formatted date
  image: string;
  bgData: BgSample[];
}

const FoodTracker: React.FC = () => {
  const [foodItems, setFoodItems] = useState<formattedItemDTO[]>([]);
  const [showLastMeal, setShowLastMeal] = useState(true);
  const [showMealsToday, setShowMealsToday] = useState(true);
  const [showMealsFromBefore, setShowMealsFromBefore] = useState(true);

  const getFoodItems = async (date: Date) => {
    const fsManager = new FirebaseService();
    const FSfoodItems = await fsManager.getFoodItems(date);
    // replace image with the image url from firebase
    for (const item of FSfoodItems) {
      item.image = await fsManager.getFoodItemImage(item.image);
      item.bgData = await fsManager.getFoodItemBgData(item);
      item.date = formatDateToLocaleTimeString(item.timestamp);
    }
    console.log('FSfoodItems', FSfoodItems);
    setFoodItems(FSfoodItems);
    return FSfoodItems;
  };

  useEffect(() => {
    getFoodItems(new Date()).then(r => setFoodItems(r));
  }, []);

  return (
    <Container>
      <Section>
        <SectionTitle onPress={() => setShowLastMeal(!showLastMeal)}>
          <TitleText>Last Meal</TitleText>
          <MaterialIcons
            name={showLastMeal ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
            size={24}
            color="black"
          />
        </SectionTitle>
        {showLastMeal && (
          <SectionContent disabled>
            <FlatList
              data={foodItems}
              renderItem={({item}) => (
                <FoodCard
                  image={item.image}
                  name={item.name}
                  bgData={item.bgData || []}
                  date={item.date}
                  notes={item.notes}
                />
              )}
              keyExtractor={item => item.timestamp.toString()}
            />
          </SectionContent>
        )}
      </Section>
      <Section>
        <SectionTitle onPress={() => setShowMealsToday(!showMealsToday)}>
          <TitleText>Meals Today</TitleText>
          <MaterialIcons
            name={showMealsToday ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
            size={24}
            color="black"
          />
        </SectionTitle>
        {showMealsToday && (
          <SectionContent>
            <Text>Meals Today Content Goes Here</Text>
          </SectionContent>
        )}
      </Section>
      <Section>
        <SectionTitle
          onPress={() => setShowMealsFromBefore(!showMealsFromBefore)}>
          <TitleText>Meals From Before</TitleText>
          <MaterialIcons
            name={
              showMealsFromBefore ? 'keyboard-arrow-up' : 'keyboard-arrow-down'
            }
            size={24}
            color="black"
          />
        </SectionTitle>
        {showMealsFromBefore && (
          <SectionContent>
            <Text>Meals From Before Content Goes Here</Text>
          </SectionContent>
        )}
      </Section>
    </Container>
  );
};

const Container = styled.View<{theme: Theme}>`
  flex: 1;
  max-height: 75%;
  padding: 16px;
`;

const Section = styled.View`
  margin-bottom: 16px;
  border-bottom-width: 1px;
  border-bottom-color: #ccc;
`;

const SectionTitle = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
`;

const TitleText = styled.Text`
  font-size: 18px;
  font-weight: bold;
`;

const SectionContent = styled.TouchableOpacity`
  width: 100%;
`;

export default FoodTracker;
