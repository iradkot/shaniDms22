import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {theme} from 'app/style/theme';

export const getRowStyle = () => ({
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  paddingVertical: theme.spacing.md,
  paddingHorizontal: theme.spacing.lg,
  borderBottomWidth: 1,
  borderBottomColor: theme.borderColor,
});

export const getIconContainerStyle = () => ({
  width: 28,
  alignItems: 'center' as const,
  marginRight: theme.spacing.md,
});

export const getLabelStyle = () => ({
  color: theme.textColor,
  fontSize: theme.typography.size.md,
  flex: 1,
  paddingRight: theme.spacing.md,
});

/** Collapsible section header used by Settings. */
export function SectionHeader(props: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const {title, expanded, onToggle} = props;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onToggle}
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.lg,
        paddingBottom: theme.spacing.sm,
      }}
      hitSlop={{
        top: theme.spacing.sm,
        bottom: theme.spacing.sm,
        left: theme.spacing.sm,
        right: theme.spacing.sm,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            color: theme.textColor,
            fontSize: theme.typography.size.lg,
            fontWeight: '600',
          }}
        >
          {title}
        </Text>
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={theme.typography.size.xxl}
          color={theme.textColor}
        />
      </View>
    </TouchableOpacity>
  );
}
