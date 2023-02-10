import React from 'react';
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
  date: string; // Date is in string format of 'MM/DD/YYYY'
}

const FoodCardContainer = styled.View<{
  theme: Theme;
}>`
  width: 100%;
  border-radius: 10px;
  background-color: #f9f9f9;
  margin-bottom: 10px;
  ${({theme}) => theme.shadow.default}
  padding: 10px;
  flex-direction: column;
`;

const FoodCardImage = styled.ImageBackground`
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
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
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
}) => (
  <FoodCardContainer>
    <FoodCardImage source={{uri: image}} />
    <FoodCardInfoContainer>
      <FoodCardName>{name}</FoodCardName>
      <FoodCardNotes>{notes}</FoodCardNotes>
      <FoodCardDate>{date}</FoodCardDate>
    </FoodCardInfoContainer>
    <Collapsable title={'Blood Glucose Data'} initialIsCollapsed={true}>
      <BgGraph data={bgData} width={400} height={200} />
    </Collapsable>
  </FoodCardContainer>
);

export default FoodCard;
