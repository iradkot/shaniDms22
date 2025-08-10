// AGP Legend Component

import React from 'react';
import { View } from 'react-native';
import { AGPLegendProps } from '../types/agp.types';
import { AGP_PERCENTILE_COLORS } from '../utils/constants';
import { LegendContainer, LegendRow, LegendColor, LegendLabel } from '../styles/components.styles';

const AGPLegend: React.FC<AGPLegendProps> = ({
  ranges,
  horizontal = false
}) => {
  const legendItems = [
    { color: AGP_PERCENTILE_COLORS.median, label: '50th percentile (Median)', type: 'line' },
    { color: AGP_PERCENTILE_COLORS.p25_p75, label: '25th-75th percentile', type: 'area' },
    { color: AGP_PERCENTILE_COLORS.p5_p95, label: '5th-95th percentile', type: 'area' },
    { color: ranges.target.color, label: `Target Range (${ranges.target.min}-${ranges.target.max} mg/dL)`, type: 'range' }
  ];
  
  const glucoseRanges = [
    { color: ranges.veryLow.color, label: ranges.veryLow.label },
    { color: ranges.low.color, label: ranges.low.label },
    { color: ranges.target.color, label: ranges.target.label },
    { color: ranges.high.color, label: ranges.high.label },
    { color: ranges.veryHigh.color, label: ranges.veryHigh.label }
  ];
  
  return (
    <LegendContainer>
      {/* AGP Percentile Legend */}
      <View style={{ marginBottom: 12 }}>
        <LegendLabel style={{ fontWeight: 'bold', marginBottom: 8 }}>
          AGP Percentiles
        </LegendLabel>
        {legendItems.map((item, index) => (
          <LegendRow key={index}>
            <View style={{ 
              width: 16, 
              height: 16, 
              marginRight: 8,
              borderRadius: 2
            }}>
              {item.type === 'line' ? (
                <View style={{
                  width: '100%',
                  height: 2,
                  backgroundColor: item.color,
                  marginTop: 7
                }} />
              ) : item.type === 'area' ? (
                <LegendColor color={item.color} />
              ) : (
                <View style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: item.color,
                  opacity: 0.3,
                  borderRadius: 2,
                  borderWidth: 1,
                  borderColor: item.color
                }} />
              )}
            </View>
            <LegendLabel>{item.label}</LegendLabel>
          </LegendRow>
        ))}
      </View>
      
      {/* Glucose Range Legend */}
      <View>
        <LegendLabel style={{ fontWeight: 'bold', marginBottom: 8 }}>
          Glucose Ranges
        </LegendLabel>
        <View style={{ 
          flexDirection: horizontal ? 'row' : 'column',
          flexWrap: horizontal ? 'wrap' : 'nowrap'
        }}>
          {glucoseRanges.map((range, index) => (
            <LegendRow 
              key={index}
              style={{ 
                flex: horizontal ? 0 : 1,
                marginRight: horizontal ? 12 : 0,
                marginBottom: horizontal ? 4 : 6
              }}
            >
              <LegendColor color={range.color} />
              <LegendLabel style={{ 
                fontSize: horizontal ? 10 : 12 
              }}>
                {range.label}
              </LegendLabel>
            </LegendRow>
          ))}
        </View>
      </View>
    </LegendContainer>
  );
};

export default AGPLegend;
