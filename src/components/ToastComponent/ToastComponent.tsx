// ToastComponent.js
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, Text, StyleSheet } from 'react-native';

const ToastComponent = ({ isVisible, message }) => {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isVisible) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        easing: Easing.ease,
        useNativeDriver: true,
      }).start(() => {
        setTimeout(() => {
          Animated.timing(opacity, {
            toValue: 0,
            duration: 300,
            easing: Easing.ease,
            useNativeDriver: true,
          }).start();
        }, 2000);
      });
    }
  }, [isVisible, opacity]);

  return (
    <Animated.View style={[styles.toastContainer, { opacity }]}>
  <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
);
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 5,
    padding: 10,
    zIndex: 999,
  },
  toastText: {
    color: '#fff',
    fontSize: 16,
  },
});

export default ToastComponent;
