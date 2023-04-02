import React, { useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SportItemDTO } from 'app/types/sport.types';
import SportItemForm from 'app/components/forms/SportForm';
import { Theme } from 'app/types/theme';
import { TouchableOpacity, Text, ImageBackground } from 'react-native';
import styled from 'styled-components/native';
import {SportTypeButton} from 'app/components/forms/SportForm/components/SportTypeButton';

import gymImage from 'app/assets/iradkot_Thw_woman_Is_in_the_GYM_6147922e-89dc-4413-967e-5b2e89500075.png';
import runningImage from 'app/assets/iradkot_The_woman_running_towards_the_camera_going_to_run_as_co_863168de-2e5d-4ddd-83ae-31378b5334fe.png';

interface AddSportItemProps {}

const AddSportItem: React.FC<AddSportItemProps> = () => {
  const navigation = useNavigation();

  const [sportItem, setSportItem] = useState<SportItemDTO | null>(null);
  const [selectedSportType, setSelectedSportType] = useState<'GYM' | 'RUNNING'>(
    'GYM',
  );

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
    console.log('sportItemDTO', sportItemDTO);
    navigation.goBack();
  };

  const submitHandlerRef = React.useRef<null | (() => void)>(null);

  const sportTypeBackground = {
    GYM: gymImage,
    RUNNING: runningImage,
  };

  return (
    <Container>
      <ImageBackground
        source={sportTypeBackground[selectedSportType]}
        resizeMode="cover"
        style={styles.imageBackground}
      >
        <SportItemForm
          onSubmit={handleAddSportItem}
          submitHandlerRef={submitHandlerRef}
          selectedSportType={selectedSportType}
          setSelectedSportType={setSelectedSportType}
        />
      </ImageBackground>
    </Container>
  );
};

const Container = styled.View<{ theme: Theme }>`
  flex: 1;
  background-color: ${({ theme }) => theme.backgroundColor};
`;


const styles = {
  imageBackground: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  sportTypeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
};

export default AddSportItem;
