import React, {useState} from 'react';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {SportItemDTO} from 'app/types/sport.types';
import SportItemForm from 'app/components/forms/SportForm';

import useAddSportItem from 'app/hooks/sport/useAddSportItem';
import {Container} from './styles';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';

interface AddSportItemProps {}

const AddSportItem: React.FC<AddSportItemProps> = () => {
  const navigation = useNavigation();

  const [sportItem, setSportItem] = useState<SportItemDTO | null>(null);

  const {addSportItem, isLoading, error} = useAddSportItem();

  useFocusEffect(
    React.useCallback(() => {
      setSportItem(null);
    }, []),
  );

  const handleAddSportItem = async (values: SportItemDTO) => {
    const sportItemDTO: SportItemDTO = {
      ...values,
      timestamp: new Date().getTime(),
    };
    await addSportItem(sportItemDTO);
    navigation.goBack();
  };

  const submitHandlerRef = React.useRef<null | (() => void)>(null);

  return (
    <Container testID={E2E_TEST_IDS.screens.sportAdd}>
      <SportItemForm
        onSubmit={handleAddSportItem}
        submitHandlerRef={submitHandlerRef}
      />
    </Container>
  );
};

export default AddSportItem;
