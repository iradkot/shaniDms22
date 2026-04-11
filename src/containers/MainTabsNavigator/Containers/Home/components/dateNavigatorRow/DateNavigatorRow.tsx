import React, {FC, useMemo, useState} from 'react';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {
    ButtonContainer,
    Container,
    DateButton,
    DateText,
    IconContainer,
} from './DateNavigatorRow.style';
import LoadingIcon from '../../../../../../components/LoadingIcon';

interface DateNavigatorRowProps {
    date: Date;
    isToday: boolean;
    onGoBack: () => void;
    onGoForward: () => void;
    resetToCurrentDate: () => void;
    setCustomDate: (date: Date) => void;
    isLoading: boolean; // Indicates if the data is loading
}

export const DateNavigatorRow: FC<DateNavigatorRowProps> = ({
    date,
    isToday,
    onGoBack,
    onGoForward,
    resetToCurrentDate,
    setCustomDate,
    isLoading,
}) => {
    const [isDateModalVisible, setIsDateModalVisible] = useState(false);
    const theme = useTheme() as ThemeType;

    const gradientColors = useMemo(
        () => [addOpacity(theme.textColor, 0.8), addOpacity(theme.textColor, 0.6)],
        [theme.textColor],
    );

    const gradientStyle = useMemo(
        () => ({borderRadius: theme.spacing.sm + 2, padding: theme.spacing.xs - 1}),
        [theme.spacing.sm, theme.spacing.xs],
    );

    const iconColor = useMemo(() => theme.white, [theme.white]);

    const onPickerConfirm = (newDate: Date) => {
        setCustomDate(newDate);
        setIsDateModalVisible(false);
    };

    return (
        <Container>
            <ButtonContainer>
                <LoadingIcon isLoading={isLoading} />
            </ButtonContainer>

            <ButtonContainer onPress={onGoBack} active={isToday} flex={1}>
                <LinearGradient
                    colors={gradientColors}
                    start={{x: 0, y: 0}}
                    end={{x: 1, y: 0}}
                    style={gradientStyle}>
                    <IconContainer>
                        <Icon name="chevron-back-outline" size={20} color={iconColor} />
                    </IconContainer>
                </LinearGradient>
            </ButtonContainer>

            <DateButton onPress={() => setIsDateModalVisible(true)}>
                <DateText>{date.toDateString()}</DateText>
            </DateButton>

            <DateTimePickerModal
                date={date}
                isVisible={isDateModalVisible}
                mode="date"
                is24Hour={true}
                maximumDate={new Date()}
                onConfirm={onPickerConfirm}
                onCancel={() => setIsDateModalVisible(false)}
            />

            <ButtonContainer onPress={onGoForward} disabled={isToday} flex={1}>
                <LinearGradient
                    colors={gradientColors}
                    start={{x: 0, y: 0}}
                    end={{x: 1, y: 0}}
                    style={gradientStyle}>
                    <IconContainer>
                        <Icon name="chevron-forward-outline" size={20} color={iconColor} />
                    </IconContainer>
                </LinearGradient>
            </ButtonContainer>

            <ButtonContainer
                onPress={resetToCurrentDate}
                disabled={isToday}
                flex={1}>
                <LinearGradient
                    colors={gradientColors}
                    start={{x: 0, y: 0}}
                    end={{x: 1, y: 0}}
                    style={gradientStyle}>
                    <IconContainer>
                        <Icon name="refresh-outline" size={20} color={iconColor} />
                    </IconContainer>
                </LinearGradient>
            </ButtonContainer>
        </Container>
    );
};

export default DateNavigatorRow;
