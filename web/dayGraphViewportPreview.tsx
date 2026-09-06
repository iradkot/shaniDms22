import React, {useReducer, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {StyleSheet, Text, View, useWindowDimensions} from 'react-native';
import {ThemeProvider} from 'styled-components/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {getThemeById, APP_THEME_OPTIONS} from '../src/style/theme';
import type {AppThemeId} from '../src/style/theme';
import type {DayGraphDataSource} from '../src/modules/dayGraph';
import {
  CORE_DESTINATION_IDS,
  coreDestinationRegistry,
  createStoredDestinationTarget,
  type DestinationLocale,
} from '../src/product/destinations';
import {
  ProductShellView,
  createInitialProductShellState,
  productShellReducer,
  resolveProductShellConfiguration,
} from '../src/product/shell';
import {DayGraphModuleView} from '../src/product/dayGraph/DayGraphModuleView';
import {
  DEFAULT_DAY_GRAPH_PREFERENCES,
  type StoredDayGraphPreferences,
} from '../src/product/personalization/types';
import {DAY_START_MS, DAY_END_MS, MINUTE_MS, previewModel} from './dayGraphPreviewFixture';
import './styles.css';

// This fixture intentionally mounts the production shell, navigation, page,
// and module. No replacement layout or scrolling is used to make charts fit.
const query = new URLSearchParams(window.location.search);
const locale: DestinationLocale = query.get('locale') === 'en' ? 'en' : 'he';
const requestedTheme = query.get('theme');
const themeId: AppThemeId = APP_THEME_OPTIONS.some(item => item.id === requestedTheme)
  ? requestedTheme as AppThemeId
  : 'calmBlue';
const theme = getThemeById(themeId);
const runtime = {platform: 'web' as const};
const configuration = resolveProductShellConfiguration(
  coreDestinationRegistry,
  {
    schemaVersion: 1,
    startDestination: createStoredDestinationTarget(CORE_DESTINATION_IDS.dayGraph),
    shortcuts: [
      createStoredDestinationTarget(CORE_DESTINATION_IDS.updateCenter),
      createStoredDestinationTarget(CORE_DESTINATION_IDS.aiAnalyst),
    ],
  },
  runtime,
);
const dataSource: DayGraphDataSource = {
  loadDayGraph: async () => ({
    freshness: {kind: 'fresh', fetchedAtMs: DAY_END_MS - MINUTE_MS},
    glucoseSamples: previewModel.glucoseSamples,
    activeLoadSamples: previewModel.activeLoadSamples,
    timelineItems: previewModel.timelineItems,
    insulinEvents: previewModel.insulinEvents,
    basalSchedule: previewModel.basalSchedule,
  }),
};
const now = () => DAY_END_MS - MINUTE_MS;

const ViewportPreview = () => {
  const {height} = useWindowDimensions();
  const [state, dispatch] = useReducer(
    productShellReducer,
    configuration,
    createInitialProductShellState,
  );
  const [preferences, setPreferences] = useState<StoredDayGraphPreferences>(
    DEFAULT_DAY_GRAPH_PREFERENCES,
  );
  return (
    <ThemeProvider theme={theme}>
      <SafeAreaProvider style={[styles.safeArea, {height}]}>
        <View style={[styles.device, {backgroundColor: theme.backgroundColor}]} testID="viewport-device-frame">
          <View style={[styles.systemInset, {backgroundColor: theme.backgroundColor}]} testID="viewport-status-inset">
            <Text style={[styles.statusText, {color: theme.textColor}]}>
              {locale === 'he' ? '9:41 · נתוני הדגמה' : '9:41 · Synthetic data'}
            </Text>
          </View>
          <ProductShellView
            state={state}
            configuration={configuration}
            registry={coreDestinationRegistry}
            runtime={runtime}
            locale={locale}
            dispatch={dispatch}
            forceLayout="phone"
            palette={{
              background: theme.backgroundColor,
              surface: theme.white,
              surfaceActive: theme.secondaryColor,
              text: theme.textColor,
              secondaryText: theme.textColor,
              border: theme.borderColor,
              accent: theme.primaryColor,
            }}
            renderHub={() => <Text>{locale === 'he' ? 'מרכז' : 'Hub'}</Text>}
            renderDestination={() => (
              <DayGraphModuleView
                locale={locale}
                dataSource={dataSource}
                initialFocus={{kind: 'day', dayStartMs: DAY_START_MS}}
                now={now}
                expectedSampleIntervalMs={5 * MINUTE_MS}
                chartPreferences={{
                  scopeKey: 'viewport-fixture:phone',
                  layout: 'phone',
                  value: preferences,
                  onSave: async value => setPreferences(value),
                }}
              />
            )}
          />
          <View style={[styles.systemInset, {backgroundColor: theme.backgroundColor}]} testID="viewport-system-inset" />
        </View>
      </SafeAreaProvider>
    </ThemeProvider>
  );
};

const styles = StyleSheet.create({
  safeArea: {flex: 0},
  device: {height: '100%', width: '100%', overflow: 'hidden'},
  systemInset: {height: 24, flexShrink: 0, justifyContent: 'center'},
  statusText: {fontSize: 11, textAlign: 'center'},
});

document.documentElement.lang = locale;
document.documentElement.dataset.chartFixture = 'real-product-shell';
document.documentElement.dataset.chartTheme = themeId;
const root = document.getElementById('root');
if (!root) {throw new Error('The viewport fixture root is missing.');}
createRoot(root).render(<ViewportPreview />);
