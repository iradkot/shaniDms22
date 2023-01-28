import React from 'react';
import {View, Image, Text} from 'react-native';
import styled from 'styled-components/native';
import {Theme} from 'app/types/theme';
import Collapsable from 'app/containers/MainTabsNavigator/Containers/Home/components/Collapsable';
import BgGraph from 'app/components/CgmGraph/CgmGraph';
import {BgSample} from 'app/types/day_bgs';

interface FoodCardProps {
  image: string;
  name: string;
  notes: string;
  bgData: BgSample[];
  date: string;
}

const FoodCardContainer = styled.TouchableOpacity<{theme: Theme}>`
  width: 100%;
  min-height: 250px;
  border-radius: 10px;
  background-color: #f9f9f9;
  margin-bottom: 10px;
  box-shadow: 0px 0px 8px #ccc;
  elevation: 2;
  padding: 10px;
`;

const FoodCardImage = styled.Image`
  width: 100%;
  height: 150px;
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
`;

const FoodCardInfoContainer = styled.View`
  width: 100%;
  padding: 10px;
  background-color: #fff;
  border-bottom-left-radius: 10px;
  border-bottom-right-radius: 10px;
`;

const FoodCardName = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: #333;
  text-transform: capitalize;
  margin-bottom: 5px;
`;

const FoodCardNotes = styled.Text`
  font-size: 14px;
  color: #666;
  margin-bottom: 10px;
`;

const FoodCardDate = styled.Text`
  font-size: 14px;
  color: #666;
  text-align: right;
`;

const FoodCard: React.FC<FoodCardProps> = ({
  image,
  name,
  bgData,
  date,
  notes,
}) => {
  return (
    <FoodCardContainer>
      <FoodCardImage source={{uri: image}} />
      <FoodCardInfoContainer>
        <FoodCardName>{name}</FoodCardName>
        <FoodCardNotes>{notes}</FoodCardNotes>
        <FoodCardDate>{date}</FoodCardDate>
      </FoodCardInfoContainer>
      <Collapsable title={'Blood Glucose Data'} initialIsCollapsed={false}>
        <BgGraph data={bgData} width={400} height={200} />
      </Collapsable>
    </FoodCardContainer>
  );
};

export default FoodCard;
