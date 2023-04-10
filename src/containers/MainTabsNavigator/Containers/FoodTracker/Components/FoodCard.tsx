import React from 'react';
import styled from 'styled-components/native';
import {Theme} from 'app/types/theme';
import Collapsable from 'app/components/Collapsable';
import BgGraph from 'app/components/CgmGraph/CgmGraph';
import {BgSample} from 'app/types/day_bgs';
import {Dimensions, ImageBackground, Text, View} from 'react-native';
import TimeInRangeRow from 'app/containers/MainTabsNavigator/Containers/Home/components/TimeInRangeRow';
import Icon from 'react-native-vector-icons/Ionicons';
import {formattedFoodItemDTO} from 'app/types/food.types';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

interface FoodCardProps {
  imageUri: string;
  name: string;
  notes: string;
  bgSamples: BgSample[];
  date: string; // Date is in string format of 'MM/DD/YYYY'
  carbsGrams: number;
  foodItem: formattedFoodItemDTO;
  onEdit: () => void;
}

const {width} = Dimensions.get('window');

const EditButton = styled.TouchableOpacity`
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 5px;
  border-radius: 25px;
  background-color: rgba(0, 0, 0, 0.5);
  justify-content: center;
  align-items: center;
`;

const FoodCardContainer = styled(View)<{
  theme: Theme;
}>`
  border-radius: 10px;
  background-color: #f9f9f9;
  ${({theme}) => theme.shadow.default}
`;

const FoodCardImage = styled(ImageBackground)`
  height: ${width}px;
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
`;

const FoodCardInfoContainer = styled(View)`
  padding: 20px;
  background-color: #fff;
  border-bottom-left-radius: 10px;
  border-bottom-right-radius: 10px;
  flex: 1;
  flex-direction: column;
  min-height: 200px;
`;

const SectionContainer = styled(View)`
  flex-direction: row;
  align-items: center;
  margin-bottom: 10px;
`;

const SectionIcon = styled(Icon)`
  margin-right: 10px;
`;

const SectionTitle = styled(Text)`
  font-size: 16px;
  font-weight: bold;
  color: #333;
  text-transform: capitalize;
`;

const SectionText = styled(Text)`
  font-size: 16px;
  color: #666;
`;

const FoodCard: React.FC<FoodCardProps> = ({
  imageUri,
  name,
  bgSamples,
  date,
  notes,
  carbsGrams,
  foodItem,
  onEdit,
}) => (
  <FoodCardContainer>
    <FoodCardImage source={{uri: imageUri}}>
      <EditButton onPress={onEdit}>
        <MaterialIcons name="edit" size={24} color="#ffffff" />
      </EditButton>
    </FoodCardImage>
    <TimeInRangeRow bgData={bgSamples} />
    <FoodCardInfoContainer>
      <SectionContainer>
        <SectionIcon name="restaurant-outline" size={24} color="#333" />
        <View>
          <SectionTitle>Name</SectionTitle>
          <SectionText>{name}</SectionText>
        </View>
      </SectionContainer>
      {/*{!!notes && (*/}
      {/*  <SectionContainer>*/}
      {/*    <SectionIcon name="clipboard" size={24} color="#333" />*/}
      {/*    <View>*/}
      {/*      <SectionTitle>Notes</SectionTitle>*/}
      {/*      <SectionText>{notes}</SectionText>*/}
      {/*    </View>*/}
      {/*  </SectionContainer>*/}
      {/*)}*/}
      <SectionContainer>
        <SectionIcon name="nutrition" size={24} color="#333" />
        <View>
          <SectionTitle>Carbs</SectionTitle>
          <SectionText>Carbs: {carbsGrams} </SectionText>
        </View>
      </SectionContainer>
      <SectionContainer>
        <SectionIcon name="calendar" size={24} color="#333" />
        <View>
          <SectionTitle>Date</SectionTitle>
          <SectionText>{date}</SectionText>
        </View>
      </SectionContainer>
      <Collapsable title={'Blood Glucose Data'}>
        <BgGraph
          bgSamples={bgSamples}
          width={width}
          height={width}
          foodItems={[foodItem]}
        />
      </Collapsable>
    </FoodCardInfoContainer>
  </FoodCardContainer>
);

export default FoodCard;
