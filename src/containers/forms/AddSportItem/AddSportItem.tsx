import React, { useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SportItemDTO } from "app/types/sport.types";
import SportItemForm from "app/components/forms/SportForm";
import { Theme } from "app/types/theme";
import { ImageBackground } from "react-native";
import styled from "styled-components/native";

import gymImage from "app/assets/woman_in_gym.png";
import runningImage from "app/assets/woman_running_strong.png"
import useAddSportItem from "app/hooks/sport/useAddSportItem";

interface AddSportItemProps {
}

const AddSportItem: React.FC<AddSportItemProps> = () => {
  const navigation = useNavigation();

  const [sportItem, setSportItem] = useState<SportItemDTO | null>(null);
  const [selectedSportType, setSelectedSportType] = useState<"GYM" | "RUNNING">(
    "GYM"
  );

  const { addSportItem, isLoading, error } = useAddSportItem();

  useFocusEffect(
    React.useCallback(() => {
      setSportItem(null);
    }, [])
  );

  const handleAddSportItem = async (values: SportItemDTO) => {
    const sportItemDTO: SportItemDTO = {
      name: values.name,
      durationMinutes: values.durationMinutes,
      intensity: values.intensity,
      timestamp: new Date().getTime()
    };
    await addSportItem(sportItemDTO);
    navigation.goBack();
  };

  const submitHandlerRef = React.useRef<null | (() => void)>(null);

  const sportTypeBackground = {
    GYM: gymImage,
    RUNNING: runningImage
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
    justifyContent: "center",
    paddingHorizontal: 20
  },
  sportTypeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold"
  }
};

export default AddSportItem;
