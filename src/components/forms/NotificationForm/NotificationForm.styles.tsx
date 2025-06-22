export const InfoIconTouchable = styled.TouchableOpacity`
  margin-left: 6px;
  padding: 2px 4px;
`;

export const InfoIcon = styled.Text`
  font-size: 15px;
  color: #1976d2;
  font-weight: bold;
`;

export const TrendInfoBox = styled.View`
  background-color: #e3eafc;
  border-radius: 8px;
  padding: 10px 12px;
  margin: 8px 0 4px 0;
`;

export const TrendInfoText = styled.Text`
  color: #222;
  font-size: 14px;
`;

export const TrendInfoBullet = styled.Text`
  color: #1976d2;
  font-size: 16px;
  font-weight: bold;
`;

export const Bold = styled.Text`
  font-weight: bold;
  color: #222;
`;
import { ScrollView } from 'react-native';
export const TrendSelectorScroll = styled.ScrollView`
  flex-direction: row;
  margin: 12px 0 8px 0;
  padding-left: 8px;
`;

export const TrendOptionButton = styled.TouchableOpacity<{selected: boolean}>`
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background-color: ${({selected}) => (selected ? '#e3f2fd' : 'transparent')};
  border-width: ${({selected}) => (selected ? '2px' : '1px')};
  border-color: ${({selected}) => (selected ? '#1976d2' : '#ccc')};
`;

export const TrendIconWrapper = styled.View`
  margin-bottom: 2px;
`;

export const TrendOptionLabel = styled.Text<{selected: boolean}>`
  font-size: 13px;
  color: ${({selected}) => (selected ? '#1976d2' : '#666')};
  font-weight: ${({selected}) => (selected ? 'bold' : 'normal')};
`;
import React from 'react';
import styled, {css} from 'styled-components/native';

export const Container = styled.View`
  flex: 1;
  background-color: #fff;
`;

export const InputWrapper = styled.View`
  margin: 12px 16px 0 16px;
`;

export const InputLabel = styled.Text`
  font-size: 15px;
  color: #444;
  margin-bottom: 4px;
  margin-left: 2px;
`;

export const TextInput = styled.TextInput`
  height: 44px;
  border-color: #b0b0b0;
  border-width: 1px;
  border-radius: 8px;
  padding: 10px 12px;
  background-color: #f7f8fa;
  font-size: 16px;
  color: #222;
  ${({theme}) => theme && theme.textColor ? `color: ${theme.textColor};` : ''}
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
  color: #e53935;
  margin: 6px 18px 0 18px;
  font-size: 13px;
`;

export const TimePickerContainer = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin: 16px 16px 0 16px;
`;

export const TimePickerButton = styled.TouchableOpacity`
  flex: 1;
  height: 44px;
  background-color: #e3eafc;
  border-radius: 8px;
  margin-right: 10px;
  align-items: center;
  justify-content: center;
  border-width: 1px;
  border-color: #b0c4de;
  min-width: 0;
`;

export const TimePickerText = styled.Text`
  color: #1a237e;
  font-size: 16px;
  font-weight: 600;
`;

// Toggle for enabled state
export const ToggleContainer = styled.View`
  align-items: center;
  margin: 10px;
`;

export const ToggleButton = styled.TouchableOpacity<{selected: boolean}>`
  padding: 12px 20px;
  border-radius: 8px;
  background-color: ${props => (props.selected ? '#4caf50' : '#f44336')};
`;

export const ToggleButtonText = styled.Text<{selected: boolean}>`
  color: #fff;
  font-size: 16px;
  font-weight: bold;
`;
