// simple react-native header component
import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {theme} from 'app/style/theme';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

const SportTrackerHeader = () => {
  const {language} = useAppLanguage();

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{tr(language, 'sport.trackerTitle')}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.accentColor,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: theme.textColor,
    fontSize: 20,
  },
});

export default SportTrackerHeader;
