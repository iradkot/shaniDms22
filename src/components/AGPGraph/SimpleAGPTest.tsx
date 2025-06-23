// Simple AGP Test Component

import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import AGPGraph, { EnhancedAGPGraph } from '../AGPGraph';
import { BgSample } from 'app/types/day_bgs.types';

// Generate sample BG data for testing
const generateSampleBgData = (): BgSample[] => {
  const samples: BgSample[] = [];
  const now = new Date();
  
  // Generate 14 days of sample data
  for (let day = 0; day < 14; day++) {
    const dayStart = new Date(now.getTime() - (day * 24 * 60 * 60 * 1000));
    
    // Generate readings every 5 minutes for each day
    for (let minutes = 0; minutes < 1440; minutes += 5) {
      const time = new Date(dayStart.getTime() + (minutes * 60 * 1000));
      
      // Create realistic glucose patterns
      const timeOfDay = minutes / 60; // hours from midnight
      let baseGlucose = 120;
      
      // Add meal spikes
      if (timeOfDay >= 7 && timeOfDay <= 9) baseGlucose += 40; // Breakfast
      if (timeOfDay >= 12 && timeOfDay <= 14) baseGlucose += 35; // Lunch
      if (timeOfDay >= 18 && timeOfDay <= 20) baseGlucose += 45; // Dinner
      
      // Add circadian variation
      if (timeOfDay >= 3 && timeOfDay <= 6) baseGlucose -= 20; // Dawn phenomenon inverse
      if (timeOfDay >= 22 || timeOfDay <= 2) baseGlucose += 10; // Evening rise
      
      // Add random variation
      const glucose = Math.max(50, Math.min(300, 
        baseGlucose + (Math.random() - 0.5) * 60
      ));
      
      samples.push({
        sgv: Math.round(glucose),
        date: time.getTime(),
        dateString: time.toISOString(),
        trend: 4, // Flat
        direction: 'Flat',
        device: 'test',
        type: 'sgv'
      });
    }
  }
  
  return samples;
};

const SimpleAGPTest: React.FC = () => {
  const sampleData = generateSampleBgData();
  
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F5F5F5' }}>
      <View style={{ padding: 16 }}>
        <Text style={{ 
          fontSize: 20, 
          fontWeight: 'bold', 
          textAlign: 'center',
          marginBottom: 20,
          color: '#333'
        }}>
          AGP Graph Test
        </Text>
        
        <Text style={{ 
          fontSize: 14, 
          color: '#666',
          textAlign: 'center',
          marginBottom: 20
        }}>
          Generated {sampleData.length} sample readings over 14 days
        </Text>
        
        {/* Basic AGP Graph */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ 
            fontSize: 16, 
            fontWeight: 'bold',
            marginBottom: 10,
            color: '#333'
          }}>
            Basic AGP Graph
          </Text>
          <AGPGraph 
            bgData={sampleData}
            width={350}
            height={250}
            showStatistics={true}
            showLegend={true}
          />
        </View>
        
        {/* Enhanced AGP Graph */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ 
            fontSize: 16, 
            fontWeight: 'bold',
            marginBottom: 10,
            color: '#333'
          }}>
            Enhanced AGP Graph
          </Text>
          <EnhancedAGPGraph 
            bgData={sampleData}
            width={350}
            height={250}
            showStatistics={true}
            showLegend={true}
          />
        </View>
        
        {/* Compact Mode */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ 
            fontSize: 16, 
            fontWeight: 'bold',
            marginBottom: 10,
            color: '#333'
          }}>
            Compact Mode
          </Text>
          <EnhancedAGPGraph 
            bgData={sampleData}
            width={320}
            height={180}
            compactMode={true}
          />
        </View>
      </View>
    </ScrollView>
  );
};

export default SimpleAGPTest;
