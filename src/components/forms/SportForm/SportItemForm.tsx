import { Controller, useForm } from "react-hook-form";
import styled from "styled-components/native";
import React, { MutableRefObject, useEffect, useState } from "react";
import { SportItemDTO } from "app/types/sport.types";
import { Theme } from "app/types/theme";
import { Slider, Text, TouchableOpacity } from "react-native";
import { SubmitButton } from "app/components/forms/SportForm/components/SubmitButton";
import { SportTypeButton, SportTypesContainer } from "app/components/forms/SportForm/components/SportTypeButton";

interface SportItemFormProps {
  sportItem?: SportItemDTO;
  onSubmit: (data: SportItemDTO) => void;
  submitHandlerRef: MutableRefObject<null | (() => void)>;
  selectedSportType: "GYM" | "RUNNING";
}

const SportItemForm = ({
                         sportItem,
                         onSubmit,
                         submitHandlerRef,
                         selectedSportType,
                         setSelectedSportType
                       }: SportItemFormProps) => {
  const {
    control,
    setValue,
    handleSubmit,
    formState: { errors }
  } = useForm<SportItemDTO>({
    defaultValues: {
      name: sportItem?.name || "",
      durationMinutes: sportItem?.durationMinutes || 0,
      intensity: sportItem?.intensity || 0,
      timestamp: sportItem?.timestamp || 0
    }
  });

  useEffect(() => {
    submitHandlerRef.current = () => handleSubmit(onSubmit);
    setValue("name", selectedSportType === "GYM" ? "Gym Workout" : "Running");
  }, [handleSubmit, onSubmit, submitHandlerRef, selectedSportType, setValue]);

  const durationOptions = [
    { label: "15 minutes", value: 15 },
    { label: "Half an hour", value: 30 },
    { label: "45 minutes", value: 45 },
    { label: "1 Hour", value: 60 },
    { label: "2 Hours", value: 120 },
    { label: "4 Hours", value: 240 },
    { label: "8 Hours", value: 480 }
  ];

  const DurationButton = ({ label, value, isSelected, onPress }) => (
    <TouchableOpacity
      onPress={() => {
        onPress();
        setValue("durationMinutes", value);
      }}
      style={[styles.durationButton, isSelected && styles.durationButtonSelected]}
    >
      <Text style={styles.durationButtonText}>{label}</Text>
    </TouchableOpacity>
  );

  const [selectedDuration, setSelectedDuration] = useState<number>(0);


  return (
    <>
      <Container>
        <Controller
          control={control}
          name="name"
          rules={rules.name}
          render={({ field: { onChange, value } }) => (
            <FormInput
              placeholder="Name"
              onChangeText={(text) => onChange(text)}
              value={value}
              error={errors.name?.message}
            />
          )}
        />
        <DurationOptionsContainer>
          {durationOptions.map((option) => (
            <DurationButton key={option.value} label={option.label} value={option.value}
                            isSelected={selectedDuration === option.value}
                            onPress={() => setSelectedDuration(option.value)} />
          ))}
        </DurationOptionsContainer>
        <Controller
          control={control}
          name="intensity"
          rules={rules.intensity}
          render={({ field: { onChange, value } }) => (
            <>
              <IntensityText>Intensity: {value}</IntensityText>
              <Slider
                style={styles.slider}
                minimumValue={1}
                maximumValue={10}
                step={1}
                value={value}
                onValueChange={(val) => onChange(val)}
                thumbTintColor="white"
                minimumTrackTintColor="white"
              />
              <SubmitButton onPress={handleSubmit(onSubmit)} />
            </>
          )}
        />
      </Container>
      <SportTypesContainer>
        <SportTypeButton
          title="GYM"
          iconName="dumbbell"
          onPress={() => {
            setSelectedSportType("GYM");
            setValue("name", "Gym Workout");
          }}
          isSelected={selectedSportType === "GYM"}
        />
        <SportTypeButton
          title="RUNNING"
          iconName="run-fast"
          onPress={() => {
            setSelectedSportType("RUNNING");
            setValue("name", "Running");
          }}
          isSelected={selectedSportType === "RUNNING"}
        />
      </SportTypesContainer>
    </>
  );
};

const Container = styled.View<{ theme: Theme }>`
  flex: 1;
  padding: ${({ theme }) => theme.dimensions.width * 0.05}px;
`;

const FormInput = styled.TextInput`
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 10px;
  margin-bottom: 10px;
  background-color: rgba(255, 255, 255, 0.9);
`;

const IntensityText = styled.Text`
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 10px;
  color: #fff;
  background-color: rgba(0, 0, 0, 0.5);
  padding: 10px;
  align-items: center;
  justify-content: center;
  text-align: center;
`;


const DurationOptionsContainer = styled.TouchableOpacity<{ theme: Theme, isSelected: boolean }>`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  margin-bottom: 10px;
  ${({ isSelected }) => isSelected && "background-color: #5b5b5b;"}

`;


const styles = {
  durationButtonSelected: {
    backgroundColor: "#5b5b5b"
  },
  durationButton: {
    backgroundColor: "#3f3f3f",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    width: "48%"
  },
  durationButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold"
  },
  slider: {
    width: "100%",
    height: 40
  }
};

const rules = {
  name: {
    required: "Name is required"
  },
  durationMinutes: {
    required: "Duration is required",
    min: {
      value: 1,
      message: "Duration must be at least 1 minute"
    },
    max: {
      value: 1440,
      message: "Duration must be at most 1440 minutes"
    }
  },
  intensity: {
    required: "Intensity is required",
    min: {
      value: 1,
      message: "Intensity must be at least 1"
    },
    max: {
      value: 10,
      message: "Intensity must be at most 10"
    }
  }
};

export default SportItemForm;
