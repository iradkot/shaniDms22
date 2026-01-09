import React from 'react';
import {Alert, Text, TouchableOpacity, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {theme} from 'app/style/theme';
import {NightscoutProfile} from 'app/services/nightscoutProfiles';
import {iconContainerStyle, rowStyle, SectionHeader} from '../settingsShared';

export function NightscoutSection(props: {
  expanded: boolean;
  onToggleExpanded: () => void;
  profiles: NightscoutProfile[];
  activeProfile: NightscoutProfile | null;
  onSelectProfile: (profileId: string) => void;
  onEditProfile: (profileId: string) => void;
  onDeleteProfile: (profileId: string) => void;
  onAddProfile: () => void;
}) {
  const {
    expanded,
    onToggleExpanded,
    profiles,
    activeProfile,
    onSelectProfile,
    onEditProfile,
    onDeleteProfile,
    onAddProfile,
  } = props;

  return (
    <View>
      <SectionHeader title="Nightscout" expanded={expanded} onToggle={onToggleExpanded} />

      {expanded && (
        <>
          <View style={rowStyle}>
            <View style={iconContainerStyle}>
              <MaterialIcons name="cloud" size={20} color={theme.textColor} />
            </View>
            <View style={{flex: 1, paddingRight: theme.spacing.md}}>
              <Text style={{color: theme.textColor, fontSize: theme.typography.size.md}}>
                Active profile
              </Text>
              <Text
                style={{
                  color: theme.textColor,
                  fontSize: theme.typography.size.sm,
                  opacity: 0.8,
                  marginTop: 2,
                }}
              >
                {activeProfile
                  ? `${activeProfile.label} (${activeProfile.baseUrl})`
                  : 'Not configured'}
              </Text>
            </View>
          </View>

          {profiles.map(p => {
            const isActive = activeProfile?.id === p.id;

            const confirmDelete = () => {
              Alert.alert(
                'Delete Nightscout profile?',
                `This will remove "${p.label}" from this device.`,
                [
                  {text: 'Cancel', style: 'cancel'},
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => onDeleteProfile(p.id),
                  },
                ],
              );
            };

            return (
              <View key={p.id} style={rowStyle}>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => onSelectProfile(p.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    flex: 1,
                    paddingRight: theme.spacing.md,
                  }}
                >
                  <View style={iconContainerStyle}>
                    <MaterialIcons
                      name={isActive ? 'radio-button-checked' : 'radio-button-unchecked'}
                      size={20}
                      color={theme.textColor}
                    />
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={{color: theme.textColor, fontSize: theme.typography.size.md}}>
                      {p.label}
                    </Text>
                    <Text
                      style={{
                        color: theme.textColor,
                        fontSize: theme.typography.size.sm,
                        opacity: 0.8,
                        marginTop: 2,
                      }}
                    >
                      {p.baseUrl}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => onEditProfile(p.id)}
                  style={{paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.sm}}
                >
                  <Text style={{color: theme.accentColor, fontWeight: '600'}}>Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={confirmDelete}
                  style={{paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.sm}}
                >
                  <Text style={{color: theme.belowRangeColor, fontWeight: '600'}}>Delete</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md}}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={onAddProfile}
              style={{
                paddingVertical: theme.spacing.md,
                paddingHorizontal: theme.spacing.lg,
                backgroundColor: theme.accentColor,
                borderRadius: theme.borderRadius,
                alignSelf: 'flex-start',
              }}
            >
              <Text style={{color: theme.buttonTextColor, fontWeight: '600'}}>
                Add Nightscout profile
              </Text>
            </TouchableOpacity>
          </View>

          {!profiles.length && (
            <Text
              style={{
                color: theme.textColor,
                fontSize: theme.typography.size.sm,
                opacity: 0.8,
                paddingHorizontal: theme.spacing.lg,
                paddingTop: theme.spacing.sm,
              }}
            >
              You need at least one Nightscout profile to view data.
            </Text>
          )}
        </>
      )}
    </View>
  );
}
