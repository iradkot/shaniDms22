// this screen is used to add a new sport item to the list of sport items, made with ts and styled-components
import React, {useState} from 'react';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {SportItemDTO} from 'app/types/sport.types';
import SportItemForm from 'app/components/forms/SportForm';
import {Theme} from 'app/types/theme';
import styled from 'styled-components/native';
import {Button} from 'react-native';

interface AddSportItemProps {}

const AddSportItem: React.FC<AddSportItemProps> = () => {
  const navigation = useNavigation();

  const [sportItem, setSportItem] = useState<SportItemDTO | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      setSportItem(null);
    }, []),
  );

  const handleAddSportItem = (values: SportItemDTO) => {
    const sportItemDTO: SportItemDTO = {
      name: values.name,
      durationMinutes: values.durationMinutes,
      intensity: values.intensity,
      timestamp: new Date().getTime(),
    };
    navigation.goBack();
  };

  const submitHandlerRef = React.useRef<null | (() => void)>(null);

  return (
    <Container>
      <SportItemForm
        onSubmit={handleAddSportItem}
        submitHandlerRef={submitHandlerRef}
      />
      <Button
        title="Add"
        onPress={() => {
          submitHandlerRef.current?.();
        }}
      />
    </Container>
  );
};

const Container = styled.View<{theme: Theme}>`
  flex: 1;
  background-color: ${({theme}) => theme.backgroundColor};
  padding: ${({theme}) => theme.dimensions.width * 0.05}px;
`;

export default AddSportItem;
