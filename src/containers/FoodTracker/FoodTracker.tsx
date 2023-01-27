import React, {useState} from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import styled from 'styled-components/native';

const Tab = createBottomTabNavigator();

const FoodTracker: React.FC = () => {
  const [showLastMeal, setShowLastMeal] = useState(true);
  const [showMealsToday, setShowMealsToday] = useState(true);
  const [showMealsFromBefore, setShowMealsFromBefore] = useState(true);

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
          <SectionContent>
            <Text>Last Meal Content Goes Here</Text>
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

const Container = styled.View`
  flex: 1;
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
  height: 100px;
  width: 100%;
`;

export default FoodTracker;
