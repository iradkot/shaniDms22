import styled, {css} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

export const InfoIconTouchable = styled.TouchableOpacity`
  margin-left: 6px;
  padding: 2px 4px;
`;

export const InfoIcon = styled.Text`
  font-size: 15px;
  color: ${({theme}: {theme: ThemeType}) => theme.accentColor};
  font-weight: bold;
`;

export const TrendInfoBox = styled.View`
  background-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.accentColor, 0.12)};
  border-radius: 8px;
  padding: 10px 12px;
  margin: 8px 0 4px 0;
`;

export const TrendInfoText = styled.Text`
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
  font-size: 14px;
`;

export const TrendInfoBullet = styled.Text`
  color: ${({theme}: {theme: ThemeType}) => theme.accentColor};
  font-size: 16px;
  font-weight: bold;
`;

export const Bold = styled.Text`
  font-weight: bold;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;
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
  background-color: ${({selected, theme}: {selected: boolean; theme: ThemeType}) =>
    selected ? addOpacity(theme.accentColor, 0.12) : 'transparent'};
  border-width: ${({selected}) => (selected ? '2px' : '1px')};
  border-color: ${({selected, theme}: {selected: boolean; theme: ThemeType}) =>
    selected ? theme.accentColor : theme.borderColor};
`;

export const TrendIconWrapper = styled.View`
  margin-bottom: 2px;
`;

export const TrendOptionLabel = styled.Text<{selected: boolean}>`
  font-size: 13px;
  color: ${({selected, theme}: {selected: boolean; theme: ThemeType}) =>
    selected ? theme.accentColor : addOpacity(theme.textColor, 0.6)};
  font-weight: ${({selected}) => (selected ? 'bold' : 'normal')};
`;

export const Container = styled.View`
  flex: 1;
  background-color: ${({theme}: {theme: ThemeType}) => theme.backgroundColor};
`;

export const InputWrapper = styled.View`
  margin: 12px 16px 0 16px;
`;

export const InputLabel = styled.Text`
  font-size: 15px;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.75)};
  margin-bottom: 4px;
  margin-left: 2px;
`;

export const TextInput = styled.TextInput`
  height: 44px;
  border-color: ${({theme}: {theme: ThemeType}) => theme.borderColor};
  border-width: 1px;
  border-radius: 8px;
  padding: 10px 12px;
  background-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.04)};
  font-size: 16px;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

export const Button = styled.TouchableOpacity`
  height: 40px;
  background-color: ${({theme}: {theme: ThemeType}) => theme.borderColor};
  padding: 10px;
  margin: 10px;
  align-items: center;
  justify-content: center;
`;

export const ButtonText = styled.Text`
  color: ${({theme}: {theme: ThemeType}) => theme.buttonTextColor};
`;

export const Switch = styled.Switch`
  margin: 10px;
`;

// Select and SelectItem are used for choosing trend
export const Select = styled.View`
  min-height: 40px;
  border-color: ${({theme}: {theme: ThemeType}) => theme.borderColor};
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
  border: 1px solid ${({theme}: {theme: ThemeType}) => theme.borderColor};
  ${(props: {selected: boolean}) =>
    props.selected
      ? css`
          background-color: ${({theme}: {theme: ThemeType}) => theme.borderColor};
        `
      : css`
          background-color: ${({theme}: {theme: ThemeType}) => theme.white};
        `}
`;

export const SelectItemText = styled.Text`
  color: ${({theme}: {theme: ThemeType}) => theme.buttonTextColor};
  ${(props: {selected: boolean}) =>
    props.selected
      ? css`
          color: ${({theme}: {theme: ThemeType}) => theme.buttonTextColor};
        `
      : css`
          color: ${({theme}: {theme: ThemeType}) => theme.textColor};
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
  color: ${({theme}: {theme: ThemeType}) => theme.belowRangeColor};
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
  background-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.accentColor, 0.12)};
  border-radius: 8px;
  margin-right: 10px;
  align-items: center;
  justify-content: center;
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.accentColor, 0.4)};
  min-width: 0;
`;

export const TimePickerText = styled.Text`
  color: ${({theme}: {theme: ThemeType}) => theme.accentColor};
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
  background-color: ${({selected, theme}: {selected: boolean; theme: ThemeType}) =>
    selected ? theme.inRangeColor : theme.belowRangeColor};
`;

export const ToggleButtonText = styled.Text<{selected: boolean}>`
  color: ${({theme}: {theme: ThemeType}) => theme.buttonTextColor};
  font-size: 16px;
  font-weight: bold;
`;
