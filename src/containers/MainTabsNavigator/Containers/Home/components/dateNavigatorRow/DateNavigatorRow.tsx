import React, {FC, useState} from 'react';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import {ButtonContainer, Container, DateButton, DateText, IconContainer,} from './DateNavigatorRow.style';
import LoadingIcon from '../../../../../../components/LoadingIcon';
import {Platform} from "react-native";

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

    const onPickerConfirm = (newDate: Date) => {
        setCustomDate(newDate);
        setIsDateModalVisible(false);
    };
    return (
        <Container>
            <ButtonContainer>
                <LoadingIcon isLoading={isLoading}/>
            </ButtonContainer>
            <ButtonContainer onPress={onGoBack} active={isToday} flex={1}>
                <LinearGradient
                    colors={['#333', '#666']}
                    start={{x: 0, y: 0}}
                    end={{x: 1, y: 0}}
                    style={{borderRadius: 10, padding: 5}}>
                    <IconContainer>
                        <Icon name='chevron-back-outline'
                                  size={20} color="#fff"/>
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
                    colors={['#333', '#666']}
                    start={{x: 0, y: 0}}
                    end={{x: 1, y: 0}}
                    style={{borderRadius: 10, padding: 5}}>
                    <IconContainer>
                        <Icon name='chevron-forward-outline'
                                  size={20} color="#fff"/>
                    </IconContainer>
                </LinearGradient>
            </ButtonContainer>
            <ButtonContainer onPress={resetToCurrentDate} disabled={isToday} flex={1}>
                <LinearGradient
                    colors={['#333', '#666']}
                    start={{x: 0, y: 0}}
                    end={{x: 1, y: 0}}
                    style={{borderRadius: 10, padding: 5}}>
                    <IconContainer>
                        <Icon
                            name='refresh-outline'
                            size={20} color="#fff"/>
                    </IconContainer>
                </LinearGradient>
            </ButtonContainer>
        </Container>
    );
};

export default DateNavigatorRow;
