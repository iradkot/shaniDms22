import React from 'react';
import {ScrollView, Switch, Text, View} from 'react-native';
import {theme} from 'app/style/theme';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {useTabsSettings} from 'app/contexts/TabsSettingsContext';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import ADIcon from 'react-native-vector-icons/AntDesign';

const rowStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  paddingVertical: theme.spacing.md,
  paddingHorizontal: theme.spacing.lg,
  borderBottomWidth: 1,
  borderBottomColor: theme.borderColor,
};

const iconContainerStyle = {
  width: 28,
  alignItems: 'center' as const,
  marginRight: theme.spacing.md,
};

const labelStyle = {
  color: theme.textColor,
  fontSize: theme.typography.size.md,
  flex: 1,
  paddingRight: theme.spacing.md,
};

const sectionTitleStyle = {
  color: theme.textColor,
  fontSize: theme.typography.size.lg,
  fontWeight: '600' as const,
  paddingHorizontal: theme.spacing.lg,
  paddingTop: theme.spacing.lg,
  paddingBottom: theme.spacing.sm,
};

const Settings: React.FC = () => {
  const {settings, setSetting} = useTabsSettings();

  return (
    <ScrollView
      testID={E2E_TEST_IDS.screens.settings}
      contentContainerStyle={{
        paddingBottom: theme.spacing.xl,
        backgroundColor: theme.backgroundColor,
      }}
      style={{flex: 1, backgroundColor: theme.backgroundColor}}
    >
      <View style={{paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg}}>
        <Text
          style={{
            color: theme.textColor,
            fontSize: theme.typography.size.xl,
            fontWeight: '600',
            marginBottom: theme.spacing.md,
          }}
        >
          Settings
        </Text>
        <Text
          style={{
            color: theme.textColor,
            fontSize: theme.typography.size.sm,
            opacity: 0.8,
            marginBottom: theme.spacing.lg,
          }}
        >
          Choose which tabs are visible in the bottom bar.
        </Text>
      </View>

      <View>
        <Text style={sectionTitleStyle}>Displayed Tabs</Text>

        <View style={rowStyle}>
          <View style={iconContainerStyle}>
            <MaterialIcons name="home" size={20} color={theme.textColor} />
          </View>
          <Text style={labelStyle}>Home</Text>
          <Switch value={true} disabled={true} />
        </View>

        <View style={rowStyle}>
          <View style={iconContainerStyle}>
            <MaterialIcons name="timeline" size={20} color={theme.textColor} />
          </View>
          <Text style={labelStyle}>Trends</Text>
          <Switch value={true} disabled={true} />
        </View>

        <View style={rowStyle}>
          <View style={iconContainerStyle}>
            <MaterialIcons name="settings" size={20} color={theme.textColor} />
          </View>
          <Text style={labelStyle}>Settings</Text>
          <Switch value={true} disabled={true} />
        </View>

        <View style={rowStyle}>
          <View style={iconContainerStyle}>
            <MaterialIcons name="fastfood" size={20} color={theme.textColor} />
          </View>
          <Text style={labelStyle}>Food Tracking</Text>
          <Switch
            testID={E2E_TEST_IDS.settings.toggleFoodTab}
            value={settings.showFoodTracking}
            onValueChange={v => setSetting('showFoodTracking', v)}
          />
        </View>

        <View style={rowStyle}>
          <View style={iconContainerStyle}>
            <MaterialIcons
              name="directions-run"
              size={20}
              color={theme.textColor}
            />
          </View>
          <Text style={labelStyle}>Sport Tracking</Text>
          <Switch
            testID={E2E_TEST_IDS.settings.toggleSportTab}
            value={settings.showSportTracking}
            onValueChange={v => setSetting('showSportTracking', v)}
          />
        </View>

        <View style={rowStyle}>
          <View style={iconContainerStyle}>
            <ADIcon name="notification" size={20} color={theme.textColor} />
          </View>
          <Text style={labelStyle}>Notifications</Text>
          <Switch
            testID={E2E_TEST_IDS.settings.toggleNotificationsTab}
            value={settings.showNotifications}
            onValueChange={v => setSetting('showNotifications', v)}
          />
        </View>
      </View>
    </ScrollView>
  );
};

export default Settings;
