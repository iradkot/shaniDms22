// Simplified time-based zoom controls positioned to avoid tooltip interference
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface ZoomControlsProps {
  // Zoom controls
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  
  // Pan controls for time navigation
  onPanLeft: () => void;
  onPanRight: () => void;
  
  // Control states
  canZoomIn: boolean;
  canZoomOut: boolean;
  canPanLeft: boolean;
  canPanRight: boolean;
  
  // Display state
  isZoomed: boolean;
  timeWindowText: string;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onReset,
  onPanLeft,
  onPanRight,
  canZoomIn,
  canZoomOut,
  canPanLeft,
  canPanRight,
  isZoomed,
  timeWindowText,
}) => {
  return (
    <View style={styles.container}>
      {/* Pan Left */}
      <TouchableOpacity
        style={[styles.button, !canPanLeft && styles.disabledButton]}
        onPress={onPanLeft}
        disabled={!canPanLeft}
        accessibilityRole="button"
        accessibilityLabel="Pan left to see earlier glucose data"
      >
        <Text style={[styles.buttonText, !canPanLeft && styles.disabledText]}>←</Text>
      </TouchableOpacity>
      
      {/* Zoom Out */}
      <TouchableOpacity
        style={[styles.button, !canZoomOut && styles.disabledButton]}
        onPress={onZoomOut}
        disabled={!canZoomOut}
        accessibilityRole="button"
        accessibilityLabel="Zoom out to see longer time period"
      >
        <Text style={[styles.buttonText, !canZoomOut && styles.disabledText]}>−</Text>
      </TouchableOpacity>
      
      {/* Time Window Indicator */}
      <View style={styles.indicator}>
        <Text style={styles.indicatorText}>{timeWindowText}</Text>
      </View>
      
      {/* Zoom In */}
      <TouchableOpacity
        style={[styles.button, !canZoomIn && styles.disabledButton]}
        onPress={onZoomIn}
        disabled={!canZoomIn}
        accessibilityRole="button"
        accessibilityLabel="Zoom in to examine shorter time period in detail"
      >
        <Text style={[styles.buttonText, !canZoomIn && styles.disabledText]}>+</Text>
      </TouchableOpacity>
      
      {/* Pan Right */}
      <TouchableOpacity
        style={[styles.button, !canPanRight && styles.disabledButton]}
        onPress={onPanRight}
        disabled={!canPanRight}
        accessibilityRole="button"
        accessibilityLabel="Pan right to see later glucose data"
      >
        <Text style={[styles.buttonText, !canPanRight && styles.disabledText]}>→</Text>
      </TouchableOpacity>
      
      {/* Reset (only when zoomed) */}
      {isZoomed && (
        <TouchableOpacity
          style={styles.resetButton}
          onPress={onReset}
          accessibilityRole="button"
          accessibilityLabel="Reset to show full day view"
        >
          <Text style={styles.resetText}>Reset</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 10,
    left: '50%',
    transform: [{ translateX: -100 }], // Approximate centering
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 100,
    gap: 8,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  disabledButton: {
    backgroundColor: '#E0E0E0',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  disabledText: {
    color: '#999999',
  },
  indicator: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginHorizontal: 4,
  },
  indicatorText: {
    color: '#333333',
    fontSize: 12,
    fontWeight: '600',
  },
  resetButton: {
    backgroundColor: '#FF5722',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 4,
  },
  resetText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default ZoomControls;
