import React from 'react';
import {Modal, View, Text, TouchableOpacity} from 'react-native';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';
import {useTheme} from 'styled-components/native';
import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';

interface NotificationModalProps {
  visible: boolean;
  title?: string;
  body?: string;
  onClose: () => void;
}

const NotificationModal: React.FC<NotificationModalProps> = ({
  visible,
  title,
  body,
  onClose,
}) => {
  const {language} = useAppLanguage();
  const theme = useTheme() as ThemeType;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: addOpacity(theme.black, 0.5),
          justifyContent: 'center',
          alignItems: 'center',
        }}>
        <View
          style={{
            width: '80%',
            backgroundColor: theme.white,
            borderRadius: theme.borderRadius,
            padding: 20,
            elevation: 5,
          }}>
          <Text
            style={{
              color: theme.textColor,
              fontSize: 18,
              fontWeight: 'bold',
              marginBottom: 10,
            }}>
            {title || tr(language, 'systemModal.notificationTitleFallback')}
          </Text>
          {body ? (
            <Text style={{color: theme.textColor, fontSize: 16, marginBottom: 20}}>{body}</Text>
          ) : null}
          <TouchableOpacity onPress={onClose} style={{alignSelf: 'flex-end', paddingHorizontal: 10, paddingVertical: 6}}>
            <Text style={{color: theme.accentColor, fontSize: 16}}>{tr(language, 'common.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default NotificationModal;
