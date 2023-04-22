import React from 'react';
import {useNavigation} from '@react-navigation/native';
import {SportItemDTO} from 'app/types/sport.types';
import SportItemForm from 'app/components/forms/SportForm';
import {ImageBackground} from 'react-native';
import styled from 'styled-components/native';

import gymImage from 'app/assets/woman_in_gym.png';
import runningImage from 'app/assets/woman_running_strong.png';
import useEditSportItem from 'app/hooks/sport/useEditSportItem';
import {Container, sportTypeBackground} from './styles';

interface EditSportItemProps {
  sportItem: SportItemDTO;
}

const EditSportItem: React.FC<EditSportItemProps> = ({sportItem}) => {
  const navigation = useNavigation();
  const [selectedSportType, setSelectedSportType] = React.useState<
    'GYM' | 'RUNNING'
  >(sportItem.type as 'GYM' | 'RUNNING');

  const {editSportItem, isLoading, error} = useEditSportItem();

  const handleEditSportItem = async (values: SportItemDTO) => {
    const sportItemDTO: SportItemDTO = {
      ...values,
      timestamp: new Date().getTime(),
    };
    await editSportItem(sportItemDTO);
    navigation.goBack();
  };

  const submitHandlerRef = React.useRef<null | (() => void)>(null);

  return (
    <Container>
      <ImageBackground
        source={sportTypeBackground[selectedSportType]}
        resizeMode="cover"
        style={styles.imageBackground}>
        <SportItemForm
          sportItem={sportItem}
          onSubmit={handleEditSportItem}
          submitHandlerRef={submitHandlerRef}
          selectedSportType={selectedSportType}
          setSelectedSportType={setSelectedSportType}
        />
      </ImageBackground>
    </Container>
  );
};

const styles = {
  imageBackground: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
};

export default EditSportItem;
