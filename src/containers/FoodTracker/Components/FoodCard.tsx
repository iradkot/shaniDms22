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
  date: string;
}

const FoodCardContainer = styled.TouchableOpacity<{theme: Theme}>`
  width: 100%;

  min-height: 150px;
  border-radius: 10px;
  background-color: black;
  margin-bottom: 10px;
  box-shadow: 0px 0px 3px ${props => props.theme.accentColor};
  elevation: 2;
  background-color: black;
  padding: 10px;
  marginbottom: 10px;
  shadowcolor: 0px 0px 3px ${props => props.theme.accentColor};
  shadow-offset: {
    width: 2px;
    height: 2px;
  }
  shadow-opacity: 0.5;
  shadow-radius: 2;
`;

const FoodCardImage = styled.Image`
  position: absolute;
  width: 100%;
  height: 100%;
`;

const FoodCardTextContainer = styled.View`
  width: 100%;
  min-height: 20%;
  padding: 10px;
  background-color: rgba(0, 0, 0, 0.4);
`;

const FoodCardName = styled.Text`
  font-size: 38px;
  font-weight: bold;
  color: white;
  elevation: 2;
  text-shadow-color: #ccc;
  text-shadow-offset: {
    width: 1px;
    height: 1px;
  }
  text-shadow-radius: 1px;
  text-transform: capitalize;
`;

const FoodCardNotes = styled.Text<{theme: Theme}>`
  font-size: 14px;
  color: ${props => props.theme.white};
`;

const FoodCardDate = styled.Text<{theme: Theme}>`
  font-size: 18px;
  color: ${props => props.theme.white};
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
      <FoodCardTextContainer>
        <FoodCardName>{name}</FoodCardName>
        <FoodCardNotes>{notes}</FoodCardNotes>
        <FoodCardDate>{date}</FoodCardDate>
      </FoodCardTextContainer>
      <Collapsable title={'Blood Glucose Data'} initialIsCollapsed={false}>
        <BgGraph data={bgData} width={400} height={200} />
      </Collapsable>
    </FoodCardContainer>
  );
};

export default FoodCard;
