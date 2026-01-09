import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {theme} from 'app/style/theme';

export const rowStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  paddingVertical: theme.spacing.md,
  paddingHorizontal: theme.spacing.lg,
  borderBottomWidth: 1,
  borderBottomColor: theme.borderColor,
};

export const iconContainerStyle = {
  width: 28,
  alignItems: 'center' as const,
  marginRight: theme.spacing.md,
};

export const labelStyle = {
  color: theme.textColor,
  fontSize: theme.typography.size.md,
  flex: 1,
  paddingRight: theme.spacing.md,
};

const sectionHeaderRowStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
};

const sectionHeaderTextStyle = {
  color: theme.textColor,
  fontSize: theme.typography.size.lg,
  fontWeight: '600' as const,
};

const sectionHeaderContainerStyle = {
  paddingHorizontal: theme.spacing.lg,
  paddingTop: theme.spacing.lg,
  paddingBottom: theme.spacing.sm,
};

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
      style={sectionHeaderContainerStyle}
      hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
    >
      <View style={sectionHeaderRowStyle}>
        <Text style={sectionHeaderTextStyle}>{title}</Text>
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={24}
          color={theme.textColor}
        />
      </View>
    </TouchableOpacity>
  );
}
