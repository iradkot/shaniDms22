import React from 'react';
import styled, {css} from 'styled-components/native';

export const Container = styled.View`
  flex: 1;
  background-color: #fff;
`;

export const TextInput = styled.TextInput`
  height: 40px;
  border-color: #ccc;
  border-width: 1px;
  padding: 10px;
  margin: 10px;
`;

export const Button = styled.TouchableOpacity`
  height: 40px;
  background-color: #ccc;
  padding: 10px;
  margin: 10px;
  align-items: center;
  justify-content: center;
`;

export const ButtonText = styled.Text`
  color: #fff;
`;

export const Switch = styled.Switch`
  margin: 10px;
`;

// Select and SelectItem are used for choosing trend
export const Select = styled.View`
  min-height: 40px;
  border-color: #ccc;
  border-width: 1px;
  padding: 10px;
  margin: 10px;
`;

const SelectItemContainer = styled.TouchableOpacity`
  height: 40px;
  padding: 10px;
  margin: 5px;
  align-items: center;
  justify-content: center;
  border: 1px solid #ccc;
  ${(props: {selected: boolean}) =>
    props.selected
      ? css`
          background-color: #ccc;
        `
      : css`
          background-color: #fff;
        `}
`;

export const SelectItemText = styled.Text`
  color: #fff;
  ${(props: {selected: boolean}) =>
    props.selected
      ? css`
          color: #fff;
        `
      : css`
          color: #000;
        `}
`;

export const SelectItem = ({
  label,
  value,
  selected,
  onPress,
}: {
  label: string;
  value: string;
  selected: boolean;
  onPress: (value: string) => void;
}) => {
  return (
    <SelectItemContainer onPress={() => onPress(value)} selected={selected}>
      <SelectItemText selected={selected}>{label}</SelectItemText>
    </SelectItemContainer>
  );
};

export const ErrorText = styled.Text`
  color: red;
  margin: 10px;
`;

export const TimePickerContainer = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  margin: 10px;
`;

export const TimePickerButton = styled.TouchableOpacity`
  height: 40px;
  background-color: #ccc;
  padding: 10px;
  margin: 10px;
  align-items: center;
  justify-content: center;
`;

export const TimePickerText = styled.Text`
  color: #000;
  margin: 10px;
  z-index: 2;
  height: 40px;
  padding: 10px;
`;
