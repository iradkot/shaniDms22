import React from 'react';
import {Text, View, StyleSheet} from 'react-native';

const DigitalClock = ({time, color = '#FFFFFF', fontSize = 18}) => {
  return (
    <View style={styles.container}>
      <Text style={{color, fontSize, fontFamily: 'Courier'}}>{time}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default DigitalClock;
