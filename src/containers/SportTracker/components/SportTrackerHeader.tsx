// simple react-native header component
import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {theme} from 'app/style/theme';

const SportTrackerHeader = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Sport Tracker</Text>
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
